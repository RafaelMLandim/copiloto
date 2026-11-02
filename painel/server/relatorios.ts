// Relatórios.
//
// SEMANAL (sábado a sexta; nunca atravessa o mês — se o sábado for do mês anterior, começa no dia 1):
//   o Claude abre o Gerenciador de cada cliente, filtra as campanhas ATIVAS, escolhe o período,
//   exporta a tabela (.csv) e salva em clientes/<cliente>/relatorios/. O painel lê o arquivo e guarda o relatório.
//
// MENSAL — junta os relatórios semanais salvos dentro do mês. Os dias que nenhum relatório cobriu
//   (ex.: do último sábado até o último dia do mês) viram uma exportação de complemento.
//
// Alternativa opcional: com token do Meta e fonte "meta-api" nas Configurações, usa a API em vez da exportação.
import fs from 'node:fs';
import path from 'node:path';
import { CLIENTES_DIR, RAIZ, db, novoId } from './db.ts';
import { listarClientes } from './clientes.ts';
import { perguntarClaude } from './claude.ts';
import { enviarWhatsapp } from './whatsapp.ts';
import { lerExportacao } from './exportacao.ts';
import type { ClienteResumo, Metricas, MetricasCampanha, Relatorio, RelatorioCliente, TipoRelatorio } from '../shared/tipos.ts';

// ---------- Datas ----------

export function iso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function somarDias(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
const dia = (s: string) => new Date(s + 'T12:00:00');
export function ultimoDiaDoMes(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate() === d.getDate();
}
function diasEntre(inicio: string, fim: string) {
  const out: string[] = [];
  for (let d = dia(inicio); iso(d) <= fim; d = somarDias(d, 1)) out.push(iso(d));
  return out;
}
/** Agrupa dias soltos em períodos contínuos. */
function emPeriodos(dias: string[]) {
  const out: Periodo[] = [];
  for (const d of [...dias].sort()) {
    const ult = out.at(-1);
    if (ult && iso(somarDias(dia(ult.fim), 1)) === d) ult.fim = d;
    else out.push({ inicio: d, fim: d });
  }
  return out;
}

type Periodo = { inicio: string; fim: string };

/**
 * Semana de sábado a sexta, terminando na última sexta (hoje, se for sexta).
 * Nunca atravessa a virada do mês: se o sábado cair no mês anterior, começa no dia 1.
 * (Os dias do fim do mês depois da última sexta entram no mensal como complemento.)
 */
export function periodoSemanal(ref = new Date()): Periodo {
  const sexta = somarDias(ref, -((ref.getDay() + 2) % 7));
  let sabado = somarDias(sexta, -6);
  if (sabado.getMonth() !== sexta.getMonth()) sabado = new Date(sexta.getFullYear(), sexta.getMonth(), 1);
  return { inicio: iso(sabado), fim: iso(sexta) };
}

/** No último dia do mês = mês corrente; em qualquer outro dia = mês anterior. */
export function periodoMensal(ref = new Date()): Periodo {
  const base = ultimoDiaDoMes(ref) ? ref : new Date(ref.getFullYear(), ref.getMonth() - 1, 1);
  return { inicio: iso(new Date(base.getFullYear(), base.getMonth(), 1)), fim: iso(new Date(base.getFullYear(), base.getMonth() + 1, 0)) };
}

// ---------- Métricas ----------

const vazio = (): Metricas => ({ investido: 0, impressoes: 0, alcance: 0, cliques: 0, ctr: 0, cpm: 0, conversas: 0, leads: 0, resultados: 0, custoPorResultado: null });

function completar(m: Metricas): Metricas {
  const resultados = m.conversas + m.leads;
  return {
    ...m,
    resultados,
    ctr: m.impressoes ? (m.cliques / m.impressoes) * 100 : 0,
    cpm: m.impressoes ? (m.investido / m.impressoes) * 1000 : 0,
    custoPorResultado: resultados ? m.investido / resultados : null,
  };
}

function somar(lista: Metricas[]): Metricas {
  const t = vazio();
  for (const m of lista) {
    t.investido += m.investido;
    t.impressoes += m.impressoes;
    t.alcance += m.alcance;
    t.cliques += m.cliques;
    t.conversas += m.conversas;
    t.leads += m.leads;
  }
  t.investido = Math.round(t.investido * 100) / 100;
  return completar(t);
}

function juntarCampanhas(lista: MetricasCampanha[]): MetricasCampanha[] {
  const por = new Map<string, MetricasCampanha[]>();
  for (const c of lista) por.set(c.nome, [...(por.get(c.nome) ?? []), c]);
  return [...por.entries()].map(([nome, cs]) => ({ nome, status: cs.at(-1)?.status, ...somar(cs) })).sort((a, b) => b.investido - a.investido);
}

type Coleta = { total: Metricas; campanhas: MetricasCampanha[]; arquivo?: string } | { erro: string };

// ---------- Fonte: API do Meta (opcional) ----------

async function graph(caminho: string, params: Record<string, string>) {
  const { accessToken, versaoApi } = db.config().meta;
  const url = new URL(`https://graph.facebook.com/${versaoApi}/${caminho}`);
  for (const [k, val] of Object.entries({ ...params, access_token: accessToken })) url.searchParams.set(k, val);
  const r = await fetch(url);
  const j: any = await r.json();
  if (!r.ok || j.error) throw new Error(j.error?.message ?? `Erro ${r.status} na API do Meta`);
  return j;
}

function linhaMeta(l: any): Metricas {
  const valor = (tipo: string) => Number(l.actions?.find((a: any) => a.action_type === tipo)?.value ?? 0);
  return completar({
    ...vazio(),
    investido: Number(l.spend ?? 0),
    impressoes: Number(l.impressions ?? 0),
    alcance: Number(l.reach ?? 0),
    cliques: Number(l.inline_link_clicks ?? l.clicks ?? 0),
    conversas: valor('onsite_conversion.messaging_conversation_started_7d'),
    leads: Math.max(valor('lead'), valor('onsite_conversion.lead_grouped'), valor('offsite_conversion.fb_pixel_lead')),
  });
}

async function viaMetaApi(contaId: string, p: Periodo): Promise<Coleta> {
  const time_range = JSON.stringify({ since: p.inicio, until: p.fim });
  const campos = 'spend,impressions,reach,clicks,inline_link_clicks,actions';
  const [conta, camp] = await Promise.all([
    graph(`act_${contaId}/insights`, { level: 'account', fields: campos, time_range }),
    graph(`act_${contaId}/insights`, { level: 'campaign', fields: 'campaign_name,' + campos, time_range, limit: '200' }),
  ]);
  return {
    total: conta.data?.[0] ? linhaMeta(conta.data[0]) : completar(vazio()),
    campanhas: (camp.data ?? []).map((l: any) => ({ nome: l.campaign_name, ...linhaMeta(l) })).filter((c: MetricasCampanha) => c.investido > 0),
  };
}

// ---------- Fonte: exportação do Gerenciador pelo Claude (padrão) ----------

const nomeArquivo = (slug: string, p: Periodo) => `clientes/${slug}/relatorios/${p.inicio}_${p.fim}.csv`;

function extrairJson(txt: string): any {
  const bloco = txt.match(/```(?:json)?\s*([\s\S]*?)```/)?.[1] ?? txt;
  const ini = Math.min(...['[', '{'].map((c) => bloco.indexOf(c)).filter((i) => i >= 0));
  if (!Number.isFinite(ini)) throw new Error('O Claude não devolveu o resumo em JSON');
  return JSON.parse(bloco.slice(ini, Math.max(bloco.lastIndexOf(']'), bloco.lastIndexOf('}')) + 1));
}

async function viaExportacao(contas: ClienteResumo[], periodos: Periodo[]): Promise<Map<string, Coleta>> {
  for (const c of contas) fs.mkdirSync(path.join(CLIENTES_DIR, c.slug, 'relatorios'), { recursive: true });
  const fmt = (p: Periodo) => `${p.inicio} até ${p.fim}`;
  const tarefas = contas.flatMap((c) => periodos.map((p) => ({ c, p })));

  const prompt = `Tarefa automática do Painel Copiloto: RELATÓRIO. É SOMENTE LEITURA + exportação.
NÃO edite, publique, pause, ative, duplique nem exclua nada. Não mexa em fichas nem no INDICE.md.
O usuário autorizou baixar o arquivo de exportação do Gerenciador de Anúncios para este relatório.

Use o navegador (Browser 1, conforme CLAUDE.md). Para CADA cliente e CADA período da lista:
1. Abra https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=<ID> e confira na tela se a conta é a certa.
2. Na aba Campanhas, filtre as campanhas ATIVAS e marque (selecione) essas campanhas.
3. Escolha o período personalizado exato (data inicial e final inclusive).
4. Garanta que a tabela mostre: Nome da campanha, Valor usado, Impressões, Alcance, Cliques no link, Resultados,
   Indicador de resultados, e se possível "Conversas por mensagem iniciadas" e "Leads"
   (se precisar personalizar colunas, NÃO salve como predefinição).
5. Exportar → "Exportar dados da tabela" → formato .csv → Exportar.
6. Mova o arquivo baixado (o mais recente da pasta Downloads do usuário) para o caminho indicado abaixo,
   relativo à pasta Copiloto (sobrescreva se já existir).
7. Anote também o alcance da linha de total (resumo "Resultados de N campanhas") como alcanceTotal.
Se uma conta não tiver campanha ativa no período, não exporte: devolva campanhas vazias.

Lista:
${tarefas.map(({ c, p }) => `- ${c.slug} · ${c.nome} · act=${c.contaId} · período ${fmt(p)} → ${nomeArquivo(c.slug, p)}`).join('\n')}

No final, responda APENAS com um bloco \`\`\`json contendo um array com um item por linha da lista:
[{"slug":"...","inicio":"AAAA-MM-DD","fim":"AAAA-MM-DD","arquivo":"clientes/.../....csv ou null","alcanceTotal":0,"erro":null,
  "campanhas":[{"nome":"...","investido":0,"impressoes":0,"alcance":0,"cliques":0,"conversas":0,"leads":0}]}]
(números puros, ponto decimal, sem "R$"). Se não conseguir uma conta, preencha "erro" com o motivo.`;

  const bruto = extrairJson(await perguntarClaude(prompt, (10 + tarefas.length * 4) * 60_000));
  const saida = new Map<string, Coleta>();
  for (const item of Array.isArray(bruto) ? bruto : [bruto]) {
    if (!item?.slug || !item.inicio || !item.fim) continue;
    const chave = `${item.slug}|${item.inicio}|${item.fim}`;
    if (item.erro) {
      saida.set(chave, { erro: String(item.erro) });
      continue;
    }
    // 1º: o próprio arquivo exportado (mais confiável); 2º: os números que o Claude leu da tela
    const candidato = [item.arquivo, nomeArquivo(item.slug, item)].filter(Boolean).map((a: string) => path.resolve(RAIZ, a)).find((a) => fs.existsSync(a));
    let campanhas: MetricasCampanha[] | undefined;
    if (candidato) {
      try {
        campanhas = lerExportacao(candidato).campanhas;
      } catch (e: any) {
        console.warn('[relatorio] não consegui ler', candidato, e.message);
      }
    }
    campanhas ??= (item.campanhas ?? []).map((c: any) =>
      ({ nome: String(c.nome ?? ''), ...completar({ ...vazio(), investido: +c.investido || 0, impressoes: +c.impressoes || 0, alcance: +c.alcance || 0, cliques: +c.cliques || 0, conversas: +c.conversas || 0, leads: +c.leads || 0 }) }),
    );
    const total = somar(campanhas!);
    if (+item.alcanceTotal > 0) total.alcance = +item.alcanceTotal;
    saida.set(chave, { total, campanhas: campanhas!, arquivo: candidato ? path.relative(CLIENTES_DIR, candidato).replace(/\\/g, '/') : undefined });
  }
  return saida;
}

async function coletar(contas: ClienteResumo[], periodos: Periodo[]): Promise<{ dados: Map<string, Coleta>; fonte: Relatorio['fonte'] }> {
  const cfg = db.config();
  const dados = new Map<string, Coleta>();
  if (!contas.length || !periodos.length) return { dados, fonte: 'exportacao' };
  if (cfg.relatorios.fonte === 'meta-api' && cfg.meta.accessToken.trim()) {
    await Promise.all(
      contas.flatMap((c) =>
        periodos.map(async (p) => {
          dados.set(`${c.slug}|${p.inicio}|${p.fim}`, await viaMetaApi(c.contaId, p).catch((e) => ({ erro: e.message })));
        }),
      ),
    );
    return { dados, fonte: 'meta-api' };
  }
  return { dados: await viaExportacao(contas, periodos), fonte: 'exportacao' };
}

// ---------- Texto para WhatsApp ----------

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const num = (n: number) => Math.round(n).toLocaleString('pt-BR');
const dataBr = (s: string) => s.split('-').reverse().slice(0, 2).join('/');
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

export function tituloPeriodo(tipo: TipoRelatorio, inicio: string, fim: string) {
  if (tipo === 'mensal') {
    const [a, m] = inicio.split('-').map(Number);
    return `${MESES[m - 1]} de ${a}`;
  }
  return inicio === fim ? dataBr(inicio) : `${dataBr(inicio)} a ${dataBr(fim)}`;
}

function blocoCliente(c: RelatorioCliente, mensal: boolean) {
  if (c.erro && !c.total.investido) return `*${c.clienteNome}*\n⚠️ Não consegui ler os dados: ${c.erro}`;
  const t = c.total;
  if (!t.investido && !t.impressoes) return `*${c.clienteNome}*\n⏸️ Sem veiculação no período.`;
  const linhas = [
    `*${c.clienteNome}*`,
    `💰 Investido: ${brl(t.investido)}`,
    `👀 Alcance${mensal ? ' (soma)' : ''}: ${num(t.alcance)} · Impressões: ${num(t.impressoes)}`,
    `🖱️ Cliques: ${num(t.cliques)} · CTR ${t.ctr.toFixed(2).replace('.', ',')}%`,
  ];
  if (t.conversas) linhas.push(`💬 Conversas: ${num(t.conversas)} (${brl(t.investido / t.conversas)} cada)`);
  if (t.leads) linhas.push(`📝 Leads: ${num(t.leads)} (${brl(t.investido / t.leads)} cada)`);
  if (mensal && c.partes?.length) {
    const semanas = c.partes.filter((p) => p.tipo !== 'complemento');
    const outros = c.partes.filter((p) => p.tipo === 'complemento');
    linhas.push('_Por semana:_');
    for (const p of semanas) linhas.push(`• ${dataBr(p.inicio)}–${dataBr(p.fim)}: ${brl(p.investido)} · ${num(p.resultados)} result.`);
    if (outros.length) {
      const inv = outros.reduce((s, p) => s + p.investido, 0);
      const res = outros.reduce((s, p) => s + p.resultados, 0);
      linhas.push(`• Demais dias do mês: ${brl(inv)} · ${num(res)} result.`);
    }
  }
  const top = c.campanhas.filter((x) => x.investido > 0).slice(0, 3);
  if (top.length > 1) {
    linhas.push('_Por campanha:_');
    for (const x of top) linhas.push(`• ${x.nome}: ${brl(x.investido)}${x.resultados ? ` · ${num(x.resultados)} result. (${brl(x.custoPorResultado ?? 0)})` : ''}`);
  }
  if (c.erro) linhas.push(`⚠️ Dados incompletos: ${c.erro}`);
  return linhas.join('\n');
}

export function montarTexto(r: Pick<Relatorio, 'tipo' | 'inicio' | 'fim' | 'clientes'>, soCliente?: string) {
  const clientes = soCliente ? r.clientes.filter((c) => c.clienteSlug === soCliente) : r.clientes;
  const titulo = { mensal: 'Relatório mensal', semanal: 'Relatório semanal', personalizado: 'Relatório', complemento: 'Complemento' }[r.tipo];
  const partes = [`📊 *${titulo}* — ${tituloPeriodo(r.tipo, r.inicio, r.fim)}`, ...clientes.map((c) => blocoCliente(c, r.tipo === 'mensal'))];
  if (!soCliente && clientes.length > 1) {
    const tot = clientes.reduce((s, c) => s + (c.total?.investido ?? 0), 0);
    const res = clientes.reduce((s, c) => s + (c.total?.resultados ?? 0), 0);
    partes.push(`*Total geral:* ${brl(tot)} investidos · ${num(res)} resultados${res ? ` (${brl(tot / res)} cada)` : ''}`);
  }
  partes.push('_Gerado pelo Copiloto_');
  return partes.join('\n\n');
}

// ---------- Geração ----------

function clientesAlvo(lista?: string[]) {
  return listarClientes().filter((c) => (lista?.length ? lista.includes(c.slug) : c.status === 'ativo' && c.extras.incluirRelatorio !== false));
}

function montarRelatorio(tipo: TipoRelatorio, p: Periodo, alvo: ClienteResumo[], dados: Map<string, Coleta>, fonte: Relatorio['fonte'], automatico: boolean): Relatorio {
  const clientes: RelatorioCliente[] = alvo.map((c) => {
    const r = dados.get(`${c.slug}|${p.inicio}|${p.fim}`);
    const ok = r && !('erro' in r) ? r : undefined;
    return {
      clienteSlug: c.slug,
      clienteNome: c.nome,
      contaId: c.contaId,
      total: ok?.total ?? completar(vazio()),
      campanhas: ok?.campanhas ?? [],
      arquivo: ok?.arquivo,
      erro: !c.contaId ? 'ficha sem ID da conta de anúncios' : r && 'erro' in r ? r.erro : r ? undefined : 'sem resposta',
    };
  });
  const rel: Relatorio = { id: novoId(), tipo, ...p, geradoEm: new Date().toISOString(), fonte, clientes, texto: '', envios: [], automatico };
  rel.texto = montarTexto(rel);
  return rel;
}

/** Relatório em que nenhum cliente trouxe dados (ex.: Chrome desconectado). Não conta como feito nem entra na soma. */
export function relatorioFalhou(r: Relatorio) {
  return r.clientes.length > 0 && r.clientes.every((c) => c.erro && !c.total.investido && !c.total.impressoes);
}

/** Relatórios salvos que podem entrar na soma (o mais recente vence quando o período se repete). */
function salvosNoPeriodo(p: Periodo) {
  return db
    .relatorios()
    .filter((r) => r.tipo !== 'mensal' && r.inicio >= p.inicio && r.fim <= p.fim && !relatorioFalhou(r))
    .sort((a, b) => b.geradoEm.localeCompare(a.geradoEm));
}

function diasCobertos(p: Periodo) {
  const cobertos = new Set<string>();
  const usados: Relatorio[] = [];
  for (const r of salvosNoPeriodo(p)) {
    const ds = diasEntre(r.inicio, r.fim);
    if (ds.some((d) => cobertos.has(d))) continue;
    ds.forEach((d) => cobertos.add(d));
    usados.push(r);
  }
  return { cobertos, usados };
}

async function gerarSemanalOuAvulso(tipo: TipoRelatorio, p: Periodo, alvo: ClienteResumo[], automatico: boolean) {
  const contas = alvo.filter((c) => c.contaId);
  const { dados, fonte } = await coletar(contas, [p]);
  const rel = montarRelatorio(tipo, p, alvo, dados, fonte, automatico);
  db.salvarRelatorio(rel);
  return rel;
}

async function gerarMensal(p: Periodo, alvo: ClienteResumo[], automatico: boolean) {
  const hoje = iso(new Date());
  const limite = p.fim < hoje ? p.fim : hoje;
  let { cobertos } = diasCobertos(p);
  const faltando = emPeriodos(diasEntre(p.inicio, limite).filter((d) => !cobertos.has(d)));

  if (faltando.length) {
    const { dados, fonte } = await coletar(alvo.filter((c) => c.contaId), faltando);
    for (const f of faltando) db.salvarRelatorio(montarRelatorio('complemento', f, alvo, dados, fonte, true));
  }
  const { usados } = diasCobertos(p);
  cobertos = new Set(usados.flatMap((r) => diasEntre(r.inicio, r.fim)));
  const semDados = diasEntre(p.inicio, limite).filter((d) => !cobertos.has(d));
  usados.sort((a, b) => a.inicio.localeCompare(b.inicio));

  const clientes: RelatorioCliente[] = alvo.map((c) => {
    const pedacos = usados.map((r) => ({ r, rc: r.clientes.find((x) => x.clienteSlug === c.slug) }));
    const erros = pedacos.filter((x) => x.rc?.erro && !x.rc.total.investido).map((x) => `${dataBr(x.r.inicio)}–${dataBr(x.r.fim)}`);
    const validos = pedacos.filter((x) => x.rc && !(x.rc.erro && !x.rc.total.investido));
    return {
      clienteSlug: c.slug,
      clienteNome: c.nome,
      contaId: c.contaId,
      total: somar(validos.map((x) => x.rc!.total)),
      campanhas: juntarCampanhas(validos.flatMap((x) => x.rc!.campanhas)),
      partes: validos.map((x) => ({ inicio: x.r.inicio, fim: x.r.fim, tipo: x.r.tipo, investido: x.rc!.total.investido, resultados: x.rc!.total.resultados })),
      erro: [!c.contaId && 'ficha sem ID da conta', erros.length && `falhou em ${erros.join(', ')}`, semDados.length && `${semDados.length} dia(s) sem dados`]
        .filter(Boolean)
        .join(' · ') || undefined,
    };
  });

  const rel: Relatorio = {
    id: novoId(),
    tipo: 'mensal',
    ...p,
    geradoEm: new Date().toISOString(),
    fonte: 'agregado',
    baseIds: usados.map((r) => r.id),
    clientes,
    texto: '',
    envios: [],
    automatico,
  };
  rel.texto = montarTexto(rel);
  db.salvarRelatorio(rel);
  return rel;
}

export async function gerarRelatorio(
  tipo: TipoRelatorio,
  opcoes: { inicio?: string; fim?: string; automatico?: boolean; clientes?: string[] } = {},
): Promise<Relatorio> {
  const p = opcoes.inicio && opcoes.fim ? { inicio: opcoes.inicio, fim: opcoes.fim } : tipo === 'mensal' ? periodoMensal() : periodoSemanal();
  const alvo = clientesAlvo(opcoes.clientes);
  if (tipo === 'mensal') return gerarMensal(p, alvo, !!opcoes.automatico);
  return gerarSemanalOuAvulso(tipo, p, alvo, !!opcoes.automatico);
}

/** O que o mensal vai usar: relatórios já salvos e dias que ainda precisam de exportação. */
export function previaMensal(p = periodoMensal()) {
  const hoje = iso(new Date());
  const limite = p.fim < hoje ? p.fim : hoje;
  const { cobertos, usados } = diasCobertos(p);
  return {
    ...p,
    usados: usados.map((r) => ({ id: r.id, tipo: r.tipo, inicio: r.inicio, fim: r.fim })).sort((a, b) => a.inicio.localeCompare(b.inicio)),
    faltando: emPeriodos(diasEntre(p.inicio, limite).filter((d) => !cobertos.has(d))),
  };
}

// ---------- Envio ----------

export async function enviarRelatorio(id: string, para?: string, texto?: string) {
  const rel = db.relatorios().find((r) => r.id === id);
  if (!rel) throw new Error('Relatório não encontrado');
  const cfg = db.config();
  const destinos: { numero: string; texto: string }[] = [];

  if (para) destinos.push({ numero: para, texto: texto ?? rel.texto });
  else {
    if (cfg.whatsapp.destino) destinos.push({ numero: cfg.whatsapp.destino, texto: texto ?? rel.texto });
    if (cfg.relatorios.enviarParaClientes) {
      const clientes = listarClientes();
      for (const rc of rel.clientes) {
        const n = clientes.find((c) => c.slug === rc.clienteSlug)?.extras.whatsappRelatorio;
        if (n) destinos.push({ numero: n, texto: montarTexto(rel, rc.clienteSlug) });
      }
    }
  }
  if (!destinos.length) throw new Error('Nenhum WhatsApp de destino configurado (veja Configurações).');

  const resultados = [];
  for (const d of destinos) {
    const r = await enviarWhatsapp(d.numero, d.texto);
    const envio = { para: d.numero, em: new Date().toISOString(), ok: r.ok, detalhe: r.detalhe };
    rel.envios.push(envio);
    resultados.push({ ...envio, link: r.link });
  }
  db.salvarRelatorio(rel);
  return resultados;
}

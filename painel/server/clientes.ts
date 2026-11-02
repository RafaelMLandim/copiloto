// Leitura e escrita da pasta clientes/ (as mesmas fichas que o Claude usa no CLAUDE.md).
import fs from 'node:fs';
import path from 'node:path';
import { CLIENTES_DIR } from './db.ts';
import type {
  Acompanhamento,
  ClienteDetalhe,
  ClienteExtras,
  ClienteResumo,
  Midia,
  NovoClienteInput,
  StatusCliente,
} from '../shared/tipos.ts';

const IGNORAR = new Set(['_modelo']);
const IMG = /\.(jpe?g|png|webp|gif|heic)$/i;
const VID = /\.(mp4|mov|m4v|webm|avi)$/i;

export function slugify(txt: string) {
  return txt
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

function pastaCliente(slug: string) {
  const limpo = slugify(slug);
  if (!limpo || IGNORAR.has(slug)) throw new Error('Cliente inválido');
  const p = path.join(CLIENTES_DIR, limpo);
  if (!fs.existsSync(path.join(p, 'ficha.md'))) throw new Error('Cliente não encontrado');
  return p;
}

function campo(ficha: string, rotulo: string) {
  const re = new RegExp(`^- ${rotulo}[^:\\n]*:\\s*(.*)$`, 'mi');
  return (ficha.match(re)?.[1] ?? '').trim();
}

function limparValor(v: string) {
  return v.replace(/_pendente_/gi, '').replace(/\s+/g, ' ').trim();
}

function lerExtras(dir: string): ClienteExtras {
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, 'painel.json'), 'utf8'));
  } catch {
    return { incluirRelatorio: true };
  }
}

function contarArquivos(dir: string) {
  try {
    return fs.readdirSync(dir).filter((f) => !f.startsWith('.') && !f.endsWith('.txt')).length;
  } catch {
    return 0;
  }
}

function contarCampanhas(ficha: string) {
  const sec = ficha.split(/^## Histórico de campanhas/m)[1];
  if (!sec) return 0;
  const linhas = sec.split(/^## /m)[0].split('\n').filter((l) => l.trim().startsWith('|'));
  return Math.max(0, linhas.length - 2);
}

function extrairContaId(ficha: string) {
  const linha = ficha.split('\n').find((l) => /conta de an[uú]ncios/i.test(l)) ?? '';
  return linha.match(/`(\d{8,})`/)?.[1] ?? linha.match(/(\d{10,})/)?.[1] ?? '';
}

function extrairStatus(ficha: string): StatusCliente {
  const s = campo(ficha, 'Status').toLowerCase();
  if (s.includes('|')) return 'ativo';
  if (s.startsWith('pausado')) return 'pausado';
  if (s.startsWith('prospect')) return 'prospect';
  return 'ativo';
}

function resumo(slug: string): ClienteResumo {
  const dir = path.join(CLIENTES_DIR, slug);
  const ficha = fs.readFileSync(path.join(dir, 'ficha.md'), 'utf8');
  return {
    slug,
    nome: (ficha.match(/^#\s+(.+)$/m)?.[1] ?? slug).trim(),
    nicho: limparValor(campo(ficha, 'Nicho')) || '—',
    contaId: extrairContaId(ficha),
    status: extrairStatus(ficha),
    midiasNovas: contarArquivos(path.join(dir, 'midias', 'novas')),
    midiasUsadas: contarArquivos(path.join(dir, 'midias', 'usadas')),
    campanhas: contarCampanhas(ficha),
    extras: { incluirRelatorio: true, ...lerExtras(dir) },
  };
}

export function listarClientes(): ClienteResumo[] {
  if (!fs.existsSync(CLIENTES_DIR)) return [];
  return fs
    .readdirSync(CLIENTES_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !IGNORAR.has(d.name) && fs.existsSync(path.join(CLIENTES_DIR, d.name, 'ficha.md')))
    .map((d) => resumo(d.name))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

function listarMidias(dir: string, pasta: 'novas' | 'usadas'): Midia[] {
  const p = path.join(dir, 'midias', pasta);
  if (!fs.existsSync(p)) return [];
  const arquivos = fs.readdirSync(p).filter((f) => !f.startsWith('.'));
  return arquivos
    .filter((f) => !f.toLowerCase().endsWith('.txt') || !arquivos.some((o) => o !== f && path.parse(o).name === path.parse(f).name))
    .map((nome) => {
      const st = fs.statSync(path.join(p, nome));
      const notaArq = path.join(p, path.parse(nome).name + '.txt');
      const tipo: Midia['tipo'] = IMG.test(nome) ? 'imagem' : VID.test(nome) ? 'video' : nome.endsWith('.txt') ? 'texto' : 'outro';
      return {
        nome,
        pasta,
        tipo,
        tamanho: st.size,
        nota: tipo !== 'texto' && fs.existsSync(notaArq) ? fs.readFileSync(notaArq, 'utf8') : undefined,
      };
    });
}

export function detalheCliente(slug: string): ClienteDetalhe {
  const dir = pastaCliente(slug);
  const nome = path.basename(dir);
  return {
    ...resumo(nome),
    ficha: fs.readFileSync(path.join(dir, 'ficha.md'), 'utf8'),
    midias: { novas: listarMidias(dir, 'novas'), usadas: listarMidias(dir, 'usadas') },
  };
}

export function salvarFicha(slug: string, conteudo: string) {
  fs.writeFileSync(path.join(pastaCliente(slug), 'ficha.md'), conteudo, 'utf8');
}

export function salvarExtras(slug: string, extras: ClienteExtras) {
  const dir = pastaCliente(slug);
  fs.writeFileSync(path.join(dir, 'painel.json'), JSON.stringify({ ...lerExtras(dir), ...extras }, null, 2));
}

export function caminhoMidia(slug: string, pasta: string, nome: string) {
  if (pasta !== 'novas' && pasta !== 'usadas') throw new Error('Pasta inválida');
  const base = path.join(pastaCliente(slug), 'midias', pasta);
  const alvo = path.resolve(base, nome);
  if (!alvo.startsWith(path.resolve(base) + path.sep)) throw new Error('Arquivo inválido');
  return alvo;
}

export function pastaMidiasNovas(slug: string) {
  const p = path.join(pastaCliente(slug), 'midias', 'novas');
  fs.mkdirSync(p, { recursive: true });
  return p;
}

export function salvarNota(slug: string, nomeMidia: string, nota: string) {
  const alvo = caminhoMidia(slug, 'novas', path.parse(nomeMidia).name + '.txt');
  if (nota.trim()) fs.writeFileSync(alvo, nota, 'utf8');
  else if (fs.existsSync(alvo)) fs.unlinkSync(alvo);
}

export function apagarMidia(slug: string, pasta: string, nome: string) {
  const alvo = caminhoMidia(slug, pasta, nome);
  if (fs.existsSync(alvo)) fs.unlinkSync(alvo);
  const nota = alvo.replace(/\.[^.]+$/, '.txt');
  if (nota !== alvo && fs.existsSync(nota)) fs.unlinkSync(nota);
}

const v = (s: string) => (s && s.trim() ? s.trim() : '_pendente_');

export function criarCliente(d: NovoClienteInput): ClienteResumo {
  if (!d.nome?.trim()) throw new Error('Informe o nome do cliente');
  const slug = slugify(d.nome);
  const dir = path.join(CLIENTES_DIR, slug);
  if (fs.existsSync(dir)) throw new Error(`Já existe um cliente com a pasta "${slug}"`);

  fs.mkdirSync(path.join(dir, 'midias', 'novas'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'midias', 'usadas'), { recursive: true });

  const conta = d.contaId.trim() ? `\`${d.contaId.replace(/\D/g, '')}\`` : '_pendente_';
  const link = d.contaId.trim()
    ? `\n- Link direto: https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${d.contaId.replace(/\D/g, '')}`
    : '';

  const ficha = `# ${d.nome.trim()}

## Dados
- Nicho: ${v(d.nicho)}
- Cidade / região de atuação: ${v(d.cidade)}
- Contato (responsável): ${v(d.contato)}
- Status: ${d.status || 'ativo'}

## Contas
- Conta de anúncios Meta (ID): ${conta}${link}
- Página do Facebook: ${v(d.pagina)}
- Instagram: ${v(d.instagram)}
- Pixel / site: ${v(d.site)}
- WhatsApp de atendimento: ${v(d.whatsapp)}

## Produto / oferta
- O que vende (empreendimento, tipo, faixa de preço): ${v(d.oferta)}
- Diferenciais / condições (entrada, FGTS, financiamento): ${v(d.diferenciais)}

## Público
- Comprador ideal (renda, momento de vida, motivo da compra): ${v(d.compradorIdeal)}
- Região de anúncio (cidade + raio): ${v(d.regiao)}
- Públicos personalizados disponíveis (lista de clientes, visitantes do site, engajamento): ${v(d.publicosPersonalizados)}

## Verba
- Orçamento mensal: ${v(d.orcamentoMensal)}
- Orçamento diário padrão: ${v(d.orcamentoDiario)}

## Criativos
- Onde estão (link da pasta): midias/novas
- Observações de marca (cores, tom, o que não pode dizer): ${v(d.observacoesMarca)}

## Histórico de campanhas
| Data | Campanha | Objetivo | Verba | Status | Resultado / observações |
|------|----------|----------|-------|--------|-------------------------|
`;
  fs.writeFileSync(path.join(dir, 'ficha.md'), ficha, 'utf8');
  fs.writeFileSync(
    path.join(dir, 'painel.json'),
    JSON.stringify({ incluirRelatorio: true, whatsappRelatorio: d.whatsappRelatorio?.trim() || undefined }, null, 2),
  );
  adicionarNoIndice(d, slug);
  return resumo(slug);
}

function adicionarNoIndice(d: NovoClienteInput, slug: string) {
  const indice = path.join(CLIENTES_DIR, 'INDICE.md');
  if (!fs.existsSync(indice)) return;
  const linhas = fs.readFileSync(indice, 'utf8').split('\n');
  const inicio = linhas.findIndex((l) => /^\|\s*Cliente\s*\|/.test(l));
  if (inicio < 0) return;
  let fim = inicio + 1;
  while (fim + 1 < linhas.length && linhas[fim + 1].trim().startsWith('|')) fim++;
  const conta = d.contaId.trim() ? `\`${d.contaId.replace(/\D/g, '')}\`` : '_pendente_';
  linhas.splice(fim + 1, 0, `| ${d.nome.trim()} | ${d.nicho.trim() || '_pendente_'} | ${conta} | ${d.status || 'ativo'} | [${slug}](${slug}/ficha.md) |`);
  fs.writeFileSync(indice, linhas.join('\n'), 'utf8');
}

export function acompanhamentos(): Acompanhamento[] {
  const indice = path.join(CLIENTES_DIR, 'INDICE.md');
  if (!fs.existsSync(indice)) return [];
  const sec = fs.readFileSync(indice, 'utf8').split(/^## Acompanhamentos agendados/m)[1];
  if (!sec) return [];
  return sec
    .split('\n')
    .filter((l) => l.trim().startsWith('|'))
    .slice(2)
    .map((l) => l.split('|').slice(1, -1).map((c) => c.trim()))
    .filter((c) => c.length >= 3)
    .map(([data, cliente, oque]) => ({ data, cliente, oque }));
}

export function salvarBriefing(slug: string, nome: string, conteudo: string) {
  const dir = path.join(pastaCliente(slug), 'briefings');
  fs.mkdirSync(dir, { recursive: true });
  const arq = path.join(dir, `${new Date().toISOString().slice(0, 10)}-${slugify(nome) || 'campanha'}.md`);
  fs.writeFileSync(arq, conteudo, 'utf8');
  return path.relative(CLIENTES_DIR, arq).replace(/\\/g, '/');
}

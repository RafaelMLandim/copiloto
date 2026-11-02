import { OBJETIVOS, type BriefingCampanha, type ClienteDetalhe } from '../../shared/tipos';

export const CATEGORIAS: Record<BriefingCampanha['categoriaEspecial'], string> = {
  nenhuma: 'Nenhuma',
  habitacao: 'Habitação (imóveis)',
  emprego: 'Emprego',
  credito: 'Crédito / financeiro',
  politica: 'Questões sociais / política',
};

export const POSICIONAMENTOS: Record<BriefingCampanha['posicionamentos'], string> = {
  advantage: 'Advantage+ (automático)',
  'feed-stories-reels': 'Feed + Stories + Reels (FB e IG)',
  'so-instagram': 'Só Instagram',
  manual: 'Manual (descrever)',
};

export const temCategoriaRestrita = (b: BriefingCampanha) => b.categoriaEspecial !== 'nenhuma' && b.categoriaEspecial !== 'politica';
export const usaWhatsapp = (b: BriefingCampanha) => b.objetivo === 'LEAD-WPP' || b.objetivo === 'ENG-WPP';
export const usaMensagem = (b: BriefingCampanha) => usaWhatsapp(b) || b.objetivo === 'ENG-DIRECT';
export const usaSite = (b: BriefingCampanha) => b.objetivo === 'TRAF-SITE' || b.objetivo === 'VENDAS';

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

export function campoFicha(ficha: string, rotulo: string) {
  const v = ficha.match(new RegExp(`^- ${rotulo}[^:\\n]*:\\s*(.*)$`, 'mi'))?.[1] ?? '';
  return v.replace(/_pendente_/gi, '').trim();
}

export function briefingInicial(c?: ClienteDetalhe): BriefingCampanha {
  const hoje = new Date();
  const amanha = new Date(hoje.getTime() + 86400000).toISOString().slice(0, 10);
  const ficha = c?.ficha ?? '';
  const nicho = (c?.nicho ?? '').toLowerCase();
  const imovel = /im[oó]v|imobili|corretor|casa|apartament/.test(nicho);
  const diario = Number(campoFicha(ficha, 'Orçamento diário').replace(/[^\d,]/g, '').replace(',', '.')) || (imovel ? 40 : 30);
  const wpp = campoFicha(ficha, 'WhatsApp de atendimento');
  const site = campoFicha(ficha, 'Pixel / site').match(/https?:\/\/\S+/)?.[0] ?? '';

  return {
    clienteSlug: c?.slug ?? '',
    objetivo: imovel ? 'LEAD-FORM' : 'LEAD-WPP',
    categoriaEspecial: imovel ? 'habitacao' : 'nenhuma',
    oferta: '',
    descricaoOferta: campoFicha(ficha, 'O que vende'),
    preco: campoFicha(ficha, 'Diferenciais'),
    destino: wpp || site,
    cta: '',
    regioes: campoFicha(ficha, 'Região de anúncio') || campoFicha(ficha, 'Cidade / região'),
    raioKm: imovel ? 17 : null,
    regioesExcluidas: '',
    idadeMin: imovel ? 18 : 25,
    idadeMax: 65,
    modoIdade: 'sugestao',
    genero: 'todos',
    modoGenero: 'sugestao',
    interesses: '',
    publicosPersonalizados: campoFicha(ficha, 'Públicos personalizados'),
    exclusoes: '',
    descricaoPublico: campoFicha(ficha, 'Comprador ideal'),
    expansaoLocalizacao: false,
    orcamentoDiario: diario,
    tipoOrcamento: 'campanha',
    dataInicio: amanha,
    dataFim: '',
    conjuntos: 1,
    posicionamentos: 'advantage',
    posicionamentosManual: '',
    midias: [],
    formato: 'IMG',
    gancho: '',
    textoPrincipal: '',
    titulo: '',
    claudeEscreveTextos: true,
    melhoriasCriativoMeta: false,
    perguntasFormulario: imovel
      ? 'Faixa de renda familiar\nValor disponível para entrada\nQuando pretende comprar?\nVai usar FGTS?'
      : '',
    tipoFormulario: 'maior-intencao',
    mensagemBoasVindas: '',
    botoesConversa: '',
    pixel: '',
    observacoes: '',
    nomes: { campanha: '', conjunto: '', anuncio: '' },
  };
}

function curto(s: string, max: number) {
  const t = s.trim();
  return t.length > max ? t.slice(0, max).trim() : t;
}

export function nomesAutomaticos(b: BriefingCampanha) {
  const mes = (b.dataInicio || new Date().toISOString()).slice(0, 7);
  const regiao =
    semAcento(b.regioes)
      .split(/[,;\n/]+/)
      .map((r) => r.replace(/\(.*?\)|\+?\s*\d+\s*km/gi, '').trim())
      .filter(Boolean)
      .slice(0, 4)
      .map((r) => (r.length <= 3 ? r : r.split(/\s+/)[0]))
      .join('-')
      .toUpperCase() || 'REGIAO';
  const publico =
    b.interesses
      .split(/[,;\n]+/)
      .map((x) => x.trim())
      .filter(Boolean)
      .slice(0, 2)
      .join(' + ') || (b.publicosPersonalizados.trim() ? 'Personalizado' : 'Aberto');
  const generoTxt = b.genero === 'mulheres' ? 'Mulheres ' : b.genero === 'homens' ? 'Homens ' : '';
  const fim = temCategoriaRestrita(b) ? `${b.raioKm ?? 17}km` : `${b.idadeMin}-${b.idadeMax}`;
  return {
    campanha: `${b.objetivo} | ${curto(b.oferta || 'Oferta', 30)} | ${mes}`,
    conjunto: `${curto(regiao, 22)} | ${curto(generoTxt + publico, 32)} | ${fim}`,
    anuncio: `${b.formato} | ${curto(b.gancho || 'Gancho', 30)} | v1`,
  };
}

export type Pendencia = { passo: number; texto: string };

export function pendencias(b: BriefingCampanha): Pendencia[] {
  const p: Pendencia[] = [];
  if (!b.clienteSlug) p.push({ passo: 0, texto: 'Escolha o cliente' });
  if (!b.oferta.trim()) p.push({ passo: 2, texto: 'Nome curto da oferta (vai no nome da campanha)' });
  if (!b.descricaoOferta.trim()) p.push({ passo: 2, texto: 'Descreva o que está sendo anunciado' });
  if ((usaMensagem(b) || usaSite(b)) && !b.destino.trim()) p.push({ passo: 2, texto: usaSite(b) ? 'Link do site de destino' : 'WhatsApp / Instagram de destino' });
  if (!b.regioes.trim()) p.push({ passo: 3, texto: 'Região de anúncio' });
  if (temCategoriaRestrita(b) && (b.raioKm ?? 0) < 17) p.push({ passo: 3, texto: 'Raio mínimo de 17 km na categoria especial' });
  if (!temCategoriaRestrita(b) && b.idadeMin > b.idadeMax) p.push({ passo: 3, texto: 'Idade mínima maior que a máxima' });
  if (!(b.orcamentoDiario > 0)) p.push({ passo: 4, texto: 'Orçamento diário' });
  if (!b.dataInicio) p.push({ passo: 4, texto: 'Data de início' });
  if (!b.midias.length) p.push({ passo: 5, texto: 'Selecione pelo menos uma mídia (ou envie uma nova)' });
  if (!b.claudeEscreveTextos && !b.textoPrincipal.trim()) p.push({ passo: 5, texto: 'Texto principal do anúncio (ou deixe o Claude escrever)' });
  if (b.objetivo === 'LEAD-FORM' && !b.perguntasFormulario.trim()) p.push({ passo: 6, texto: 'Perguntas de qualificação do formulário' });
  return p;
}

const sim = (v: boolean) => (v ? 'sim' : 'não');

function linhaPublico(rotulo: string, valor: string, modo: 'sugestao' | 'restrito') {
  return modo === 'restrito'
    ? `- ${rotulo}: **${valor} — RESTRITO** (deve ser SOMENTE esse público: não deixar como sugestão do Advantage+; usar controles de público / opções de público original para travar)`
    : `- ${rotulo}: ${valor} — sugestão (o Advantage+ pode expandir)`;
}

export function montarBriefing(b: BriefingCampanha, c: ClienteDetalhe | undefined, planoAprovado: boolean) {
  const obj = OBJETIVOS[b.objetivo];
  const restrita = temCategoriaRestrita(b);
  const generoTxt = b.genero === 'mulheres' ? 'Mulheres' : b.genero === 'homens' ? 'Homens' : 'Todos';
  const L: string[] = [];

  L.push(`# Briefing de campanha — ${c?.nome ?? b.clienteSlug}`);
  L.push('');
  L.push(`Cliente: **${c?.nome ?? b.clienteSlug}** — ficha em \`clientes/${b.clienteSlug}/ficha.md\` — conta de anúncios \`${c?.contaId || '?'}\``);
  L.push('');
  L.push('## Nomes (nomenclatura do CLAUDE.md)');
  L.push(`- Campanha: \`${b.nomes.campanha}\``);
  L.push(`- Conjunto: \`${b.nomes.conjunto}\`${b.conjuntos > 1 ? ` (+${b.conjuntos - 1} conjunto(s) — variar o público, mesmo padrão de nome)` : ''}`);
  L.push(`- Anúncio: \`${b.nomes.anuncio}\``);
  L.push('');
  L.push('## Objetivo');
  L.push(`- ${b.objetivo} — ${obj.rotulo} (no Meta: ${obj.metaObjetivo})`);
  L.push(`- Categoria especial de anúncio: ${CATEGORIAS[b.categoriaEspecial]}`);
  L.push('');
  L.push('## Oferta e destino');
  L.push(`- Oferta: ${b.oferta}`);
  L.push(`- O que é: ${b.descricaoOferta || '—'}`);
  if (b.preco.trim()) L.push(`- Preço / condições: ${b.preco}`);
  if (b.destino.trim()) L.push(`- Destino: ${b.destino}`);
  if (b.cta.trim()) L.push(`- Botão (CTA): ${b.cta}`);
  L.push('');
  L.push('## Público');
  L.push(`- Regiões: ${b.regioes}${b.raioKm ? ` (raio ${b.raioKm} km)` : ''}`);
  if (b.regioesExcluidas.trim()) L.push(`- Excluir regiões: ${b.regioesExcluidas}`);
  L.push(`- Expansão automática de localização (Advantage+): ${b.expansaoLocalizacao ? 'ligada' : 'DESLIGADA'}`);
  if (restrita) {
    L.push('- Idade e gênero: travados pela categoria especial (18-65+, todos). Direcionar via região, interesses permitidos, públicos personalizados e criativo.');
  } else {
    L.push(linhaPublico('Idade', `${b.idadeMin}-${b.idadeMax}${b.idadeMax >= 65 ? '+' : ''}`, b.modoIdade));
    L.push(b.genero === 'todos' ? '- Gênero: todos' : linhaPublico('Gênero', generoTxt, b.modoGenero));
  }
  if (b.interesses.trim()) L.push(`- Interesses / comportamentos: ${b.interesses.replace(/\n+/g, '; ')}`);
  if (b.publicosPersonalizados.trim()) L.push(`- Públicos personalizados: ${b.publicosPersonalizados.replace(/\n+/g, '; ')}`);
  if (b.exclusoes.trim()) L.push(`- Excluir públicos: ${b.exclusoes.replace(/\n+/g, '; ')}`);
  if (b.descricaoPublico.trim()) L.push(`- Quem é o comprador: ${b.descricaoPublico}`);
  L.push('');
  L.push('## Orçamento e agenda');
  L.push(`- R$ ${b.orcamentoDiario.toFixed(2).replace('.', ',')}/dia — orçamento ${b.tipoOrcamento === 'campanha' ? 'de campanha (Advantage+ / CBO)' : 'por conjunto (ABO)'}`);
  L.push(`- Conjuntos: ${b.conjuntos}`);
  L.push(`- Início: ${b.dataInicio}${b.dataFim ? ` · Fim: ${b.dataFim}` : ' · sem data de término'}`);
  L.push('');
  L.push('## Criativos');
  L.push(`- Formato: ${b.formato}`);
  L.push(`- Mídias (em \`clientes/${b.clienteSlug}/midias/novas/\`): ${b.midias.length ? b.midias.map((m) => `\`${m}\``).join(', ') : 'nenhuma'}`);
  L.push(`- Posicionamentos: ${POSICIONAMENTOS[b.posicionamentos]}${b.posicionamentos === 'manual' && b.posicionamentosManual ? ` — ${b.posicionamentosManual}` : ''}`);
  if (b.gancho.trim()) L.push(`- Gancho: ${b.gancho}`);
  if (b.claudeEscreveTextos) L.push('- Textos: **Claude escreve** (texto principal + título), usando nome das mídias, notas .txt e a ficha. Mostrar os textos no plano.');
  if (b.textoPrincipal.trim()) L.push(`- Texto principal${b.claudeEscreveTextos ? ' (base/ideia)' : ''}:\n\n  > ${b.textoPrincipal.replace(/\n/g, '\n  > ')}`);
  if (b.titulo.trim()) L.push(`- Título: ${b.titulo}`);
  L.push(`- Melhorias automáticas de criativo do Meta: ${b.melhoriasCriativoMeta ? 'ligadas' : 'DESLIGADAS'}`);
  L.push('');
  if (b.objetivo === 'LEAD-FORM') {
    L.push('## Formulário instantâneo');
    L.push(`- Tipo: ${b.tipoFormulario === 'maior-intencao' ? 'Maior intenção' : 'Mais volume'}`);
    L.push('- Perguntas de qualificação:');
    b.perguntasFormulario.split('\n').filter((x) => x.trim()).forEach((q) => L.push(`  - ${q.trim()}`));
    L.push('');
  }
  if (usaMensagem(b)) {
    L.push('## Conversa');
    L.push(`- Mensagem de boas-vindas: ${b.mensagemBoasVindas.trim() || 'Claude sugere (qualificar e já mencionar preço/condição)'}`);
    if (b.botoesConversa.trim()) L.push(`- Botões / perguntas rápidas: ${b.botoesConversa.replace(/\n+/g, ' · ')}`);
    L.push('');
  }
  if (usaSite(b) && b.pixel.trim()) {
    L.push('## Rastreamento');
    L.push(`- Pixel / evento: ${b.pixel}`);
    L.push('');
  }
  if (b.observacoes.trim()) {
    L.push('## Observações');
    L.push(b.observacoes);
    L.push('');
  }
  L.push('## Instruções');
  L.push('- Criar tudo como **RASCUNHO**. Não publicar. Conferir o ID da conta na tela antes de criar.');
  L.push('- Depois de subir as mídias, mover para `midias/usadas/` e registrar no histórico da ficha.');
  L.push(
    planoAprovado
      ? '- O plano acima já está aprovado: pode abrir o navegador e montar o rascunho direto. Só me pergunte se algo estiver faltando ou impossível no Meta.'
      : '- Antes de abrir o navegador: revise este briefing, aponte riscos/melhorias e me mostre o plano final (com os textos). Espere meu ok.',
  );
  return L.join('\n');
}

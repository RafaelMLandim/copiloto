// Tipos compartilhados entre o servidor (server/) e a interface (src/).

export type StatusCliente = 'ativo' | 'pausado' | 'prospect';

export interface ClienteResumo {
  slug: string;
  nome: string;
  nicho: string;
  contaId: string;
  status: StatusCliente;
  midiasNovas: number;
  midiasUsadas: number;
  campanhas: number;
  extras: ClienteExtras;
}

/** Dados do painel que não cabem na ficha.md (ficam em clientes/<slug>/painel.json). */
export interface ClienteExtras {
  cor?: string;
  /** WhatsApp para onde mandar o relatório deste cliente (além do destino geral). */
  whatsappRelatorio?: string;
  /** Incluir este cliente nos relatórios automáticos. */
  incluirRelatorio?: boolean;
}

export interface ClienteDetalhe extends ClienteResumo {
  ficha: string;
  midias: { novas: Midia[]; usadas: Midia[] };
}

export interface Midia {
  nome: string;
  pasta: 'novas' | 'usadas';
  tipo: 'imagem' | 'video' | 'texto' | 'outro';
  tamanho: number;
  nota?: string;
}

export interface NovoClienteInput {
  nome: string;
  nicho: string;
  cidade: string;
  contato: string;
  status: StatusCliente;
  contaId: string;
  pagina: string;
  instagram: string;
  site: string;
  whatsapp: string;
  oferta: string;
  diferenciais: string;
  compradorIdeal: string;
  regiao: string;
  publicosPersonalizados: string;
  orcamentoMensal: string;
  orcamentoDiario: string;
  observacoesMarca: string;
  whatsappRelatorio: string;
}

export interface Acompanhamento {
  data: string;
  cliente: string;
  oque: string;
}

// ---------- Campanha (assistente) ----------

export type ObjetivoCodigo =
  | 'LEAD-FORM'
  | 'LEAD-WPP'
  | 'ENG-WPP'
  | 'ENG-DIRECT'
  | 'TRAF-SITE'
  | 'VENDAS'
  | 'RECON';

export type ModoPublico = 'sugestao' | 'restrito';

export interface BriefingCampanha {
  clienteSlug: string;
  objetivo: ObjetivoCodigo;
  categoriaEspecial: 'nenhuma' | 'habitacao' | 'emprego' | 'credito' | 'politica';
  oferta: string;
  descricaoOferta: string;
  preco: string;
  destino: string; // link do site, número do WhatsApp, @ do Instagram
  cta: string;

  regioes: string;
  raioKm: number | null;
  regioesExcluidas: string;
  idadeMin: number;
  idadeMax: number;
  modoIdade: ModoPublico;
  genero: 'todos' | 'mulheres' | 'homens';
  modoGenero: ModoPublico;
  interesses: string;
  publicosPersonalizados: string;
  exclusoes: string;
  descricaoPublico: string;
  expansaoLocalizacao: boolean;

  orcamentoDiario: number;
  tipoOrcamento: 'campanha' | 'conjunto';
  dataInicio: string;
  dataFim: string;
  conjuntos: number;

  posicionamentos: 'advantage' | 'feed-stories-reels' | 'so-instagram' | 'manual';
  posicionamentosManual: string;
  midias: string[];
  formato: 'IMG' | 'VID' | 'CAR' | 'REELS';
  gancho: string;
  textoPrincipal: string;
  titulo: string;
  claudeEscreveTextos: boolean;
  melhoriasCriativoMeta: boolean;

  perguntasFormulario: string;
  tipoFormulario: 'maior-intencao' | 'mais-volume';
  mensagemBoasVindas: string;
  botoesConversa: string;
  pixel: string;
  observacoes: string;

  nomes: { campanha: string; conjunto: string; anuncio: string };
}

// ---------- Chat ----------

export interface MensagemChat {
  id: string;
  papel: 'usuario' | 'claude';
  texto: string;
  ferramentas?: { nome: string; resumo: string }[];
  criadaEm: string;
  custoUsd?: number;
  erro?: boolean;
}

export interface Conversa {
  id: string;
  titulo: string;
  clienteSlug?: string;
  sessionId?: string;
  mensagens: MensagemChat[];
  criadaEm: string;
  atualizadaEm: string;
}

/** Eventos enviados do servidor para a tela de chat (uma linha JSON por evento). */
export type EventoChat =
  | { t: 'inicio'; mensagemId: string }
  | { t: 'texto'; v: string }
  | { t: 'ferramenta'; nome: string; resumo: string }
  | { t: 'fim'; sessionId?: string; custoUsd?: number }
  | { t: 'erro'; v: string };

// ---------- Relatórios ----------

/** complemento = exportação extra dos dias que nenhum relatório salvo cobriu (ex.: do último sábado até o fim do mês). */
export type TipoRelatorio = 'semanal' | 'mensal' | 'personalizado' | 'complemento';
export type FonteRelatorio = 'exportacao' | 'meta-api' | 'claude-navegador' | 'agregado';

export interface Metricas {
  investido: number;
  impressoes: number;
  alcance: number;
  cliques: number;
  ctr: number;
  cpm: number;
  conversas: number;
  leads: number;
  resultados: number;
  custoPorResultado: number | null;
}

export interface MetricasCampanha extends Metricas {
  nome: string;
  status?: string;
}

export interface RelatorioCliente {
  clienteSlug: string;
  clienteNome: string;
  contaId: string;
  total: Metricas;
  campanhas: MetricasCampanha[];
  erro?: string;
  /** CSV exportado do Gerenciador (relativo a clientes/). */
  arquivo?: string;
  /** Só no mensal: quanto veio de cada relatório somado. */
  partes?: { inicio: string; fim: string; tipo: TipoRelatorio; investido: number; resultados: number }[];
}

export interface Relatorio {
  id: string;
  tipo: TipoRelatorio;
  inicio: string; // AAAA-MM-DD
  fim: string;
  geradoEm: string;
  fonte: FonteRelatorio;
  /** Só no mensal: ids dos relatórios somados. */
  baseIds?: string[];
  clientes: RelatorioCliente[];
  texto: string;
  envios: { para: string; em: string; ok: boolean; detalhe?: string }[];
  automatico: boolean;
}

// ---------- Configurações ----------

export type ProvedorWhatsapp = 'link' | 'callmebot' | 'evolution' | 'zapi';

export interface Configuracoes {
  whatsapp: {
    provedor: ProvedorWhatsapp;
    destino: string; // número padrão que recebe os relatórios
    callmebotApiKey: string;
    evolutionUrl: string;
    evolutionInstancia: string;
    evolutionApiKey: string;
    zapiInstancia: string;
    zapiToken: string;
    zapiClientToken: string;
  };
  meta: {
    accessToken: string;
    versaoApi: string;
  };
  relatorios: {
    semanalAtivo: boolean;
    semanalDia: number; // 0=domingo ... 6=sábado
    semanalHora: string; // "09:00"
    mensalAtivo: boolean;
    mensalHora: string;
    mensalQuando: 'ultimo-dia' | 'primeiro-dia';
    enviarAutomatico: boolean;
    enviarParaClientes: boolean;
    /** exportacao = Claude exporta o CSV do Gerenciador (padrão); meta-api = usa o token. */
    fonte: 'exportacao' | 'meta-api';
    /** Sininho: lembrete na sexta e no último dia do mês, a partir deste horário. */
    lembreteAtivo: boolean;
    lembreteHora: string;
  };
  claude: {
    modoPermissao: 'auto' | 'acceptEdits' | 'default' | 'bypassPermissions';
    modelo: string;
    usarChrome: boolean;
  };
}

export const OBJETIVOS: Record<ObjetivoCodigo, { rotulo: string; descricao: string; metaObjetivo: string }> = {
  'LEAD-FORM': { rotulo: 'Leads · Formulário', descricao: 'Formulário instantâneo dentro do Facebook/Instagram', metaObjetivo: 'Leads → Formulários instantâneos' },
  'LEAD-WPP': { rotulo: 'Leads · WhatsApp', descricao: 'Conversas no WhatsApp otimizadas para lead', metaObjetivo: 'Leads → Apps de mensagem (WhatsApp)' },
  'ENG-WPP': { rotulo: 'Engajamento · WhatsApp', descricao: 'Maximizar conversas no WhatsApp', metaObjetivo: 'Engajamento → Apps de mensagem (WhatsApp)' },
  'ENG-DIRECT': { rotulo: 'Engajamento · Direct', descricao: 'Conversas no Direct do Instagram', metaObjetivo: 'Engajamento → Apps de mensagem (Instagram)' },
  'TRAF-SITE': { rotulo: 'Tráfego · Site', descricao: 'Levar pessoas para um site/landing page', metaObjetivo: 'Tráfego → Site' },
  VENDAS: { rotulo: 'Vendas', descricao: 'Conversões no site (precisa de pixel)', metaObjetivo: 'Vendas → Site' },
  RECON: { rotulo: 'Reconhecimento', descricao: 'Alcance / visualização de vídeo', metaObjetivo: 'Reconhecimento' },
};

// ---------- Notificações (sininho) ----------

export interface Notificacao {
  id: string;
  tipo: 'semanal' | 'mensal';
  inicio: string;
  fim: string;
  titulo: string;
  texto: string;
  criadaEm: string;
  lida: boolean;
  dispensada?: boolean;
  /** Calculado: já existe relatório desse tipo e período. */
  concluida?: boolean;
}

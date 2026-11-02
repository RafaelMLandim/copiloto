import type {
  Acompanhamento,
  BriefingCampanha,
  ClienteDetalhe,
  ClienteExtras,
  ClienteResumo,
  Configuracoes,
  Conversa,
  EventoChat,
  Notificacao,
  NovoClienteInput,
  Relatorio,
  TipoRelatorio,
} from '../shared/tipos';

async function req<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, {
    ...init,
    headers: init?.body && !(init.body instanceof FormData) ? { 'Content-Type': 'application/json', ...init?.headers } : init?.headers,
  });
  const txt = await r.text();
  const dados = txt ? JSON.parse(txt) : undefined;
  if (!r.ok) throw new Error(dados?.erro ?? `Erro ${r.status}`);
  return dados as T;
}
const json = (method: string, body?: unknown): RequestInit => ({ method, body: body === undefined ? undefined : JSON.stringify(body) });

export interface Status {
  claude: string | null;
  pasta: string;
  metaToken: boolean;
  whatsapp: { provedor: string; destino: string };
  proximos: { semanal: { inicio: string; fim: string }; mensal: { inicio: string; fim: string } };
}

export type ConversaResumo = Omit<Conversa, 'mensagens'> & { total: number; ultima: string; rodando: boolean };

export const api = {
  status: () => req<Status>('/api/status'),

  clientes: () => req<ClienteResumo[]>('/api/clientes'),
  cliente: (slug: string) => req<ClienteDetalhe>(`/api/clientes/${slug}`),
  criarCliente: (d: NovoClienteInput) => req<ClienteResumo>('/api/clientes', json('POST', d)),
  salvarFicha: (slug: string, ficha: string) => req(`/api/clientes/${slug}/ficha`, json('PUT', { ficha })),
  salvarExtras: (slug: string, extras: ClienteExtras) => req(`/api/clientes/${slug}/extras`, json('PUT', extras)),
  acompanhamentos: () => req<Acompanhamento[]>('/api/acompanhamentos'),
  midiaUrl: (slug: string, pasta: string, nome: string) => `/api/clientes/${slug}/midias/${pasta}/${encodeURIComponent(nome)}`,
  enviarMidias: (slug: string, arquivos: File[]) => {
    const fd = new FormData();
    arquivos.forEach((a) => fd.append('arquivos', a));
    return req(`/api/clientes/${slug}/midias`, { method: 'POST', body: fd });
  },
  salvarNota: (slug: string, nome: string, nota: string) => req(`/api/clientes/${slug}/midias/${encodeURIComponent(nome)}/nota`, json('PUT', { nota })),
  apagarMidia: (slug: string, pasta: string, nome: string) => req(`/api/clientes/${slug}/midias/${pasta}/${encodeURIComponent(nome)}`, json('DELETE')),
  salvarBriefing: (b: BriefingCampanha, markdown: string) =>
    req<{ arquivo: string }>('/api/campanhas/briefing', json('POST', { clienteSlug: b.clienteSlug, nome: b.nomes.campanha, markdown })),

  conversas: () => req<ConversaResumo[]>('/api/conversas'),
  conversa: (id: string) => req<Conversa & { rodando: boolean }>(`/api/conversas/${id}`),
  novaConversa: (titulo?: string, clienteSlug?: string) => req<Conversa>('/api/conversas', json('POST', { titulo, clienteSlug })),
  renomearConversa: (id: string, titulo: string) => req(`/api/conversas/${id}`, json('PATCH', { titulo })),
  apagarConversa: (id: string) => req(`/api/conversas/${id}`, json('DELETE')),
  pararConversa: (id: string) => req(`/api/conversas/${id}/parar`, json('POST')),
  async enviarMensagem(id: string, texto: string, onEvento: (e: EventoChat) => void, sinal?: AbortSignal) {
    const r = await fetch(`/api/conversas/${id}/mensagens`, { ...json('POST', { texto }), headers: { 'Content-Type': 'application/json' }, signal: sinal });
    if (!r.ok || !r.body) {
      const t = await r.text();
      throw new Error((t && JSON.parse(t).erro) || `Erro ${r.status}`);
    }
    const leitor = r.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    for (;;) {
      const { done, value } = await leitor.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const linhas = buf.split('\n');
      buf = linhas.pop() ?? '';
      for (const l of linhas) if (l.trim()) onEvento(JSON.parse(l));
    }
  },

  relatorios: () => req<Relatorio[]>('/api/relatorios'),
  previaMensal: () =>
    req<{ inicio: string; fim: string; usados: { id: string; tipo: TipoRelatorio; inicio: string; fim: string }[]; faltando: { inicio: string; fim: string }[] }>(
      '/api/relatorios/previa-mensal',
    ),
  arquivoUrl: (caminho: string) => `/api/relatorios/arquivo?caminho=${encodeURIComponent(caminho)}`,
  gerarRelatorio: (tipo: TipoRelatorio, inicio?: string, fim?: string, clientes?: string[]) =>
    req<{ jobId: string; fonte: string }>('/api/relatorios/gerar', json('POST', { tipo, inicio, fim, clientes })),
  job: (id: string) => req<{ status: 'rodando' | 'ok' | 'erro'; relatorio?: Relatorio; erro?: string }>(`/api/relatorios/job/${id}`),
  salvarTextoRelatorio: (id: string, texto: string, restaurar = false) => req<Relatorio>(`/api/relatorios/${id}/texto`, json('PUT', { texto, restaurar })),
  enviarRelatorio: (id: string, para?: string, texto?: string) =>
    req<{ para: string; ok: boolean; detalhe?: string; link?: string }[]>(`/api/relatorios/${id}/enviar`, json('POST', { para, texto })),
  apagarRelatorio: (id: string) => req(`/api/relatorios/${id}`, json('DELETE')),

  notificacoes: () => req<Notificacao[]>('/api/notificacoes'),
  marcarLidas: (id?: string) => req('/api/notificacoes/lidas', json('POST', { id })),
  dispensarNotificacao: (id: string) => req(`/api/notificacoes/${id}`, json('DELETE')),

  config: () => req<Configuracoes>('/api/config'),
  salvarConfig: (c: Configuracoes) => req<Configuracoes>('/api/config', json('PUT', c)),
  testarWhatsapp: (numero: string) => req<{ ok: boolean; detalhe?: string; link?: string }>('/api/whatsapp/teste', json('POST', { numero })),
};

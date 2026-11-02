// Armazenamento local em JSON (painel/data/). Sem banco de dados: o painel é de uso pessoal
// e as fichas dos clientes continuam sendo os arquivos .md em clientes/.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Configuracoes, Conversa, Notificacao, Relatorio } from '../shared/tipos.ts';

const aqui = path.dirname(fileURLToPath(import.meta.url));
export const PAINEL_DIR = path.resolve(aqui, '..');
export const RAIZ = process.env.COPILOTO_DIR ?? path.resolve(PAINEL_DIR, '..');
export const CLIENTES_DIR = path.join(RAIZ, 'clientes');
const DATA_DIR = process.env.COPILOTO_DATA_DIR ?? path.join(PAINEL_DIR, 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

export const CONFIG_PADRAO: Configuracoes = {
  whatsapp: {
    provedor: 'link',
    destino: '',
    callmebotApiKey: '',
    evolutionUrl: '',
    evolutionInstancia: '',
    evolutionApiKey: '',
    zapiInstancia: '',
    zapiToken: '',
    zapiClientToken: '',
  },
  meta: { accessToken: '', versaoApi: 'v23.0' },
  relatorios: {
    semanalAtivo: true,
    semanalDia: 6,
    semanalHora: '09:00',
    mensalAtivo: true,
    mensalHora: '09:00',
    mensalQuando: 'primeiro-dia',
    enviarAutomatico: true,
    enviarParaClientes: false,
    fonte: 'exportacao',
    lembreteAtivo: true,
    lembreteHora: '16:00',
  },
  claude: { modoPermissao: 'auto', modelo: '', usarChrome: true },
};

function arquivo(nome: string) {
  return path.join(DATA_DIR, nome);
}

function ler<T>(nome: string, padrao: T): T {
  try {
    return JSON.parse(fs.readFileSync(arquivo(nome), 'utf8')) as T;
  } catch {
    return padrao;
  }
}

function gravar(nome: string, dados: unknown) {
  const destino = arquivo(nome);
  const tmp = destino + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(dados, null, 2), 'utf8');
  fs.renameSync(tmp, destino);
}

function mesclar<T extends object>(base: T, extra: Partial<T> | undefined): T {
  const saida: any = { ...base };
  for (const [k, v] of Object.entries(extra ?? {})) {
    saida[k] = v && typeof v === 'object' && !Array.isArray(v) ? { ...(base as any)[k], ...v } : v;
  }
  return saida;
}

export const db = {
  config(): Configuracoes {
    return mesclar(CONFIG_PADRAO, ler<Partial<Configuracoes>>('config.json', {}));
  },
  salvarConfig(c: Configuracoes) {
    gravar('config.json', c);
  },

  conversas(): Conversa[] {
    return ler<Conversa[]>('conversas.json', []);
  },
  conversa(id: string) {
    return this.conversas().find((c) => c.id === id);
  },
  salvarConversa(c: Conversa) {
    const todas = this.conversas().filter((x) => x.id !== c.id);
    todas.unshift(c);
    gravar('conversas.json', todas);
  },
  apagarConversa(id: string) {
    gravar('conversas.json', this.conversas().filter((x) => x.id !== id));
  },

  relatorios(): Relatorio[] {
    return ler<Relatorio[]>('relatorios.json', []);
  },
  salvarRelatorio(r: Relatorio) {
    const todos = this.relatorios().filter((x) => x.id !== r.id);
    todos.unshift(r);
    gravar('relatorios.json', todos.slice(0, 300));
  },
  notificacoes(): Notificacao[] {
    return ler<Notificacao[]>('notificacoes.json', []);
  },
  salvarNotificacoes(lista: Notificacao[]) {
    gravar('notificacoes.json', lista.slice(0, 100));
  },

  apagarRelatorio(id: string) {
    gravar('relatorios.json', this.relatorios().filter((x) => x.id !== id));
  },
};

export function novoId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

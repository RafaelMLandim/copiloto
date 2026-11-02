// Ponte entre o painel e o Claude Code (CLI `claude`), rodando na pasta Copiloto.
// Assim o chat do painel tem o mesmo poder do terminal: lê o CLAUDE.md, as fichas,
// a memória e usa a extensão Claude in Chrome para montar campanhas.
import { spawn, type ChildProcess } from 'node:child_process';
import { db, RAIZ } from './db.ts';
import type { EventoChat } from '../shared/tipos.ts';

const INSTRUCOES_PAINEL = [
  'Você está sendo chamado pelo Painel Copiloto (interface web local do usuário).',
  'Responda sempre em PT-BR, de forma objetiva, usando markdown simples (listas, negrito, tabelas curtas).',
  'Siga o CLAUDE.md da pasta Copiloto à risca: campanhas SEMPRE em rascunho, nunca publicar, nunca digitar senha/cartão.',
  'Quando o usuário enviar um briefing de campanha vindo do assistente do painel, as respostas dele já estão no briefing:',
  'não pergunte de novo o que já foi respondido; proponha o plano curto e espere o "ok" antes de abrir o navegador,',
  'a menos que o briefing diga explicitamente que o plano já está aprovado.',
  'Respeite o campo "modo" do público: "RESTRITO" significa que o público NÃO pode ser só sugestão do Advantage+',
  '(use os controles de público / opções de público original para travar); "SUGESTÃO" pode ficar como sugestão.',
  'Ao terminar algo no Meta, registre no histórico da ficha.md do cliente, como manda o CLAUDE.md.',
].join(' ');

const rodando = new Map<string, ChildProcess>();

function argumentosBase(extra: string[] = []) {
  const cfg = db.config().claude;
  const args = ['-p', '--permission-mode', cfg.modoPermissao, '--append-system-prompt', INSTRUCOES_PAINEL, ...extra];
  if (cfg.usarChrome) args.push('--chrome');
  if (cfg.modelo.trim()) args.push('--model', cfg.modelo.trim());
  return args;
}

function resumirFerramenta(nome: string, entrada: any): string {
  if (!entrada || typeof entrada !== 'object') return '';
  const curto = (s: unknown) => String(s ?? '').replace(/\s+/g, ' ').slice(0, 90);
  if (entrada.description) return curto(entrada.description);
  if (entrada.file_path) return curto(String(entrada.file_path).split(/[\\/]/).slice(-2).join('/'));
  if (entrada.url) return curto(entrada.url);
  if (entrada.action) return curto(entrada.action + (entrada.text ? `: ${entrada.text}` : ''));
  if (entrada.pattern) return curto(entrada.pattern);
  if (entrada.query) return curto(entrada.query);
  const primeiro = Object.values(entrada).find((x) => typeof x === 'string');
  return primeiro ? curto(primeiro) : '';
}

export function nomeAmigavel(nome: string) {
  const mapa: Record<string, string> = {
    Read: 'Lendo arquivo',
    Write: 'Escrevendo arquivo',
    Edit: 'Editando arquivo',
    Bash: 'Rodando comando',
    PowerShell: 'Rodando comando',
    Glob: 'Procurando arquivos',
    Grep: 'Buscando nos arquivos',
    WebSearch: 'Pesquisando na web',
    WebFetch: 'Lendo página',
    ToolSearch: 'Carregando ferramentas',
  };
  if (mapa[nome]) return mapa[nome];
  if (nome.startsWith('mcp__claude-in-chrome__')) {
    const n = nome.replace('mcp__claude-in-chrome__', '');
    const chrome: Record<string, string> = {
      navigate: 'Navegador: abrindo página',
      computer: 'Navegador: interagindo',
      read_page: 'Navegador: lendo a tela',
      get_page_text: 'Navegador: lendo texto',
      find: 'Navegador: procurando elemento',
      form_input: 'Navegador: preenchendo campo',
      tabs_context_mcp: 'Navegador: vendo abas',
      tabs_create_mcp: 'Navegador: nova aba',
      file_upload: 'Navegador: enviando arquivo',
      javascript_tool: 'Navegador: script',
    };
    return chrome[n] ?? `Navegador: ${n}`;
  }
  return nome.replace(/^mcp__[^_]+__/, '');
}

/**
 * Executa uma mensagem no Claude e vai emitindo eventos (texto parcial, ferramentas, fim).
 * Retorna uma promise que resolve quando o processo termina.
 */
export function conversarComClaude(
  chaveExecucao: string,
  prompt: string,
  sessionId: string | undefined,
  emitir: (e: EventoChat) => void,
): Promise<{ sessionId?: string; custoUsd?: number; ok: boolean }> {
  return new Promise((resolve) => {
    const args = argumentosBase(['--output-format', 'stream-json', '--verbose', '--include-partial-messages']);
    if (sessionId) args.push('--resume', sessionId);

    const proc = spawn('claude', args, { cwd: RAIZ, windowsHide: true, env: process.env });
    rodando.set(chaveExecucao, proc);

    let buffer = '';
    let teveDelta = false;
    let jaEscreveu = false;
    let novaSessao = sessionId;
    let custo: number | undefined;
    let erroTxt = '';
    let terminou = false;

    const tratarLinha = (linha: string) => {
      if (!linha.trim()) return;
      let ev: any;
      try {
        ev = JSON.parse(linha);
      } catch {
        return;
      }
      if (ev.session_id) novaSessao = ev.session_id;

      if (ev.type === 'stream_event') {
        const e = ev.event;
        if (e?.type === 'message_start' && jaEscreveu) emitir({ t: 'texto', v: '\n\n' });
        if (e?.type === 'content_block_delta' && e.delta?.type === 'text_delta' && !ev.parent_tool_use_id) {
          teveDelta = true;
          jaEscreveu = true;
          emitir({ t: 'texto', v: e.delta.text });
        }
        return;
      }
      if (ev.type === 'assistant' && Array.isArray(ev.message?.content)) {
        for (const bloco of ev.message.content) {
          if (bloco.type === 'tool_use') {
            emitir({ t: 'ferramenta', nome: nomeAmigavel(bloco.name), resumo: resumirFerramenta(bloco.name, bloco.input) });
          } else if (bloco.type === 'text' && !teveDelta && !ev.parent_tool_use_id) {
            if (jaEscreveu) emitir({ t: 'texto', v: '\n\n' });
            jaEscreveu = true;
            emitir({ t: 'texto', v: bloco.text });
          }
        }
        return;
      }
      if (ev.type === 'result') {
        custo = ev.total_cost_usd;
        if (ev.is_error && ev.result) erroTxt = String(ev.result);
        if (!jaEscreveu && ev.result && !ev.is_error) {
          jaEscreveu = true;
          emitir({ t: 'texto', v: String(ev.result) });
        }
      }
    };

    proc.stdout.setEncoding('utf8');
    proc.stdout.on('data', (chunk: string) => {
      buffer += chunk;
      const linhas = buffer.split('\n');
      buffer = linhas.pop() ?? '';
      linhas.forEach(tratarLinha);
    });
    proc.stderr.setEncoding('utf8');
    proc.stderr.on('data', (c: string) => (erroTxt += c));

    const finalizar = (codigo: number | null, falha?: Error) => {
      if (terminou) return;
      terminou = true;
      if (buffer) tratarLinha(buffer);
      rodando.delete(chaveExecucao);
      const ok = !falha && codigo === 0;
      if (!ok) {
        const msg = falha
          ? falha.message.includes('ENOENT')
            ? 'Não encontrei o comando "claude". Instale o Claude Code e confira se ele está no PATH.'
            : falha.message
          : codigo === null
            ? 'Execução interrompida.'
            : erroTxt.trim().slice(-800) || `O Claude terminou com código ${codigo}.`;
        emitir({ t: 'erro', v: msg });
      }
      emitir({ t: 'fim', sessionId: novaSessao, custoUsd: custo });
      resolve({ sessionId: novaSessao, custoUsd: custo, ok });
    };

    proc.on('error', (e) => finalizar(null, e));
    proc.on('close', (codigo) => finalizar(codigo));

    proc.stdin.write(prompt);
    proc.stdin.end();
  });
}

export function pararExecucao(chave: string) {
  const p = rodando.get(chave);
  if (!p) return false;
  if (process.platform === 'win32' && p.pid) spawn('taskkill', ['/pid', String(p.pid), '/T', '/F'], { windowsHide: true });
  else p.kill('SIGTERM');
  return true;
}

export function estaRodando(chave: string) {
  return rodando.has(chave);
}

/** Pergunta única ao Claude, sem chat (usado para coletar métricas pelo navegador). */
export function perguntarClaude(prompt: string, timeoutMs = 15 * 60_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn('claude', argumentosBase(['--output-format', 'json']), { cwd: RAIZ, windowsHide: true });
    let out = '';
    let err = '';
    const timer = setTimeout(() => {
      proc.kill();
      reject(new Error('O Claude demorou demais para responder.'));
    }, timeoutMs);
    proc.stdout.setEncoding('utf8');
    proc.stdout.on('data', (c: string) => (out += c));
    proc.stderr.on('data', (c) => (err += c));
    proc.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
    proc.on('close', (codigo) => {
      clearTimeout(timer);
      try {
        const j = JSON.parse(out);
        if (j.is_error) return reject(new Error(String(j.result ?? 'Erro no Claude')));
        resolve(String(j.result ?? ''));
      } catch {
        reject(new Error(err.trim() || `O Claude terminou com código ${codigo}`));
      }
    });
    proc.stdin.write(prompt);
    proc.stdin.end();
  });
}

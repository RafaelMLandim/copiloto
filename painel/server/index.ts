import express, { type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { CLIENTES_DIR, db, novoId, PAINEL_DIR, RAIZ } from './db.ts';
import {
  acompanhamentos,
  apagarMidia,
  caminhoMidia,
  criarCliente,
  detalheCliente,
  listarClientes,
  pastaMidiasNovas,
  salvarBriefing,
  salvarExtras,
  salvarFicha,
  salvarNota,
} from './clientes.ts';
import { conversarComClaude, estaRodando, pararExecucao } from './claude.ts';
import { enviarRelatorio, gerarRelatorio, montarTexto, periodoMensal, periodoSemanal, previaMensal } from './relatorios.ts';
import { enviarWhatsapp } from './whatsapp.ts';
import { reagendar, recuperarAtrasados } from './agendador.ts';
import { dispensar, listarNotificacoes, marcarLida } from './notificacoes.ts';
import type { Conversa, EventoChat, MensagemChat, Relatorio, TipoRelatorio } from '../shared/tipos.ts';

const app = express();
app.use(express.json({ limit: '5mb' }));

const rota =
  (fn: (req: Request, res: Response) => unknown) =>
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const r = await fn(req, res);
      if (r !== undefined && !res.headersSent) res.json(r);
    } catch (e) {
      next(e);
    }
  };
const p = (req: Request, k: string) => String(req.params[k]);

// ---------- Status ----------

let versaoClaude: string | null | undefined;
app.get(
  '/api/status',
  rota(async () => {
    if (versaoClaude === undefined) {
      versaoClaude = await new Promise((ok) =>
        execFile('claude', ['--version'], { windowsHide: true, timeout: 15000 }, (err, out) => ok(err ? null : out.trim())),
      );
    }
    const cfg = db.config();
    return {
      claude: versaoClaude,
      pasta: RAIZ,
      metaToken: !!cfg.meta.accessToken.trim(),
      whatsapp: { provedor: cfg.whatsapp.provedor, destino: cfg.whatsapp.destino },
      proximos: { semanal: periodoSemanal(), mensal: periodoMensal() },
    };
  }),
);

// ---------- Clientes ----------

app.get('/api/clientes', rota(() => listarClientes()));
app.get('/api/clientes/:slug', rota((req) => detalheCliente(p(req, 'slug'))));
app.post('/api/clientes', rota((req) => criarCliente(req.body)));
app.put(
  '/api/clientes/:slug/ficha',
  rota((req) => {
    salvarFicha(p(req, 'slug'), String(req.body.ficha ?? ''));
    return { ok: true };
  }),
);
app.put(
  '/api/clientes/:slug/extras',
  rota((req) => {
    salvarExtras(p(req, 'slug'), req.body);
    return { ok: true };
  }),
);
app.get('/api/acompanhamentos', rota(() => acompanhamentos()));

app.get('/api/clientes/:slug/midias/:pasta/:nome', (req, res, next) => {
  try {
    res.sendFile(caminhoMidia(p(req, 'slug'), p(req, 'pasta'), p(req, 'nome')));
  } catch (e) {
    next(e);
  }
});

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, _f, cb) => {
      try {
        cb(null, pastaMidiasNovas(String(req.params.slug)));
      } catch (e: any) {
        cb(e, '');
      }
    },
    filename: (req, file, cb) => {
      const original = path.basename(Buffer.from(file.originalname, 'latin1').toString('utf8')).replace(/[<>:"/\\|?*]/g, '_');
      const dir = pastaMidiasNovas(String(req.params.slug));
      let nome = original;
      for (let i = 2; fs.existsSync(path.join(dir, nome)); i++) {
        const { name, ext } = path.parse(original);
        nome = `${name}-${i}${ext}`;
      }
      cb(null, nome);
    },
  }),
  limits: { fileSize: 1024 * 1024 * 1024 },
});
app.post('/api/clientes/:slug/midias', upload.array('arquivos', 30), rota((req) => ({ ok: true, enviados: (req.files as any[])?.length ?? 0 })));
app.put(
  '/api/clientes/:slug/midias/:nome/nota',
  rota((req) => {
    salvarNota(p(req, 'slug'), p(req, 'nome'), String(req.body.nota ?? ''));
    return { ok: true };
  }),
);
app.delete(
  '/api/clientes/:slug/midias/:pasta/:nome',
  rota((req) => {
    apagarMidia(p(req, 'slug'), p(req, 'pasta'), p(req, 'nome'));
    return { ok: true };
  }),
);

app.post(
  '/api/campanhas/briefing',
  rota((req) => ({ arquivo: salvarBriefing(String(req.body.clienteSlug), String(req.body.nome), String(req.body.markdown)) })),
);

// ---------- Chat com o Claude ----------

app.get(
  '/api/conversas',
  rota(() =>
    db.conversas().map(({ mensagens, ...c }) => ({
      ...c,
      total: mensagens.length,
      ultima: mensagens.at(-1)?.texto.slice(0, 120) ?? '',
      rodando: estaRodando(c.id),
    })),
  ),
);
app.get(
  '/api/conversas/:id',
  rota((req, res) => {
    const c = db.conversa(p(req, 'id'));
    if (!c) return void res.status(404).json({ erro: 'Conversa não encontrada' });
    return { ...c, rodando: estaRodando(c.id) };
  }),
);
app.post(
  '/api/conversas',
  rota((req) => {
    const agora = new Date().toISOString();
    const c: Conversa = {
      id: novoId(),
      titulo: String(req.body.titulo || 'Nova conversa').slice(0, 80),
      clienteSlug: req.body.clienteSlug || undefined,
      mensagens: [],
      criadaEm: agora,
      atualizadaEm: agora,
    };
    db.salvarConversa(c);
    return c;
  }),
);
app.patch(
  '/api/conversas/:id',
  rota((req, res) => {
    const c = db.conversa(p(req, 'id'));
    if (!c) return void res.status(404).json({ erro: 'Conversa não encontrada' });
    if (req.body.titulo) c.titulo = String(req.body.titulo).slice(0, 80);
    db.salvarConversa(c);
    return c;
  }),
);
app.delete(
  '/api/conversas/:id',
  rota((req) => {
    pararExecucao(p(req, 'id'));
    db.apagarConversa(p(req, 'id'));
    return { ok: true };
  }),
);
app.post('/api/conversas/:id/parar', rota((req) => ({ ok: pararExecucao(p(req, 'id')) })));

app.post('/api/conversas/:id/mensagens', async (req, res) => {
  const conversa = db.conversa(p(req, 'id'));
  const texto = String(req.body.texto ?? '').trim();
  if (!conversa) return void res.status(404).json({ erro: 'Conversa não encontrada' });
  if (!texto) return void res.status(400).json({ erro: 'Mensagem vazia' });
  if (estaRodando(conversa.id)) return void res.status(409).json({ erro: 'O Claude ainda está respondendo nesta conversa' });

  const agora = () => new Date().toISOString();
  const msgUsuario: MensagemChat = { id: novoId(), papel: 'usuario', texto, criadaEm: agora() };
  const msgClaude: MensagemChat = { id: novoId(), papel: 'claude', texto: '', ferramentas: [], criadaEm: agora() };
  conversa.mensagens.push(msgUsuario, msgClaude);
  if (conversa.mensagens.length === 2 && conversa.titulo === 'Nova conversa') conversa.titulo = texto.split('\n')[0].slice(0, 70);
  conversa.atualizadaEm = agora();
  db.salvarConversa(conversa);

  res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache');
  res.flushHeaders();
  let conectado = true;
  res.on('close', () => (conectado = false));
  const enviar = (e: EventoChat) => conectado && res.write(JSON.stringify(e) + '\n');
  enviar({ t: 'inicio', mensagemId: msgClaude.id });

  // Contexto do cliente na 1ª mensagem da conversa
  let prompt = texto;
  if (!conversa.sessionId && conversa.clienteSlug) {
    prompt = `[Contexto do painel: esta conversa é sobre o cliente "${conversa.clienteSlug}" — ficha em clientes/${conversa.clienteSlug}/ficha.md]\n\n${texto}`;
  }

  let ultimaGravacao = Date.now();
  const gravar = () => {
    const atual = db.conversa(conversa.id);
    if (!atual) return;
    const i = atual.mensagens.findIndex((m) => m.id === msgClaude.id);
    if (i >= 0) atual.mensagens[i] = { ...msgClaude };
    atual.sessionId = conversa.sessionId;
    atual.atualizadaEm = agora();
    db.salvarConversa(atual);
  };

  const r = await conversarComClaude(conversa.id, prompt, conversa.sessionId, (e) => {
    if (e.t === 'texto') msgClaude.texto += e.v;
    if (e.t === 'ferramenta') msgClaude.ferramentas!.push({ nome: e.nome, resumo: e.resumo });
    if (e.t === 'erro') {
      msgClaude.erro = true;
      msgClaude.texto += (msgClaude.texto ? '\n\n' : '') + `⚠️ ${e.v}`;
    }
    if (e.t === 'fim') msgClaude.custoUsd = e.custoUsd;
    if (Date.now() - ultimaGravacao > 3000) {
      ultimaGravacao = Date.now();
      gravar();
    }
    enviar(e);
  });
  if (r.sessionId) conversa.sessionId = r.sessionId;
  gravar();
  if (conectado) res.end();
});

// ---------- Relatórios ----------

const jobs = new Map<string, { status: 'rodando' | 'ok' | 'erro'; relatorio?: Relatorio; erro?: string; inicio: number }>();

app.get('/api/relatorios', rota(() => db.relatorios()));
app.get('/api/relatorios/previa-mensal', rota((req) => previaMensal(req.query.inicio && req.query.fim ? { inicio: String(req.query.inicio), fim: String(req.query.fim) } : undefined)));
app.get('/api/relatorios/arquivo', (req, res, next) => {
  const alvo = path.resolve(CLIENTES_DIR, String(req.query.caminho ?? ''));
  if (!alvo.startsWith(path.resolve(CLIENTES_DIR) + path.sep) || !/[\\/]relatorios[\\/][^\\/]+\.csv$/i.test(alvo) || !fs.existsSync(alvo)) return next(new Error('Arquivo não encontrado'));
  res.download(alvo);
});
app.post(
  '/api/relatorios/gerar',
  rota((req) => {
    const id = novoId();
    jobs.set(id, { status: 'rodando', inicio: Date.now() });
    const tipo = (req.body.tipo ?? 'semanal') as TipoRelatorio;
    gerarRelatorio(tipo, { inicio: req.body.inicio, fim: req.body.fim, clientes: req.body.clientes })
      .then((relatorio) => jobs.set(id, { status: 'ok', relatorio, inicio: Date.now() }))
      .catch((e) => jobs.set(id, { status: 'erro', erro: e.message, inicio: Date.now() }));
    const cfg = db.config();
    return { jobId: id, fonte: tipo === 'mensal' ? 'agregado' : cfg.relatorios.fonte === 'meta-api' && cfg.meta.accessToken.trim() ? 'meta-api' : 'exportacao' };
  }),
);
app.get(
  '/api/relatorios/job/:id',
  rota((req, res) => jobs.get(p(req, 'id')) ?? void res.status(404).json({ erro: 'Tarefa não encontrada' })),
);
app.put(
  '/api/relatorios/:id/texto',
  rota((req, res) => {
    const r = db.relatorios().find((x) => x.id === p(req, 'id'));
    if (!r) return void res.status(404).json({ erro: 'Relatório não encontrado' });
    r.texto = req.body.restaurar ? montarTexto(r) : String(req.body.texto ?? r.texto);
    db.salvarRelatorio(r);
    return r;
  }),
);
app.post('/api/relatorios/:id/enviar', rota((req) => enviarRelatorio(p(req, 'id'), req.body.para, req.body.texto)));
app.delete(
  '/api/relatorios/:id',
  rota((req) => {
    db.apagarRelatorio(p(req, 'id'));
    return { ok: true };
  }),
);

// ---------- Notificações (sininho) ----------

app.get('/api/notificacoes', rota(() => listarNotificacoes()));
app.post(
  '/api/notificacoes/lidas',
  rota((req) => {
    marcarLida(req.body?.id);
    return { ok: true };
  }),
);
app.delete(
  '/api/notificacoes/:id',
  rota((req) => {
    dispensar(p(req, 'id'));
    return { ok: true };
  }),
);

// ---------- Configurações ----------

app.get('/api/config', rota(() => db.config()));
app.put(
  '/api/config',
  rota((req) => {
    const atual = db.config();
    const nova = {
      ...atual,
      ...req.body,
      whatsapp: { ...atual.whatsapp, ...req.body.whatsapp },
      meta: { ...atual.meta, ...req.body.meta },
      relatorios: { ...atual.relatorios, ...req.body.relatorios },
      claude: { ...atual.claude, ...req.body.claude },
    };
    db.salvarConfig(nova);
    reagendar();
    return nova;
  }),
);
app.post(
  '/api/whatsapp/teste',
  rota((req) => enviarWhatsapp(String(req.body.numero || db.config().whatsapp.destino), '✅ Teste do Copiloto: o envio de relatórios por WhatsApp está funcionando.')),
);

// ---------- Front-end (produção) ----------

const dist = path.join(PAINEL_DIR, 'dist');
if (process.env.NODE_ENV === 'production' && fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get('/{*rota}', (req, res, next) => (req.path.startsWith('/api') ? next() : res.sendFile(path.join(dist, 'index.html'))));
}

app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  res.status(400).json({ erro: err?.message ?? 'Erro inesperado' });
});

const PORTA = Number(process.env.PORT ?? 3333);
const servidor = app.listen(PORTA, '127.0.0.1', () => {
  console.log(`\n  Copiloto rodando em http://127.0.0.1:${PORTA}  (pasta: ${RAIZ})\n`);
  if (process.env.SEM_AGENDADOR !== '1') reagendar();
  if (process.env.SEM_AGENDADOR !== '1') setTimeout(() => void recuperarAtrasados(), 20_000);
});
servidor.requestTimeout = 0;

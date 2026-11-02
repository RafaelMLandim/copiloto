import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Bot, ChevronDown, ChevronRight, MessageSquarePlus, Pencil, Send, Square, Trash2, Wrench } from 'lucide-react';
import { api, type ConversaResumo } from '../api';
import { Avatar, quando, useCarregar, useToast } from '../components/ui';
import type { Conversa, MensagemChat } from '../../shared/tipos';

const SUGESTOES = [
  'Como estão as campanhas ativas de todos os clientes esta semana?',
  'Faça os acompanhamentos agendados que já venceram',
  'Pause o anúncio com pior custo por resultado (me mostre antes)',
  'Sugira 3 novos ganchos de criativo para o cliente desta conversa',
];

function MensagemClaude({ m, rodando }: { m: MensagemChat; rodando: boolean }) {
  const [abrir, setAbrir] = useState(false);
  const fer = m.ferramentas ?? [];
  return (
    <div className={`msg claude ${m.erro ? 'err' : ''}`}>
      <div className="bot"><Bot size={17} /></div>
      <div className="bubble">
        {fer.length > 0 && (
          <>
            <button className="tools-toggle" onClick={() => setAbrir(!abrir)}>
              {abrir ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
              <Wrench size={12} /> {fer.length} ação(ões){rodando ? ` · ${fer.at(-1)?.nome}…` : ''}
            </button>
            {abrir && (
              <div className="tools">
                {fer.map((f, i) => (
                  <span key={i} className="tool" title={f.resumo}>
                    {f.nome}
                    {f.resumo && <span>{f.resumo}</span>}
                  </span>
                ))}
              </div>
            )}
          </>
        )}
        {m.texto ? (
          <div className="md">
            <Markdown remarkPlugins={[remarkGfm]} components={{ a: (p) => <a {...p} target="_blank" rel="noreferrer" /> }}>{m.texto}</Markdown>
          </div>
        ) : rodando ? (
          <div className="typing"><i /><i /><i /></div>
        ) : (
          <span className="muted">(sem resposta)</span>
        )}
        {!rodando && m.custoUsd !== undefined && <div className="muted" style={{ fontSize: 11, marginTop: 8 }}>custo ≈ US$ {m.custoUsd.toFixed(3)}</div>}
      </div>
    </div>
  );
}

export default function Chat() {
  const { id } = useParams();
  const nav = useNavigate();
  const loc = useLocation();
  const toast = useToast();
  const lista = useCarregar(api.conversas);
  const clientes = useCarregar(api.clientes);
  const [conv, setConv] = useState<Conversa>();
  const [rodando, setRodando] = useState(false);
  const [texto, setTexto] = useState('');
  const fim = useRef<HTMLDivElement>(null);
  const autoEnviado = useRef<string>(undefined);
  const caixa = useRef<HTMLTextAreaElement>(null);

  const carregar = async (cid: string) => {
    const c = await api.conversa(cid);
    setConv(c);
    setRodando(c.rodando);
    return c;
  };

  useEffect(() => {
    if (!id) {
      setConv(undefined);
      return;
    }
    carregar(id)
      .then((c) => {
        const enviar = (loc.state as any)?.enviar as string | undefined;
        if (enviar && autoEnviado.current !== id && c.mensagens.length === 0) {
          autoEnviado.current = id;
          nav(loc.pathname, { replace: true, state: null });
          void enviarTexto(enviar, c);
        }
      })
      .catch((e) => toast(e.message, 'erro'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Se a conversa já estava rodando (ex.: voltou para a tela), acompanha até terminar.
  useEffect(() => {
    if (!rodando || !id || !conv || conv.id !== id) return;
    if ((conv as any)._local) return;
    const t = setInterval(() => void carregar(id), 2500);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rodando, id, conv?.id]);

  useEffect(() => {
    fim.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [conv?.mensagens.length, conv?.mensagens.at(-1)?.texto.length]);

  const novaConversa = async (clienteSlug?: string) => {
    const c = await api.novaConversa(undefined, clienteSlug);
    await lista.recarregar();
    nav(`/chat/${c.id}`);
  };

  async function enviarTexto(msg: string, alvo?: Conversa) {
    let c = alvo ?? conv;
    if (!msg.trim()) return;
    if (!c) {
      c = await api.novaConversa();
      nav(`/chat/${c.id}`, { replace: true });
    }
    const cid = c.id;
    const agora = new Date().toISOString();
    const claude: MensagemChat = { id: 'tmp', papel: 'claude', texto: '', ferramentas: [], criadaEm: agora };
    setConv({ ...c, _local: true, mensagens: [...c.mensagens, { id: 'u', papel: 'usuario', texto: msg, criadaEm: agora }, claude] } as Conversa);
    setRodando(true);
    setTexto('');

    const atualizar = (fn: (m: MensagemChat) => MensagemChat) =>
      setConv((x) => (x && x.id === cid ? { ...x, mensagens: [...x.mensagens.slice(0, -1), fn(x.mensagens.at(-1)!)] } : x));

    try {
      await api.enviarMensagem(cid, msg, (e) => {
        if (e.t === 'texto') atualizar((m) => ({ ...m, texto: m.texto + e.v }));
        else if (e.t === 'ferramenta') atualizar((m) => ({ ...m, ferramentas: [...(m.ferramentas ?? []), { nome: e.nome, resumo: e.resumo }] }));
        else if (e.t === 'erro') atualizar((m) => ({ ...m, erro: true, texto: m.texto + (m.texto ? '\n\n' : '') + `⚠️ ${e.v}` }));
        else if (e.t === 'fim') atualizar((m) => ({ ...m, custoUsd: e.custoUsd }));
      });
    } catch (e: any) {
      toast(e.message, 'erro');
    } finally {
      setRodando(false);
      void lista.recarregar();
      if (cid === (id ?? cid)) void carregar(cid).catch(() => {});
    }
  }

  const parar = async () => {
    if (!conv) return;
    await api.pararConversa(conv.id);
    toast('Interrompido', 'info');
  };

  const apagar = async (c: ConversaResumo) => {
    if (!confirm(`Apagar a conversa "${c.titulo}"?`)) return;
    await api.apagarConversa(c.id);
    await lista.recarregar();
    if (c.id === id) nav('/chat');
  };

  const renomear = async () => {
    if (!conv) return;
    const t = prompt('Novo título da conversa', conv.titulo);
    if (!t?.trim()) return;
    await api.renomearConversa(conv.id, t.trim());
    setConv({ ...conv, titulo: t.trim() });
    void lista.recarregar();
  };

  const clienteConv = clientes.dados?.find((c) => c.slug === conv?.clienteSlug);

  return (
    <div className="chat">
      <div className="chat-list">
        <div className="head">
          <h2 style={{ fontSize: 17 }}>Conversas</h2>
          <button className="btn primary" onClick={() => void novaConversa()}><MessageSquarePlus size={16} /> Nova conversa</button>
          <select className="select" value="" onChange={(e) => e.target.value && void novaConversa(e.target.value)}>
            <option value="">+ Conversa sobre um cliente…</option>
            {clientes.dados?.map((c) => <option key={c.slug} value={c.slug}>{c.nome}</option>)}
          </select>
        </div>
        <div className="items">
          {lista.dados?.map((c) => (
            <div key={c.id} className="row" style={{ gap: 0 }}>
              <button className={`conv ${c.id === id ? 'on' : ''}`} onClick={() => nav(`/chat/${c.id}`)}>
                <b>{c.rodando && '● '}{c.titulo}</b>
                <span>{quando(c.atualizadaEm)} · {c.ultima || 'vazia'}</span>
              </button>
              <button className="btn ghost icon sm danger" onClick={() => void apagar(c)} title="Apagar"><Trash2 size={13} /></button>
            </div>
          ))}
          {lista.dados?.length === 0 && <div className="empty small">Nenhuma conversa.</div>}
        </div>
      </div>

      <div className="chat-main">
        <div className="chat-top">
          {clienteConv ? <Avatar nome={clienteConv.nome} cor={clienteConv.extras.cor} tam="sm" /> : <div className="bot" style={{ width: 30, height: 30, borderRadius: 9, background: 'linear-gradient(135deg,#8b7dff,#5a4ae8)', display: 'grid', placeItems: 'center', color: '#fff' }}><Bot size={16} /></div>}
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{conv?.titulo ?? 'Claude — seu gestor de tráfego'}</h2>
            <div className="muted small">{clienteConv ? `Cliente: ${clienteConv.nome}` : 'Lê as fichas, usa o navegador e segue o CLAUDE.md (sempre em rascunho)'}</div>
          </div>
          {conv && <button className="btn ghost icon sm" onClick={renomear} title="Renomear"><Pencil size={14} /></button>}
          {rodando && <span className="badge violet"><span className="dot ok" /> trabalhando…</span>}
        </div>

        <div className="msgs">
          <div className="msgs-inner">
            {(!conv || conv.mensagens.length === 0) && (
              <div className="empty" style={{ paddingTop: 60 }}>
                <div className="brand-logo" style={{ width: 54, height: 54, borderRadius: 16 }}><Bot size={26} color="#fff" /></div>
                <h2 style={{ color: 'var(--text)', fontSize: 19, marginTop: 8 }}>Como posso ajudar?</h2>
                <p style={{ margin: 0, maxWidth: 480 }}>Peça ajustes em campanhas, análises, textos de anúncio ou uma campanha nova. Eu crio sempre em rascunho — você publica.</p>
                <div className="suggestions" style={{ marginTop: 14, maxWidth: 680 }}>
                  {SUGESTOES.map((s) => <button key={s} className="sugg" onClick={() => void enviarTexto(s)}>{s}</button>)}
                </div>
              </div>
            )}
            {conv?.mensagens.map((m, i) =>
              m.papel === 'usuario' ? (
                <div key={m.id + i} className="msg user"><div className="bubble">{m.texto}</div></div>
              ) : (
                <MensagemClaude key={m.id + i} m={m} rodando={rodando && i === conv.mensagens.length - 1} />
              ),
            )}
            <div ref={fim} />
          </div>
        </div>

        <div className="composer">
          <div className="composer-box">
            <textarea
              ref={caixa}
              rows={1}
              value={texto}
              placeholder={rodando ? 'O Claude está trabalhando…' : 'Escreva um ajuste, pergunta ou pedido…  (Enter envia · Shift+Enter quebra linha)'}
              onChange={(e) => {
                setTexto(e.target.value);
                e.target.style.height = 'auto';
                e.target.style.height = Math.min(220, e.target.scrollHeight) + 'px';
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  if (!rodando) void enviarTexto(texto);
                }
              }}
            />
            {rodando ? (
              <button className="btn danger" onClick={parar} title="Parar"><Square size={15} /> Parar</button>
            ) : (
              <button className="btn primary" onClick={() => void enviarTexto(texto)} disabled={!texto.trim()}><Send size={15} /></button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

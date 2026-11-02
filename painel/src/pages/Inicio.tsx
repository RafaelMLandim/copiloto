import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, BarChart3, Bot, CalendarClock, ImagePlus, MessageSquare, Plus, Rocket, Users, Wallet } from 'lucide-react';
import { api, type Status } from '../api';
import { Avatar, StatusBadge, brl, dataBr, num, quando, useCarregar } from '../components/ui';

export default function Inicio({ status }: { status?: Status }) {
  const nav = useNavigate();
  const clientes = useCarregar(api.clientes);
  const acomp = useCarregar(api.acompanhamentos);
  const rels = useCarregar(api.relatorios);
  const convs = useCarregar(api.conversas);

  const ativos = clientes.dados?.filter((c) => c.status === 'ativo') ?? [];
  const midiasNovas = clientes.dados?.reduce((s, c) => s + c.midiasNovas, 0) ?? 0;
  const ultimoSemanal = rels.dados?.find((r) => r.tipo === 'semanal');
  const invest = ultimoSemanal?.clientes.reduce((s, c) => s + (c.total?.investido ?? 0), 0) ?? 0;
  const resultados = ultimoSemanal?.clientes.reduce((s, c) => s + (c.total?.resultados ?? 0), 0) ?? 0;
  const hora = new Date().getHours();
  const saudacao = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite';
  const hoje = new Date().toISOString().slice(0, 10);

  return (
    <div className="page stack-lg">
      <div className="hero">
        <div className="row between wrap" style={{ gap: 20 }}>
          <div>
            <h1>{saudacao}, Rafael 👋</h1>
            <p>
              {ativos.length} clientes ativos · {midiasNovas} mídia{midiasNovas === 1 ? '' : 's'} esperando campanha
              {acomp.dados?.length ? ` · ${acomp.dados.length} acompanhamento${acomp.dados.length > 1 ? 's' : ''} na fila` : ''}
            </p>
          </div>
          <div className="row wrap">
            <button className="btn solid lg" onClick={() => nav('/campanha/nova')}>
              <Rocket size={17} /> Nova campanha
            </button>
            <button className="btn lg" onClick={() => nav('/chat')}>
              <Bot size={17} /> Falar com o Claude
            </button>
          </div>
        </div>
      </div>

      <div className="grid g4">
        <div className="card stat">
          <div className="ico violet"><Users size={19} /></div>
          <div className="v">{clientes.dados ? ativos.length : '—'}</div>
          <div className="l">Clientes ativos</div>
          <div className="sub">{clientes.dados?.length ?? 0} no total</div>
        </div>
        <div className="card stat">
          <div className="ico green"><Wallet size={19} /></div>
          <div className="v">{ultimoSemanal ? brl(invest) : '—'}</div>
          <div className="l">Investido na última semana</div>
          <div className="sub">{ultimoSemanal ? `${dataBr(ultimoSemanal.inicio)} a ${dataBr(ultimoSemanal.fim)}` : 'gere o 1º relatório'}</div>
        </div>
        <div className="card stat">
          <div className="ico blue"><MessageSquare size={19} /></div>
          <div className="v">{ultimoSemanal ? num(resultados) : '—'}</div>
          <div className="l">Conversas + leads</div>
          <div className="sub">{ultimoSemanal && resultados ? `${brl(invest / resultados)} por resultado` : 'semana de sábado a sexta'}</div>
        </div>
        <div className="card stat">
          <div className="ico amber"><ImagePlus size={19} /></div>
          <div className="v">{clientes.dados ? midiasNovas : '—'}</div>
          <div className="l">Mídias novas</div>
          <div className="sub">prontas para usar em anúncios</div>
        </div>
      </div>

      <div className="grid cols-main">
        <div className="stack-lg">
          <div className="card">
            <div className="card-head">
              <h3><Users size={17} /> Clientes</h3>
              <div className="row">
                <Link to="/clientes/novo" className="btn sm"><Plus size={15} /> Novo</Link>
                <Link to="/clientes" className="btn sm ghost">Ver todos <ArrowRight size={14} /></Link>
              </div>
            </div>
            <div className="list">
              {clientes.carregando && !clientes.dados && [1, 2, 3].map((i) => <div key={i} className="list-item"><div className="skeleton" style={{ height: 36, width: '100%' }} /></div>)}
              {clientes.dados?.map((c) => (
                <Link key={c.slug} to={`/clientes/${c.slug}`} className="list-item link">
                  <Avatar nome={c.nome} cor={c.extras.cor} />
                  <div className="grow">
                    <div className="t">{c.nome}</div>
                    <div className="s">{c.nicho} · conta {c.contaId || 'sem ID'}</div>
                  </div>
                  {c.midiasNovas > 0 && <span className="badge amber">{c.midiasNovas} mídia{c.midiasNovas > 1 ? 's' : ''}</span>}
                  <StatusBadge status={c.status} />
                </Link>
              ))}
              {clientes.dados?.length === 0 && (
                <div className="empty">
                  <Users size={34} /> Nenhum cliente ainda.
                  <Link to="/clientes/novo" className="btn primary sm">Cadastrar o primeiro</Link>
                </div>
              )}
            </div>
          </div>

          <div className="card">
            <div className="card-head">
              <h3><Bot size={17} /> Conversas recentes</h3>
              <Link to="/chat" className="btn sm ghost">Abrir chat <ArrowRight size={14} /></Link>
            </div>
            <div className="list">
              {convs.dados?.slice(0, 4).map((c) => (
                <Link key={c.id} to={`/chat/${c.id}`} className="list-item link">
                  <div className="ico violet" style={{ width: 34, height: 34, borderRadius: 10, display: 'grid', placeItems: 'center' }}><MessageSquare size={16} /></div>
                  <div className="grow">
                    <div className="t">{c.titulo}</div>
                    <div className="s">{c.ultima || 'sem mensagens'}</div>
                  </div>
                  {c.rodando ? <span className="badge violet">respondendo…</span> : <span className="muted small">{quando(c.atualizadaEm)}</span>}
                </Link>
              ))}
              {convs.dados?.length === 0 && <div className="empty">Nenhuma conversa ainda — peça ajustes, análises ou campanhas ao Claude.</div>}
            </div>
          </div>
        </div>

        <div className="stack-lg">
          <div className="card">
            <div className="card-head"><h3><CalendarClock size={17} /> Acompanhamentos</h3></div>
            <div className="list">
              {acomp.dados?.map((a, i) => {
                const atrasado = /^\d{4}-\d{2}-\d{2}$/.test(a.data) && a.data <= hoje;
                return (
                  <div key={i} className="list-item" style={{ alignItems: 'flex-start' }}>
                    <span className={`badge ${atrasado ? 'red' : /^\d/.test(a.data) ? 'violet' : ''}`} style={{ marginTop: 2 }}>
                      {/^\d{4}-/.test(a.data) ? dataBr(a.data).slice(0, 5) : a.data}
                    </span>
                    <div className="grow">
                      <div className="t" style={{ whiteSpace: 'normal' }}>{a.cliente}</div>
                      <div className="s" style={{ whiteSpace: 'normal' }}>{a.oque}</div>
                    </div>
                  </div>
                );
              })}
              {acomp.dados?.length === 0 && <div className="empty small">Nada agendado.</div>}
            </div>
          </div>

          <div className="card">
            <div className="card-head">
              <h3><BarChart3 size={17} /> Próximos relatórios</h3>
              <Link to="/relatorios" className="btn sm ghost">Ver <ArrowRight size={14} /></Link>
            </div>
            <div className="card-pad stack">
              <div className="row between">
                <div>
                  <b>Semanal</b>
                  <div className="muted small">seg a sex</div>
                </div>
                <span className="badge">{status ? `${dataBr(status.proximos.semanal.inicio).slice(0, 5)} → ${dataBr(status.proximos.semanal.fim).slice(0, 5)}` : '…'}</span>
              </div>
              <div className="row between">
                <div>
                  <b>Mensal</b>
                  <div className="muted small">mês fechado</div>
                </div>
                <span className="badge">{status ? `${dataBr(status.proximos.mensal.inicio).slice(0, 5)} → ${dataBr(status.proximos.mensal.fim).slice(0, 5)}` : '…'}</span>
              </div>
              {status && !status.whatsapp.destino && (
                <Link to="/configuracoes" className="callout warn small" style={{ color: 'inherit' }}>
                  Configure o WhatsApp que vai receber os relatórios →
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

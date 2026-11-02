import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart3, Bell, BellRing, CalendarDays, CheckCircle2, X } from 'lucide-react';
import { api } from '../api';
import { quando } from './ui';
import type { Notificacao } from '../../shared/tipos';

function avisarNoWindows(n: Notificacao) {
  try {
    if ('Notification' in window && Notification.permission === 'granted') {
      const aviso = new Notification(n.titulo, { body: n.texto, tag: n.id });
      aviso.onclick = () => window.focus();
    }
  } catch {
    /* sem suporte */
  }
}

export default function Sininho() {
  const nav = useNavigate();
  const [lista, setLista] = useState<Notificacao[]>([]);
  const [aberto, setAberto] = useState(false);
  const [permissao, setPermissao] = useState(() => ('Notification' in window ? Notification.permission : 'denied'));
  const vistas = useRef<Set<string> | null>(null);
  const caixa = useRef<HTMLDivElement>(null);

  const carregar = useCallback(async () => {
    try {
      const l = await api.notificacoes();
      // avisa no Windows só as que apareceram depois que o painel abriu
      if (vistas.current) l.filter((n) => !n.lida && !vistas.current!.has(n.id)).forEach(avisarNoWindows);
      vistas.current = new Set(l.map((n) => n.id));
      setLista(l);
    } catch {
      /* servidor fora do ar */
    }
  }, []);

  useEffect(() => {
    void carregar();
    const t = setInterval(() => void carregar(), 60_000);
    const foco = () => void carregar();
    window.addEventListener('focus', foco);
    return () => {
      clearInterval(t);
      window.removeEventListener('focus', foco);
    };
  }, [carregar]);

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => {
      if (caixa.current && !caixa.current.contains(e.target as Node)) setAberto(false);
    };
    document.addEventListener('mousedown', fora);
    return () => document.removeEventListener('mousedown', fora);
  }, [aberto]);

  const pendentes = lista.filter((n) => !n.concluida && !n.lida).length;

  const gerar = async (n: Notificacao) => {
    await api.marcarLidas(n.id);
    setAberto(false);
    nav(`/relatorios?gerar=${n.tipo}&inicio=${n.inicio}&fim=${n.fim}${n.concluida ? '&ver=1' : ''}`);
    void carregar();
  };
  const dispensar = async (n: Notificacao) => {
    await api.dispensarNotificacao(n.id);
    void carregar();
  };
  const ativarWindows = async () => {
    if (!('Notification' in window)) return;
    setPermissao(await Notification.requestPermission());
  };

  return (
    <div className="bell-wrap" ref={caixa}>
      <button
        className={`bell ${aberto ? 'on' : ''} ${pendentes ? 'tocando' : ''}`}
        onClick={() => {
          setAberto(!aberto);
          void carregar();
        }}
        title="Notificações"
      >
        {pendentes ? <BellRing size={17} /> : <Bell size={17} />}
        {pendentes > 0 && <span className="count">{pendentes}</span>}
      </button>
      {aberto && (
        <div className="notif-pop">
          <div className="card-head" style={{ borderBottom: 0 }}>
            <h3><Bell size={16} /> Notificações</h3>
            {lista.some((n) => !n.lida) && (
              <button className="btn sm ghost" onClick={() => void api.marcarLidas().then(carregar)}>Marcar como lidas</button>
            )}
          </div>
          {permissao === 'default' && (
            <div style={{ padding: '0 16px 12px' }}>
              <button className="btn sm" style={{ width: '100%' }} onClick={ativarWindows}>Também avisar no Windows (com o painel aberto)</button>
            </div>
          )}
          {lista.length === 0 && <div className="empty small">Nada por aqui. Toda sexta e no fim do mês eu te lembro dos relatórios.</div>}
          {lista.map((n) => (
            <div key={n.id} className={`notif ${!n.lida && !n.concluida ? 'nova' : ''}`}>
              <div className={`ico ${n.concluida ? 'green' : n.tipo === 'mensal' ? 'amber' : 'violet'}`}>
                {n.concluida ? <CheckCircle2 size={18} /> : n.tipo === 'mensal' ? <BarChart3 size={18} /> : <CalendarDays size={18} />}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <b>{n.titulo}</b>
                <p>{n.concluida ? 'Feito — o relatório desse período já foi gerado.' : n.texto}</p>
                <div className="row">
                  <button className={`btn sm ${n.concluida ? '' : 'primary'}`} onClick={() => void gerar(n)}>
                    {n.concluida ? 'Ver relatório' : n.tipo === 'mensal' ? 'Fazer o geral' : 'Gerar agora'}
                  </button>
                  <span className="muted small">{quando(n.criadaEm)}</span>
                  <span className="spacer" />
                  <button className="btn ghost icon sm" onClick={() => void dispensar(n)} title="Dispensar"><X size={13} /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

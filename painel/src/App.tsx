import { useEffect, useState } from 'react';
import { NavLink, Route, Routes } from 'react-router-dom';
import { BarChart3, Bot, Home, Moon, Rocket, Settings, Sun, Users } from 'lucide-react';
import { api, type Status } from './api';
import Inicio from './pages/Inicio';
import Clientes from './pages/Clientes';
import ClientePagina from './pages/ClientePagina';
import NovoCliente from './pages/NovoCliente';
import NovaCampanha from './pages/NovaCampanha';
import Chat from './pages/Chat';
import Relatorios from './pages/Relatorios';
import Configuracoes from './pages/Configuracoes';
import Sininho from './components/Sininho';

export default function App() {
  const [status, setStatus] = useState<Status>();
  const [tema, setTema] = useState(() => document.documentElement.dataset.theme ?? 'light');

  useEffect(() => {
    api.status().then(setStatus).catch(() => setStatus(undefined));
  }, []);

  const trocarTema = () => {
    const novo = tema === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = novo;
    try {
      localStorage.setItem('tema', novo);
    } catch {
      /* ok */
    }
    setTema(novo);
  };

  const link = (to: string, icone: React.ReactNode, rotulo: string, end = false) => (
    <NavLink to={to} end={end} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
      {icone}
      <span className="lbl">{rotulo}</span>
    </NavLink>
  );

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-logo">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 17l5-10 4 7 2-3 4 6" />
            </svg>
          </div>
          <div>
            <b>Copiloto</b>
            <small>Gestão de tráfego</small>
          </div>
          <Sininho />
        </div>

        <NavLink to="/campanha/nova" className="nav-cta">
          <Rocket size={17} />
          <span className="lbl">Nova campanha</span>
        </NavLink>

        <div className="nav-sec">Painel</div>
        {link('/', <Home size={18} />, 'Início', true)}
        {link('/clientes', <Users size={18} />, 'Clientes')}
        {link('/chat', <Bot size={18} />, 'Conversar com Claude')}
        {link('/relatorios', <BarChart3 size={18} />, 'Relatórios')}
        <div className="nav-sec">Sistema</div>
        {link('/configuracoes', <Settings size={18} />, 'Configurações')}

        <div className="sidebar-foot">
          <div className="row">
            <span className={`dot ${status?.claude ? 'ok' : status ? 'off' : 'warn'}`} />
            {status?.claude ? 'Claude conectado' : status ? 'Claude não encontrado' : 'Verificando…'}
          </div>
          <div className="row">
            <span className={`dot ${status?.metaToken ? 'ok' : 'warn'}`} />
            {status?.metaToken ? 'API do Meta ativa' : 'Métricas via navegador'}
          </div>
          <div className="row">
            <span className={`dot ${status?.whatsapp.destino ? 'ok' : 'warn'}`} />
            {status?.whatsapp.destino ? 'WhatsApp configurado' : 'WhatsApp sem destino'}
          </div>
          <button className="theme-btn" onClick={trocarTema}>
            {tema === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
            {tema === 'dark' ? 'Tema claro' : 'Tema escuro'}
          </button>
        </div>
      </aside>

      <main className="main">
        <Routes>
          <Route path="/" element={<Inicio status={status} />} />
          <Route path="/clientes" element={<Clientes />} />
          <Route path="/clientes/novo" element={<NovoCliente />} />
          <Route path="/clientes/:slug" element={<ClientePagina />} />
          <Route path="/campanha/nova" element={<NovaCampanha />} />
          <Route path="/chat" element={<Chat />} />
          <Route path="/chat/:id" element={<Chat />} />
          <Route path="/relatorios" element={<Relatorios />} />
          <Route path="/configuracoes" element={<Configuracoes />} />
        </Routes>
      </main>
    </div>
  );
}

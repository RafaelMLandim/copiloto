import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Hash, ImageIcon, Megaphone, Plus, Search, Users } from 'lucide-react';
import { api } from '../api';
import { Avatar, Seg, StatusBadge, useCarregar } from '../components/ui';

export default function Clientes() {
  const { dados, carregando, erro } = useCarregar(api.clientes);
  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState<'todos' | 'ativo' | 'pausado' | 'prospect'>('todos');

  const lista = (dados ?? []).filter(
    (c) =>
      (filtro === 'todos' || c.status === filtro) &&
      `${c.nome} ${c.nicho} ${c.contaId}`.toLowerCase().includes(busca.toLowerCase()),
  );

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Clientes</h1>
          <p>Cada cliente tem uma ficha, uma pasta de mídias e a própria conta de anúncios.</p>
        </div>
        <Link to="/clientes/novo" className="btn primary">
          <Plus size={16} /> Novo cliente
        </Link>
      </div>

      <div className="row wrap" style={{ marginBottom: 20 }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 220, maxWidth: 380 }}>
          <Search size={16} style={{ position: 'absolute', left: 12, top: 12, color: 'var(--muted)' }} />
          <input className="input" style={{ paddingLeft: 36 }} placeholder="Buscar por nome, nicho ou conta…" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        <Seg value={filtro} onChange={setFiltro} options={[['todos', 'Todos'], ['ativo', 'Ativos'], ['pausado', 'Pausados'], ['prospect', 'Prospects']]} />
      </div>

      {erro && <div className="callout danger">{erro}</div>}

      <div className="grid g3">
        {carregando && !dados && [1, 2, 3].map((i) => <div key={i} className="card skeleton" style={{ height: 150 }} />)}
        {lista.map((c) => (
          <Link key={c.slug} to={`/clientes/${c.slug}`} className="card client-card">
            <div className="top">
              <Avatar nome={c.nome} cor={c.extras.cor} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="name">{c.nome}</div>
                <div className="niche">{c.nicho}</div>
              </div>
              <StatusBadge status={c.status} />
            </div>
            <div className="meta">
              <span title="Conta de anúncios"><Hash size={13} /> {c.contaId || 'sem conta'}</span>
              <span title="Campanhas no histórico"><Megaphone size={13} /> {c.campanhas}</span>
              <span title="Mídias novas" style={c.midiasNovas ? { color: 'var(--amber)', fontWeight: 600 } : {}}>
                <ImageIcon size={13} /> {c.midiasNovas} nova{c.midiasNovas === 1 ? '' : 's'}
              </span>
            </div>
          </Link>
        ))}
        <Link to="/clientes/novo" className="card client-card" style={{ borderStyle: 'dashed', placeItems: 'center', color: 'var(--muted)', minHeight: 140 }}>
          <div style={{ display: 'grid', justifyItems: 'center', gap: 6 }}>
            <Plus size={24} />
            Adicionar cliente
          </div>
        </Link>
      </div>
      {dados && lista.length === 0 && (
        <div className="empty">
          <Users size={34} /> Nenhum cliente encontrado.
        </div>
      )}
    </div>
  );
}

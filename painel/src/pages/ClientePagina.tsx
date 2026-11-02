import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ArrowLeft, Bot, ExternalLink, FileText, ImageIcon, PenLine, Rocket, Save, Send } from 'lucide-react';
import { api } from '../api';
import { Avatar, Field, StatusBadge, Switch, useCarregar, useToast } from '../components/ui';
import { Dropzone, MidiaCard } from '../components/Midias';

type Aba = 'ficha' | 'midias' | 'editar' | 'relatorio';

export default function ClientePagina() {
  const { slug = '' } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const { dados: c, erro, recarregar } = useCarregar(() => api.cliente(slug), [slug]);
  const [aba, setAba] = useState<Aba>('ficha');
  const [ficha, setFicha] = useState('');
  const [wpp, setWpp] = useState('');
  const [incluir, setIncluir] = useState(true);
  const [cor, setCor] = useState('');

  useEffect(() => {
    if (!c) return;
    setFicha(c.ficha);
    setWpp(c.extras.whatsappRelatorio ?? '');
    setIncluir(c.extras.incluirRelatorio !== false);
    setCor(c.extras.cor ?? '');
  }, [c]);

  if (erro) return <div className="page"><div className="callout danger">{erro}</div></div>;
  if (!c) return <div className="page"><div className="skeleton" style={{ height: 120 }} /></div>;

  const conversar = async () => {
    const conv = await api.novaConversa(`${c.nome}: ajustes`, c.slug);
    nav(`/chat/${conv.id}`);
  };
  const salvarFicha = async () => {
    try {
      await api.salvarFicha(slug, ficha);
      toast('Ficha salva', 'ok');
      await recarregar();
      setAba('ficha');
    } catch (e: any) {
      toast(e.message, 'erro');
    }
  };
  const salvarExtras = async () => {
    try {
      await api.salvarExtras(slug, { whatsappRelatorio: wpp.trim() || undefined, incluirRelatorio: incluir, cor: cor || undefined });
      toast('Preferências salvas', 'ok');
      await recarregar();
    } catch (e: any) {
      toast(e.message, 'erro');
    }
  };

  const aba_ = (id: Aba, icone: React.ReactNode, rotulo: string) => (
    <button className={aba === id ? 'on' : ''} onClick={() => setAba(id)}>
      {icone} {rotulo}
    </button>
  );

  return (
    <div className="page">
      <Link to="/clientes" className="crumb"><ArrowLeft size={14} /> Clientes</Link>
      <div className="card card-pad" style={{ marginBottom: 22 }}>
        <div className="row wrap" style={{ gap: 16 }}>
          <Avatar nome={c.nome} cor={c.extras.cor} tam="lg" />
          <div style={{ flex: 1, minWidth: 220 }}>
            <div className="row wrap">
              <h1 style={{ fontSize: 22 }}>{c.nome}</h1>
              <StatusBadge status={c.status} />
            </div>
            <div className="muted" style={{ marginTop: 3 }}>
              {c.nicho} · conta <code>{c.contaId || 'sem ID'}</code> · {c.campanhas} campanha{c.campanhas === 1 ? '' : 's'} no histórico
            </div>
          </div>
          <div className="row wrap">
            {c.contaId && (
              <a className="btn" target="_blank" rel="noreferrer" href={`https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${c.contaId}`}>
                <ExternalLink size={15} /> Gerenciador
              </a>
            )}
            <button className="btn" onClick={conversar}><Bot size={15} /> Pedir ajuste</button>
            <button className="btn primary" onClick={() => nav(`/campanha/nova?cliente=${c.slug}`)}><Rocket size={15} /> Nova campanha</button>
          </div>
        </div>
      </div>

      <div className="tabs">
        {aba_('ficha', <FileText size={15} />, 'Ficha')}
        {aba_('midias', <ImageIcon size={15} />, `Mídias (${c.midias.novas.length} novas)`)}
        {aba_('editar', <PenLine size={15} />, 'Editar ficha')}
        {aba_('relatorio', <Send size={15} />, 'Relatório e WhatsApp')}
      </div>

      {aba === 'ficha' && (
        <div className="card card-pad md">
          <Markdown remarkPlugins={[remarkGfm]}>{c.ficha}</Markdown>
        </div>
      )}

      {aba === 'midias' && (
        <div className="stack-lg">
          <Dropzone slug={slug} onEnviado={recarregar} />
          <div>
            <h3 style={{ fontSize: 15, marginBottom: 12 }}>Novas <span className="muted small">— ainda não usadas em anúncio</span></h3>
            {c.midias.novas.length ? (
              <div className="media-grid">{c.midias.novas.map((m) => <MidiaCard key={m.nome} slug={slug} m={m} onMudou={recarregar} />)}</div>
            ) : (
              <div className="empty card">Nenhuma mídia nova. Envie acima ou solte na pasta <code>clientes/{slug}/midias/novas</code>.</div>
            )}
          </div>
          {c.midias.usadas.length > 0 && (
            <div>
              <h3 style={{ fontSize: 15, marginBottom: 12 }}>Usadas <span className="muted small">— já foram para anúncios</span></h3>
              <div className="media-grid">{c.midias.usadas.map((m) => <MidiaCard key={m.nome} slug={slug} m={m} onMudou={recarregar} />)}</div>
            </div>
          )}
        </div>
      )}

      {aba === 'editar' && (
        <div className="card card-pad stack">
          <div className="callout violet small">
            Esta é a mesma <code>ficha.md</code> que o Claude lê. Mantenha os títulos (## Dados, ## Contas…) para o painel continuar entendendo.
          </div>
          <textarea className="textarea mono" style={{ minHeight: 520 }} value={ficha} onChange={(e) => setFicha(e.target.value)} />
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <button className="btn ghost" onClick={() => setFicha(c.ficha)}>Desfazer</button>
            <button className="btn primary" onClick={salvarFicha} disabled={ficha === c.ficha}><Save size={15} /> Salvar ficha</button>
          </div>
        </div>
      )}

      {aba === 'relatorio' && (
        <div className="card card-pad stack" style={{ maxWidth: 640 }}>
          <div className="toggle-row">
            <div>
              <b>Incluir nos relatórios automáticos</b>
              <small>Semanal (sáb–sex) e mensal</small>
            </div>
            <Switch checked={incluir} onChange={setIncluir} />
          </div>
          <Field label="WhatsApp do cliente para receber o relatório dele" hint="Opcional. Só é usado se “Enviar também para os clientes” estiver ligado nas Configurações.">
            <input className="input" value={wpp} onChange={(e) => setWpp(e.target.value)} placeholder="+55 61 9…" />
          </Field>
          <Field label="Cor do cliente no painel">
            <div className="row">
              <input type="color" value={cor || '#6d5efc'} onChange={(e) => setCor(e.target.value)} style={{ width: 44, height: 36, border: 0, background: 'none', cursor: 'pointer' }} />
              {cor && <button className="btn sm ghost" onClick={() => setCor('')}>Usar automática</button>}
            </div>
          </Field>
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <button className="btn primary" onClick={salvarExtras}><Save size={15} /> Salvar</button>
          </div>
        </div>
      )}
    </div>
  );
}

import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { BarChart3, CalendarDays, CalendarRange, Check, Download, ExternalLink, Layers, Loader2, Pencil, RotateCcw, Send, Trash2, X } from 'lucide-react';
import { api } from '../api';
import { Field, Modal, Switch, brl, dataBr, num, quando, useCarregar, useToast } from '../components/ui';
import type { Relatorio, TipoRelatorio } from '../../shared/tipos';

const NOME_TIPO: Record<TipoRelatorio, string> = { semanal: 'Semanal', mensal: 'Mensal', personalizado: 'Personalizado', complemento: 'Complemento' };
const NOME_FONTE: Record<Relatorio['fonte'], string> = {
  exportacao: 'exportado do Gerenciador',
  'meta-api': 'API do Meta',
  'claude-navegador': 'lido pelo Claude',
  agregado: 'soma dos relatórios salvos',
};
const curto = (s: string) => dataBr(s).slice(0, 5);
const falhou = (r: Relatorio) => r.clientes.length > 0 && r.clientes.every((c) => c.erro && !c.total.investido && !c.total.impressoes);
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const tituloMes = (s: string) => `${MESES[Number(s.slice(5, 7)) - 1]}/${s.slice(0, 4)}`;

function KPIs({ m }: { m: Relatorio['clientes'][number]['total'] }) {
  return (
    <div className="kpi-row">
      <div className="kpi"><b>{brl(m.investido)}</b><span>investido</span></div>
      <div className="kpi"><b>{num(m.alcance)}</b><span>alcance</span></div>
      <div className="kpi"><b>{num(m.impressoes)}</b><span>impressões</span></div>
      <div className="kpi"><b>{m.ctr.toFixed(2).replace('.', ',')}%</b><span>CTR</span></div>
      <div className="kpi"><b>{num(m.conversas)}</b><span>conversas</span></div>
      <div className="kpi"><b>{num(m.leads)}</b><span>leads</span></div>
      <div className="kpi"><b>{m.custoPorResultado != null ? brl(m.custoPorResultado) : '—'}</b><span>por resultado</span></div>
    </div>
  );
}

export default function Relatorios() {
  const toast = useToast();
  const lista = useCarregar(api.relatorios);
  const cfg = useCarregar(api.config);
  const previa = useCarregar(api.previaMensal);
  const [verComplementos, setVerComplementos] = useState(false);
  const [selId, setSelId] = useState<string>();
  const [gerando, setGerando] = useState<{ tipo: TipoRelatorio; desde: number; fonte: string }>();
  const [personalizado, setPersonalizado] = useState(false);
  const [ini, setIni] = useState('');
  const [fimP, setFimP] = useState('');
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState('');
  const [outroNumero, setOutroNumero] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [, tick] = useState(0);
  const [params, setParams] = useSearchParams();

  const visiveis = (lista.dados ?? []).filter((x) => verComplementos || x.tipo !== 'complemento' || x.id === selId);
  const sel = lista.dados?.find((r) => r.id === selId) ?? visiveis[0];
  useEffect(() => {
    setTexto(sel?.texto ?? '');
    setEditando(false);
  }, [sel?.id, sel?.texto]);

  useEffect(() => {
    if (!gerando) return;
    const t = setInterval(() => tick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, [gerando]);

  const gerar = async (tipo: TipoRelatorio, inicio?: string, fim?: string) => {
    try {
      const { jobId, fonte } = await api.gerarRelatorio(tipo, inicio, fim);
      setGerando({ tipo, desde: Date.now(), fonte });
      setPersonalizado(false);
      for (;;) {
        await new Promise((r) => setTimeout(r, 2500));
        const j = await api.job(jobId);
        if (j.status === 'rodando') continue;
        if (j.status === 'erro') throw new Error(j.erro);
        await lista.recarregar();
        void previa.recarregar();
        setSelId(j.relatorio?.id);
        toast('Relatório gerado', 'ok');
        break;
      }
    } catch (e: any) {
      toast(e.message, 'erro');
    } finally {
      setGerando(undefined);
    }
  };

  // Vindo do sininho: /relatorios?gerar=semanal&inicio=...&fim=...
  useEffect(() => {
    const tipo = params.get('gerar') as TipoRelatorio | null;
    const inicio = params.get('inicio') ?? undefined;
    const fim = params.get('fim') ?? undefined;
    if (!tipo || !lista.dados) return;
    setParams({}, { replace: true });
    const existente = lista.dados.find((x) => x.tipo === tipo && x.inicio === inicio && x.fim === fim && !falhou(x));
    if (existente) setSelId(existente.id);
    else if (!gerando) void gerar(tipo, inicio, fim);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, lista.dados]);

  const enviar = async (para?: string) => {
    if (!sel) return;
    setEnviando(true);
    try {
      const r = await api.enviarRelatorio(sel.id, para, texto);
      for (const e of r) {
        if (e.ok) toast(`Enviado para ${e.para}`, 'ok');
        else if (e.link) {
          window.open(e.link, '_blank');
          toast(cfg.dados?.whatsapp.provedor === 'link' ? 'Abrindo o WhatsApp com o texto pronto' : `Falhou (${e.detalhe}) — abrindo link do WhatsApp`, e.detalhe?.startsWith('Modo link') ? 'info' : 'erro');
        } else toast(e.detalhe ?? 'Falhou', 'erro');
      }
      await lista.recarregar();
    } catch (e: any) {
      toast(e.message, 'erro');
    } finally {
      setEnviando(false);
    }
  };

  const salvarTexto = async (restaurar = false) => {
    if (!sel) return;
    const r = await api.salvarTextoRelatorio(sel.id, texto, restaurar);
    setTexto(r.texto);
    setEditando(false);
    await lista.recarregar();
  };

  const apagar = async () => {
    if (!sel || !confirm('Apagar este relatório?')) return;
    await api.apagarRelatorio(sel.id);
    setSelId(undefined);
    await lista.recarregar();
    void previa.recarregar();
  };

  const r = cfg.dados?.relatorios;
  const DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
  const destino = cfg.dados?.whatsapp.destino;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Relatórios</h1>
          <p>
            Semanal (sábado a sexta) e mensal, enviados por WhatsApp.{' '}
            {r && (
              <span className="muted">
                Automático: {r.semanalAtivo ? `semanal ${DIAS[r.semanalDia]} ${r.semanalHora}` : 'semanal desligado'} ·{' '}
                {r.mensalAtivo ? `mensal ${r.mensalQuando === 'primeiro-dia' ? 'dia 1º' : 'último dia'} ${r.mensalHora}` : 'mensal desligado'} — <Link to="/configuracoes">alterar</Link>
              </span>
            )}
          </p>
        </div>
      </div>

      <div className="grid g3" style={{ marginBottom: 22 }}>
        <button className="card client-card" style={{ textAlign: 'left', font: 'inherit' }} disabled={!!gerando} onClick={() => void gerar('semanal')}>
          <div className="top">
            <div className="ico violet" style={{ width: 38, height: 38, borderRadius: 11, display: 'grid', placeItems: 'center' }}><CalendarDays size={19} /></div>
            <div><div className="name">Gerar semanal</div><div className="niche">O Claude exporta o .csv das campanhas ativas (sáb–sex) e salva aqui</div></div>
          </div>
        </button>
        <button className="card client-card" style={{ textAlign: 'left', font: 'inherit' }} disabled={!!gerando} onClick={() => void gerar('mensal')}>
          <div className="top">
            <div className="ico green" style={{ width: 38, height: 38, borderRadius: 11, display: 'grid', placeItems: 'center' }}><BarChart3 size={19} /></div>
            <div><div className="name">Gerar mensal</div><div className="niche">
                {previa.dados
                  ? `Soma ${previa.dados.usados.length} relatório(s) salvo(s)${previa.dados.faltando.length ? ` + exporta ${previa.dados.faltando.length} período(s) faltando` : ' — mês completo'}`
                  : 'Junta os relatórios salvos do mês'}
              </div></div>
          </div>
        </button>
        <button className="card client-card" style={{ textAlign: 'left', font: 'inherit' }} disabled={!!gerando} onClick={() => setPersonalizado(true)}>
          <div className="top">
            <div className="ico amber" style={{ width: 38, height: 38, borderRadius: 11, display: 'grid', placeItems: 'center' }}><CalendarRange size={19} /></div>
            <div><div className="name">Período personalizado</div><div className="niche">Escolha as datas</div></div>
          </div>
        </button>
      </div>

      {gerando && (
        <div className="callout violet" style={{ marginBottom: 22 }}>
          <Loader2 size={18} className="spin" />
          <div>
            <b>Gerando relatório {gerando.tipo}…</b> {Math.round((Date.now() - gerando.desde) / 1000)}s
            <div className="small">
              {gerando.fonte === 'meta-api'
                ? 'Lendo a API do Meta.'
                : gerando.fonte === 'agregado'
                  ? 'Somando os relatórios salvos do mês. Se faltar algum período (ex.: do último sábado até o fim do mês), o Claude exporta só esses dias no Gerenciador.'
                  : 'O Claude está abrindo o Gerenciador de cada cliente, filtrando as campanhas ativas, escolhendo o período e exportando o .csv (alguns minutos por cliente). Não feche o Chrome.'}
            </div>
          </div>
        </div>
      )}

      {lista.dados?.length === 0 && !gerando && (
        <div className="card empty">
          <BarChart3 size={36} />
          Nenhum relatório ainda. Gere o primeiro acima.
        </div>
      )}

      {sel && (
        <div className="grid" style={{ gridTemplateColumns: '260px minmax(0,1fr)', alignItems: 'start' }}>
          <div className="card">
            <div className="card-head">
              <h3>Histórico</h3>
              <label className="row small muted" title="Complementos = dias soltos do fim do mês, usados no mensal">
                <Layers size={13} /> complementos <Switch checked={verComplementos} onChange={setVerComplementos} />
              </label>
            </div>
            <div className="list" style={{ maxHeight: 640, overflowY: 'auto' }}>
              {visiveis.map((x) => (
                <button key={x.id} className="list-item link" style={{ border: 0, borderTop: '1px solid var(--border)', background: x.id === sel.id ? 'var(--primary-50)' : undefined, textAlign: 'left', width: '100%' }} onClick={() => setSelId(x.id)}>
                  <div className="grow">
                    <div className="t">{NOME_TIPO[x.tipo]} · {x.tipo === 'mensal' ? tituloMes(x.inicio) : `${curto(x.inicio)}–${curto(x.fim)}`}</div>
                    <div className="s">{quando(x.geradoEm)} · {falhou(x) ? '⚠️ falhou' : x.envios.some((e) => e.ok) ? '✓ enviado' : 'não enviado'}{x.automatico ? ' · auto' : ''}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="stack-lg">
            <div className="card">
              <div className="card-head">
                <h3>
                  <BarChart3 size={17} />
                  {NOME_TIPO[sel.tipo]} · {dataBr(sel.inicio)} a {dataBr(sel.fim)}
                </h3>
                <div className="row">
                  <span className="badge">{NOME_FONTE[sel.fonte]}</span>
                  <button className="btn ghost icon sm danger" onClick={apagar} title="Apagar"><Trash2 size={14} /></button>
                </div>
              </div>
              <div className="card-pad stack-lg">
                {sel.clientes.map((c) => (
                  <div key={c.clienteSlug} className="stack">
                    <div className="row between">
                      <b style={{ fontSize: 15 }}>{c.clienteNome}</b>
                      <div className="row">
                        {c.arquivo && (
                          <a className="btn sm ghost" href={api.arquivoUrl(c.arquivo)} title={c.arquivo}><Download size={13} /> .csv</a>
                        )}
                        {c.erro && <span className="badge red" title={c.erro}>{c.erro.slice(0, 60)}</span>}
                      </div>
                    </div>
                    {(!c.erro || c.total.investido > 0) && <KPIs m={c.total} />}
                    {sel.tipo === 'mensal' && c.partes && c.partes.length > 0 && (
                      <div className="row wrap" style={{ gap: 6 }}>
                        {c.partes.map((p, i) => (
                          <span key={i} className={`badge ${p.tipo === 'complemento' ? '' : 'violet'}`} title={NOME_TIPO[p.tipo]}>
                            {curto(p.inicio)}{p.fim !== p.inicio ? `–${curto(p.fim)}` : ''}: {brl(p.investido)} · {num(p.resultados)}
                          </span>
                        ))}
                      </div>
                    )}
                    {c.campanhas.length > 0 && (
                      <div style={{ overflowX: 'auto' }}>
                        <table className="table">
                          <thead>
                            <tr><th>Campanha</th><th className="n">Investido</th><th className="n">Impr.</th><th className="n">Conversas</th><th className="n">Leads</th><th className="n">Custo/result.</th></tr>
                          </thead>
                          <tbody>
                            {c.campanhas.map((x, i) => (
                              <tr key={i}>
                                <td>{x.nome}</td>
                                <td className="n">{brl(x.investido)}</td>
                                <td className="n">{num(x.impressoes)}</td>
                                <td className="n">{num(x.conversas)}</td>
                                <td className="n">{num(x.leads)}</td>
                                <td className="n">{x.custoPorResultado != null ? brl(x.custoPorResultado) : '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="card">
              <div className="card-head">
                <h3><Send size={17} /> Mensagem do WhatsApp</h3>
                <div className="row">
                  {editando ? (
                    <>
                      <button className="btn sm ghost" onClick={() => { setTexto(sel.texto); setEditando(false); }}><X size={14} /> Cancelar</button>
                      <button className="btn sm primary" onClick={() => void salvarTexto()}><Check size={14} /> Salvar</button>
                    </>
                  ) : (
                    <>
                      <button className="btn sm ghost" onClick={() => void salvarTexto(true)} title="Refazer texto a partir dos números"><RotateCcw size={14} /></button>
                      <button className="btn sm" onClick={() => setEditando(true)}><Pencil size={14} /> Editar</button>
                    </>
                  )}
                </div>
              </div>
              <div className="card-pad stack">
                {editando ? (
                  <textarea className="textarea mono" rows={18} value={texto} onChange={(e) => setTexto(e.target.value)} />
                ) : (
                  <div className="wpp-bg">
                    <div className="wpp-msg">
                      {texto}
                      <span className="hora">{new Date(sel.geradoEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} ✓✓</span>
                    </div>
                  </div>
                )}
                <div className="row wrap">
                  <button className="btn wpp" disabled={enviando || !destino} onClick={() => void enviar()}>
                    <Send size={15} /> {destino ? `Enviar para ${destino}` : 'Configure o WhatsApp de destino'}
                  </button>
                  <input className="input" style={{ maxWidth: 200 }} placeholder="Outro número…" value={outroNumero} onChange={(e) => setOutroNumero(e.target.value)} />
                  <button className="btn" disabled={enviando || !outroNumero.trim()} onClick={() => void enviar(outroNumero)}>Enviar</button>
                  <span className="spacer" />
                  {cfg.dados?.whatsapp.provedor === 'link' && <span className="muted small"><ExternalLink size={12} /> modo link: abre o WhatsApp Web com o texto</span>}
                </div>
                {sel.envios.length > 0 && (
                  <div className="small muted">
                    {sel.envios.slice(-5).map((e, i) => (
                      <div key={i}>{e.ok ? '✓' : '✗'} {e.para} · {new Date(e.em).toLocaleString('pt-BR')} {e.detalhe ? `· ${e.detalhe}` : ''}</div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {personalizado && (
        <Modal titulo="Relatório de período personalizado" onClose={() => setPersonalizado(false)}>
          <div className="grid g2">
            <Field label="De"><input className="input" type="date" value={ini} onChange={(e) => setIni(e.target.value)} /></Field>
            <Field label="Até"><input className="input" type="date" value={fimP} onChange={(e) => setFimP(e.target.value)} /></Field>
          </div>
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <button className="btn primary" disabled={!ini || !fimP || ini > fimP} onClick={() => void gerar('personalizado', ini, fimP)}>Gerar</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

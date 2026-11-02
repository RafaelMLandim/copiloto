import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  AlertTriangle, ArrowLeft, ArrowRight, Bot, Check, CheckCircle2, Copy, Info, Lock, RefreshCw, Save, ShieldCheck, Sparkles, Unlock,
} from 'lucide-react';
import { api } from '../api';
import { Avatar, Field, Seg, Switch, useCarregar, useToast } from '../components/ui';
import { Dropzone, MidiaCard } from '../components/Midias';
import { OBJETIVOS, type BriefingCampanha, type ClienteDetalhe, type ModoPublico, type ObjetivoCodigo } from '../../shared/tipos';
import {
  CATEGORIAS, POSICIONAMENTOS, briefingInicial, montarBriefing, nomesAutomaticos, pendencias, temCategoriaRestrita, usaMensagem, usaSite,
} from './campanha-briefing';

const PASSOS = ['Cliente', 'Objetivo', 'Oferta e destino', 'Público', 'Orçamento', 'Criativos', 'Conversão', 'Revisão'];

function ModoPublicoEscolha({ valor, onChange, oque }: { valor: ModoPublico; onChange: (m: ModoPublico) => void; oque: string }) {
  return (
    <div className="pub-mode">
      <button type="button" className={`choice ${valor === 'sugestao' ? 'on' : ''}`} onClick={() => onChange('sugestao')}>
        <b><Unlock size={14} /> Sugestão</b>
        <span>O Meta pode entregar fora de {oque} se achar melhor (Advantage+).</span>
      </button>
      <button type="button" className={`choice ${valor === 'restrito' ? 'on' : ''}`} onClick={() => onChange('restrito')}>
        <b><Lock size={14} /> Somente esse público</b>
        <span>Trava {oque}: o anúncio não aparece para mais ninguém.</span>
      </button>
    </div>
  );
}

export default function NovaCampanha() {
  const nav = useNavigate();
  const toast = useToast();
  const [params] = useSearchParams();
  const clientes = useCarregar(api.clientes);
  const [passo, setPasso] = useState(0);
  const [cliente, setCliente] = useState<ClienteDetalhe>();
  const [b, setB] = useState<BriefingCampanha>(() => briefingInicial());
  const [nomesManuais, setNomesManuais] = useState(false);
  const [planoAprovado, setPlanoAprovado] = useState(false);
  const [enviando, setEnviando] = useState(false);

  const carregarCliente = async (slug: string, resetar = true) => {
    const c = await api.cliente(slug);
    setCliente(c);
    if (resetar) setB(briefingInicial(c));
    return c;
  };

  useEffect(() => {
    const s = params.get('cliente');
    if (s) void carregarCliente(s).then(() => setPasso(1)).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const set = <K extends keyof BriefingCampanha>(k: K, v: BriefingCampanha[K]) => setB((x) => ({ ...x, [k]: v }));
  const inp = (k: keyof BriefingCampanha) => ({
    value: String(b[k] ?? ''),
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => set(k, e.target.value as never),
  });

  const auto = useMemo(() => nomesAutomaticos(b), [b]);
  const nomes = nomesManuais ? b.nomes : auto;
  const final: BriefingCampanha = { ...b, nomes };
  const pend = pendencias(final);
  const restrita = temCategoriaRestrita(b);
  const briefingMd = useMemo(() => montarBriefing(final, cliente, planoAprovado), [final, cliente, planoAprovado]);

  const pendDoPasso = (i: number) => pend.filter((p) => p.passo === i).length;

  const salvarBriefing = async () => {
    try {
      const r = await api.salvarBriefing(final, briefingMd);
      toast(`Briefing salvo em clientes/${r.arquivo}`, 'ok');
    } catch (e: any) {
      toast(e.message, 'erro');
    }
  };

  const enviarClaude = async () => {
    setEnviando(true);
    try {
      await api.salvarBriefing(final, briefingMd).catch(() => {});
      const conv = await api.novaConversa(nomes.campanha, b.clienteSlug);
      nav(`/chat/${conv.id}`, { state: { enviar: briefingMd } });
    } catch (e: any) {
      toast(e.message, 'erro');
      setEnviando(false);
    }
  };

  const escolherObjetivo = (o: ObjetivoCodigo) => {
    setB((x) => ({
      ...x,
      objetivo: o,
      destino:
        x.destino ||
        (o === 'TRAF-SITE' || o === 'VENDAS'
          ? ''
          : (cliente?.ficha.match(/WhatsApp de atendimento:\s*([^\n]+)/)?.[1] ?? '').replace(/_pendente_/, '').trim()),
    }));
  };

  const corpo: ReactNode[] = [
    // 0 — Cliente
    <>
      <div>
        <h2>Para qual cliente é a campanha?</h2>
        <p className="lead">Os dados da ficha (região, verba, WhatsApp) já entram preenchidos nos próximos passos.</p>
      </div>
      <div className="choice-grid">
        {clientes.dados?.map((c) => (
          <button
            type="button"
            key={c.slug}
            className={`choice ${b.clienteSlug === c.slug ? 'on' : ''}`}
            onClick={() => void carregarCliente(c.slug).then(() => setPasso(1))}
            style={{ gridTemplateColumns: 'auto 1fr', alignItems: 'center', gap: 12 }}
          >
            <Avatar nome={c.nome} cor={c.extras.cor} tam="sm" />
            <div style={{ display: 'grid', minWidth: 0 }}>
              <b style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.nome}</b>
              <span>{c.contaId ? `conta ${c.contaId}` : '⚠️ sem conta de anúncios'}</span>
            </div>
            {b.clienteSlug === c.slug && <CheckCircle2 className="check" size={18} />}
          </button>
        ))}
      </div>
      {cliente && !cliente.contaId && (
        <div className="callout warn"><AlertTriangle size={17} /> A ficha deste cliente não tem o ID da conta de anúncios. O Claude vai perguntar antes de criar.</div>
      )}
    </>,

    // 1 — Objetivo
    <>
      <div>
        <h2>Qual o objetivo?</h2>
        <p className="lead">Define o tipo de campanha no Meta e o código no nome (ex.: LEAD-WPP).</p>
      </div>
      <div className="choice-grid">
        {(Object.keys(OBJETIVOS) as ObjetivoCodigo[]).map((o) => (
          <button type="button" key={o} className={`choice ${b.objetivo === o ? 'on' : ''}`} onClick={() => escolherObjetivo(o)}>
            <b>{OBJETIVOS[o].rotulo}</b>
            <span>{OBJETIVOS[o].descricao}</span>
            <span><code>{o}</code></span>
            {b.objetivo === o && <CheckCircle2 className="check" size={18} />}
          </button>
        ))}
      </div>
      <Field label="Categoria especial de anúncio" hint="Imóveis são obrigatoriamente “Habitação” no Meta — trava idade/gênero e exige raio mínimo.">
        <select className="select" {...inp('categoriaEspecial')}>
          {Object.entries(CATEGORIAS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </Field>
      {b.objetivo === 'VENDAS' && <div className="callout warn"><AlertTriangle size={17} /> Vendas precisa de pixel/conjunto de dados instalado no site.</div>}
    </>,

    // 2 — Oferta
    <>
      <div>
        <h2>O que vamos anunciar?</h2>
        <p className="lead">Quanto mais concreto (preço, bairro, condição), melhor o texto do anúncio e menos lead desqualificado.</p>
      </div>
      <div className="grid g2">
        <Field label="Nome curto da oferta" req hint="Vai no nome da campanha. Ex.: Consultoria Sono · Apto 2qts Asa Norte">
          <input className="input" autoFocus {...inp('oferta')} maxLength={40} placeholder="Ex.: Casa 3qts Jardim Europa" />
        </Field>
        <Field label="Botão (CTA)" hint="Deixe vazio para o Claude escolher">
          <input className="input" list="ctas" {...inp('cta')} placeholder="Ex.: Enviar mensagem" />
          <datalist id="ctas">{['Enviar mensagem', 'Saiba mais', 'Cadastre-se', 'Fale conosco', 'Comprar agora', 'Agendar agora', 'Obter cotação'].map((x) => <option key={x} value={x} />)}</datalist>
        </Field>
      </div>
      <Field label="O que é / descrição" req>
        <textarea className="textarea" {...inp('descricaoOferta')} placeholder="Ex.: Apartamento 2 quartos reformado, 1º andar, SHCGN 716" />
      </Field>
      <Field label="Preço e condições" hint="Colocar preço no anúncio filtra curiosos.">
        <textarea className="textarea" {...inp('preco')} placeholder="Ex.: R$ 600 mil, aceita financiamento e FGTS" />
      </Field>
      <Field
        label={usaSite(b) ? 'Link do site / landing page' : usaMensagem(b) ? (b.objetivo === 'ENG-DIRECT' ? 'Instagram de destino' : 'WhatsApp de destino') : 'Destino (opcional)'}
        req={usaSite(b) || usaMensagem(b)}
      >
        <input className="input" {...inp('destino')} placeholder={usaSite(b) ? 'https://…' : '+55 61 9…'} />
      </Field>
    </>,

    // 3 — Público
    <>
      <div>
        <h2>Quem deve ver o anúncio?</h2>
        <p className="lead">Para idade e gênero, escolha se é só uma <b>sugestão</b> para o Meta ou se deve ser <b>somente</b> aquele público.</p>
      </div>
      <div className="grid g2">
        <Field label="Regiões" req hint="Cidades, estados ou países. Separe por vírgula.">
          <textarea className="textarea" rows={2} {...inp('regioes')} placeholder="Ex.: DF, SP, RJ, Goiânia (+40 km)" />
        </Field>
        <Field label="Excluir regiões">
          <textarea className="textarea" rows={2} {...inp('regioesExcluidas')} placeholder="Ex.: Norte e Nordeste" />
        </Field>
        <Field label="Raio (km)" hint={restrita ? 'Mínimo de 17 km na categoria especial' : 'Opcional — para cidade/endereço'}>
          <input className="input" type="number" min={restrita ? 17 : 1} value={b.raioKm ?? ''} onChange={(e) => set('raioKm', e.target.value ? Number(e.target.value) : null)} />
        </Field>
        <div className="toggle-row" style={{ alignSelf: 'end' }}>
          <div>
            <b>Expansão automática de localização</b>
            <small>Deixar o Meta mostrar fora das regiões</small>
          </div>
          <Switch checked={b.expansaoLocalizacao} onChange={(v) => set('expansaoLocalizacao', v)} />
        </div>
      </div>

      {restrita ? (
        <div className="callout violet">
          <ShieldCheck size={18} />
          <div>
            <b>Categoria especial ({CATEGORIAS[b.categoriaEspecial]}):</b> o Meta trava idade (18-65+) e gênero (todos). O direcionamento vai por região, interesses
            permitidos, públicos personalizados (lista, site, engajamento IG/FB) e, principalmente, pelo criativo.
          </div>
        </div>
      ) : (
        <div className="card" style={{ padding: 18, display: 'grid', gap: 18, background: 'var(--surface-2)' }}>
          <div className="grid g2">
            <div className="stack">
              <span className="lbl-txt">Idade</span>
              <div className="row">
                <input className="input" type="number" min={18} max={65} value={b.idadeMin} onChange={(e) => set('idadeMin', Number(e.target.value))} style={{ width: 90 }} />
                <span className="muted">até</span>
                <input className="input" type="number" min={18} max={65} value={b.idadeMax} onChange={(e) => set('idadeMax', Number(e.target.value))} style={{ width: 90 }} />
                {b.idadeMax >= 65 && <span className="muted small">(65+)</span>}
              </div>
              <ModoPublicoEscolha valor={b.modoIdade} onChange={(m) => set('modoIdade', m)} oque="essa faixa de idade" />
            </div>
            <div className="stack">
              <span className="lbl-txt">Gênero</span>
              <Seg value={b.genero} onChange={(g) => set('genero', g)} options={[['todos', 'Todos'], ['mulheres', 'Mulheres'], ['homens', 'Homens']]} />
              {b.genero !== 'todos' ? (
                <ModoPublicoEscolha valor={b.modoGenero} onChange={(m) => set('modoGenero', m)} oque={b.genero === 'mulheres' ? 'mulheres' : 'homens'} />
              ) : (
                <p className="hint muted small" style={{ margin: 0 }}>Escolha Mulheres ou Homens para definir se é sugestão ou público fixo.</p>
              )}
            </div>
          </div>
          {(b.modoGenero === 'restrito' && b.genero !== 'todos') || b.modoIdade === 'restrito' ? (
            <div className="callout warn small">
              <Lock size={16} />
              <div>
                No público Advantage+ o gênero (e a idade máxima) ficam só como <b>sugestão</b> — foi assim que entraram homens na campanha da Essência do Sono.
                Com “somente esse público”, o Claude vai usar as <b>opções de público original</b> (ou controles de público) para travar.
              </div>
            </div>
          ) : null}
        </div>
      )}

      <div className="grid g2">
        <Field label="Interesses / comportamentos" hint="Um por linha. Ex.: Maternidade, Pais de bebês 0-12 meses">
          <textarea className="textarea" {...inp('interesses')} />
        </Field>
        <Field label="Públicos personalizados / semelhantes">
          <textarea className="textarea" {...inp('publicosPersonalizados')} placeholder="Ex.: [RMT] Engajamento IG 365d" />
        </Field>
        <Field label="Excluir públicos">
          <textarea className="textarea" rows={2} {...inp('exclusoes')} placeholder="Ex.: quem já é cliente, leads dos últimos 30 dias" />
        </Field>
        <Field label="Quem é o comprador (em palavras)">
          <textarea className="textarea" rows={2} {...inp('descricaoPublico')} placeholder="Ex.: mães de primeira viagem, classe B, sem dormir" />
        </Field>
      </div>
    </>,

    // 4 — Orçamento
    <>
      <div>
        <h2>Quanto e por quanto tempo?</h2>
        <p className="lead">Teste mínimo sugerido: R$ 30–50/dia por conjunto, 7 dias antes de julgar.</p>
      </div>
      <div className="grid g2">
        <Field label="Orçamento diário (R$)" req hint={`≈ R$ ${(b.orcamentoDiario * 30).toLocaleString('pt-BR')} por mês`}>
          <input className="input" type="number" min={1} step={1} value={b.orcamentoDiario || ''} onChange={(e) => set('orcamentoDiario', Number(e.target.value))} />
        </Field>
        <Field label="Onde fica o orçamento">
          <Seg value={b.tipoOrcamento} onChange={(v) => set('tipoOrcamento', v)} options={[['campanha', 'Na campanha (CBO)'], ['conjunto', 'Por conjunto (ABO)']]} />
        </Field>
        <Field label="Início" req>
          <input className="input" type="date" {...inp('dataInicio')} />
        </Field>
        <Field label="Término" hint="Vazio = contínua">
          <input className="input" type="date" {...inp('dataFim')} />
        </Field>
        <Field label="Quantos conjuntos de anúncio" hint="Mais de 1 = testar públicos diferentes">
          <input className="input" type="number" min={1} max={6} value={b.conjuntos} onChange={(e) => set('conjuntos', Math.max(1, Number(e.target.value)))} />
        </Field>
      </div>
      {b.orcamentoDiario > 0 && b.orcamentoDiario / Math.max(1, b.conjuntos) < 20 && (
        <div className="callout warn"><AlertTriangle size={17} /> Menos de R$ 20/dia por conjunto costuma demorar para sair do aprendizado.</div>
      )}
    </>,

    // 5 — Criativos
    <>
      <div>
        <h2>Criativos e textos</h2>
        <p className="lead">Selecione as mídias da pasta <code>midias/novas</code> deste cliente. Depois de usadas, o Claude move para <code>usadas</code>.</p>
      </div>
      {cliente ? (
        <>
          {cliente.midias.novas.length > 0 ? (
            <div className="media-grid">
              {cliente.midias.novas.map((m) => (
                <MidiaCard
                  key={m.nome}
                  slug={cliente.slug}
                  m={m}
                  selecionada={b.midias.includes(m.nome)}
                  onSelecionar={() => set('midias', b.midias.includes(m.nome) ? b.midias.filter((x) => x !== m.nome) : [...b.midias, m.nome])}
                />
              ))}
            </div>
          ) : (
            <div className="callout warn"><AlertTriangle size={17} /> Nenhuma mídia nova para este cliente. Envie abaixo.</div>
          )}
          <Dropzone slug={cliente.slug} onEnviado={() => void carregarCliente(cliente.slug, false)} />
        </>
      ) : (
        <div className="callout">Escolha o cliente primeiro.</div>
      )}
      <div className="grid g2">
        <Field label="Formato">
          <Seg value={b.formato} onChange={(v) => set('formato', v)} options={[['IMG', 'Imagem'], ['VID', 'Vídeo'], ['CAR', 'Carrossel'], ['REELS', 'Reels']]} />
        </Field>
        <Field label="Posicionamentos">
          <select className="select" {...inp('posicionamentos')}>
            {Object.entries(POSICIONAMENTOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        {b.posicionamentos === 'manual' && (
          <Field label="Quais posicionamentos">
            <input className="input" {...inp('posicionamentosManual')} placeholder="Ex.: Feed IG, Stories IG, Reels IG" />
          </Field>
        )}
        <Field label="Gancho (ideia principal)" hint="Vai no nome do anúncio. Ex.: Noites difíceis + preço">
          <input className="input" {...inp('gancho')} maxLength={40} />
        </Field>
      </div>
      <div className="card" style={{ padding: '4px 18px', background: 'var(--surface-2)' }}>
        <div className="toggle-row">
          <div>
            <b><Sparkles size={14} style={{ verticalAlign: -2, color: 'var(--primary)' }} /> O Claude escreve os textos</b>
            <small>Usa o nome das mídias, as notas .txt e a ficha. Você pode dar uma base abaixo.</small>
          </div>
          <Switch checked={b.claudeEscreveTextos} onChange={(v) => set('claudeEscreveTextos', v)} />
        </div>
        <div className="toggle-row">
          <div>
            <b>Melhorias automáticas de criativo do Meta</b>
            <small>Meta mexe em texto/imagem. Recomendado deixar desligado.</small>
          </div>
          <Switch checked={b.melhoriasCriativoMeta} onChange={(v) => set('melhoriasCriativoMeta', v)} />
        </div>
      </div>
      <Field label={b.claudeEscreveTextos ? 'Texto principal (opcional — ideias/base)' : 'Texto principal'} req={!b.claudeEscreveTextos}>
        <textarea className="textarea" rows={4} {...inp('textoPrincipal')} />
      </Field>
      <Field label="Título">
        <input className="input" {...inp('titulo')} />
      </Field>
    </>,

    // 6 — Conversão
    <>
      <div>
        <h2>Como o lead chega até você?</h2>
        <p className="lead">{b.objetivo === 'LEAD-FORM' ? 'Perguntas que qualificam antes do contato.' : usaMensagem(b) ? 'Primeira mensagem e botões da conversa.' : 'Rastreamento do site.'}</p>
      </div>
      {b.objetivo === 'LEAD-FORM' && (
        <>
          <Field label="Tipo de formulário">
            <Seg value={b.tipoFormulario} onChange={(v) => set('tipoFormulario', v)} options={[['maior-intencao', 'Maior intenção (recomendado)'], ['mais-volume', 'Mais volume']]} />
          </Field>
          <Field label="Perguntas de qualificação" req hint="Uma por linha. O Claude cria as opções de resposta.">
            <textarea className="textarea" rows={5} {...inp('perguntasFormulario')} />
          </Field>
        </>
      )}
      {usaMensagem(b) && (
        <>
          <Field label="Mensagem de boas-vindas" hint="Vazio = o Claude sugere. Dica: já citar preço/condição filtra quem acha caro.">
            <textarea className="textarea" rows={3} {...inp('mensagemBoasVindas')} />
          </Field>
          <Field label="Botões / perguntas rápidas" hint="Um por linha (até 4)">
            <textarea className="textarea" rows={4} {...inp('botoesConversa')} placeholder={'Ex.:\nQuero saber os valores\nAgendar visita'} />
          </Field>
        </>
      )}
      {usaSite(b) && (
        <Field label="Pixel / evento de conversão">
          <input className="input" {...inp('pixel')} placeholder="Ex.: Pixel Essência — evento Lead" />
        </Field>
      )}
      {b.objetivo === 'RECON' && <div className="callout"><Info size={17} /> Reconhecimento não precisa de configuração de conversão.</div>}
      <Field label="Observações para o Claude" hint="Qualquer coisa a mais: o que não pode dizer, referência de anúncio, teste A/B…">
        <textarea className="textarea" rows={3} {...inp('observacoes')} />
      </Field>
    </>,

    // 7 — Revisão
    <>
      <div>
        <h2>Revisão</h2>
        <p className="lead">Confira os nomes e o briefing. O Claude monta tudo como <b>rascunho</b> — você revisa e publica no Gerenciador.</p>
      </div>
      {pend.length > 0 ? (
        <div className="callout warn">
          <AlertTriangle size={17} />
          <div>
            <b>Falta preencher:</b>
            <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
              {pend.map((p, i) => (
                <li key={i}><a href="#" onClick={(e) => { e.preventDefault(); setPasso(p.passo); }}>{p.texto}</a> <span className="muted">({PASSOS[p.passo]})</span></li>
              ))}
            </ul>
          </div>
        </div>
      ) : (
        <div className="callout ok"><CheckCircle2 size={17} /> Tudo o que é necessário para a campanha rodar foi preenchido.</div>
      )}
      <div className="card" style={{ padding: 18, display: 'grid', gap: 12, background: 'var(--surface-2)' }}>
        <div className="row between">
          <span className="lbl-txt">Nomes (nomenclatura padrão)</span>
          <div className="row">
            {nomesManuais && <button className="btn sm ghost" onClick={() => setNomesManuais(false)}><RefreshCw size={13} /> Voltar ao automático</button>}
          </div>
        </div>
        {(['campanha', 'conjunto', 'anuncio'] as const).map((k) => (
          <Field key={k} label={k === 'anuncio' ? 'Anúncio' : k[0].toUpperCase() + k.slice(1)}>
            <input
              className="input"
              style={{ fontFamily: 'ui-monospace, Consolas, monospace', fontSize: 13 }}
              value={nomes[k]}
              onChange={(e) => {
                setNomesManuais(true);
                setB((x) => ({ ...x, nomes: { ...nomes, [k]: e.target.value } }));
              }}
            />
          </Field>
        ))}
      </div>
      <div className="toggle-row">
        <div>
          <b>Plano já aprovado — montar o rascunho direto</b>
          <small>Desligado: o Claude revisa, mostra o plano e os textos e espera seu “ok” antes de abrir o navegador.</small>
        </div>
        <Switch checked={planoAprovado} onChange={setPlanoAprovado} />
      </div>
      <details className="card">
        <summary style={{ padding: '14px 18px', cursor: 'pointer', fontWeight: 600 }}>Ver briefing completo que vai para o Claude</summary>
        <div className="md" style={{ padding: '0 18px 18px' }}>
          <Markdown remarkPlugins={[remarkGfm]}>{briefingMd}</Markdown>
        </div>
      </details>
      <div className="row wrap" style={{ justifyContent: 'flex-end' }}>
        <button className="btn" onClick={() => void navigator.clipboard.writeText(briefingMd).then(() => toast('Briefing copiado', 'ok'))}><Copy size={15} /> Copiar</button>
        <button className="btn" onClick={salvarBriefing} disabled={!b.clienteSlug}><Save size={15} /> Salvar briefing</button>
        <button className="btn primary lg" onClick={enviarClaude} disabled={enviando || !b.clienteSlug || pend.some((p) => p.passo === 0)}>
          <Bot size={17} /> {pend.length ? 'Enviar mesmo assim ao Claude' : 'Enviar ao Claude e montar rascunho'}
        </button>
      </div>
    </>,
  ];

  const genTxt = b.genero === 'todos' ? 'Todos' : `${b.genero === 'mulheres' ? 'Mulheres' : 'Homens'} · ${b.modoGenero === 'restrito' ? '🔒 somente' : 'sugestão'}`;

  return (
    <div className="page wide" style={{ maxWidth: 1500 }}>
      <div className="page-head">
        <div>
          <h1>Nova campanha</h1>
          <p>Responda o necessário para a campanha rodar. No fim, o Claude monta o rascunho no Gerenciador de Anúncios.</p>
        </div>
      </div>
      <div className="wizard">
        <div className="card steps">
          {PASSOS.map((p, i) => {
            const n = pendDoPasso(i);
            const estado = i === passo ? 'on' : n && i < passo ? 'pend' : i < passo ? 'done' : '';
            return (
              <button key={p} className={`step ${estado}`} onClick={() => setPasso(i)} disabled={i > 0 && !b.clienteSlug}>
                <span className="n">{estado === 'done' ? <Check size={13} /> : i + 1}</span>
                {p}
                {n > 0 && i !== passo && i < passo && <span className="badge amber" style={{ marginLeft: 'auto', padding: '0 7px' }}>{n}</span>}
              </button>
            );
          })}
        </div>

        <div className="card">
          <div className="wizard-body">{corpo[passo]}</div>
          <div className="wizard-foot">
            <button className="btn ghost" onClick={() => setPasso((p) => Math.max(0, p - 1))} disabled={passo === 0}>
              <ArrowLeft size={15} /> Voltar
            </button>
            {passo < PASSOS.length - 1 && (
              <button className="btn primary" onClick={() => setPasso((p) => p + 1)} disabled={!b.clienteSlug}>
                Continuar <ArrowRight size={15} />
              </button>
            )}
          </div>
        </div>

        <div className="card resumo">
          <div className="card-head"><h3>Resumo</h3>{pend.length ? <span className="badge amber">{pend.length} pendente{pend.length > 1 ? 's' : ''}</span> : <span className="badge green">completo</span>}</div>
          <dl>
            <div><dt>Cliente</dt><dd>{cliente?.nome ?? '—'}</dd></div>
            <div><dt>Objetivo</dt><dd>{OBJETIVOS[b.objetivo].rotulo}{b.categoriaEspecial !== 'nenhuma' ? ` · ${CATEGORIAS[b.categoriaEspecial]}` : ''}</dd></div>
            <div><dt>Público</dt><dd>{b.regioes || '—'}{b.raioKm ? ` · ${b.raioKm} km` : ''}</dd></div>
            {!restrita && (
              <div>
                <dt>Idade · Gênero</dt>
                <dd>{b.idadeMin}-{b.idadeMax} ({b.modoIdade === 'restrito' ? '🔒 somente' : 'sugestão'}) · {genTxt}</dd>
              </div>
            )}
            <div><dt>Orçamento</dt><dd>R$ {b.orcamentoDiario || 0}/dia · {b.tipoOrcamento === 'campanha' ? 'CBO' : 'ABO'} · {b.conjuntos} conj.</dd></div>
            <div><dt>Criativos</dt><dd>{b.midias.length} mídia(s) · {b.formato}</dd></div>
            <div><dt>Campanha</dt><dd><span className="name-chip">{nomes.campanha}</span></dd></div>
            <div><dt>Conjunto</dt><dd><span className="name-chip">{nomes.conjunto}</span></dd></div>
            <div><dt>Anúncio</dt><dd><span className="name-chip">{nomes.anuncio}</span></dd></div>
          </dl>
        </div>
      </div>
    </div>
  );
}

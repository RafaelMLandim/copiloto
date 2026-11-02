import { useEffect, useState } from 'react';
import { Bot, CalendarClock, KeyRound, MessageCircle, Save, Send } from 'lucide-react';
import { api } from '../api';
import { Field, Seg, Switch, useCarregar, useToast } from '../components/ui';
import type { Configuracoes as Cfg, ProvedorWhatsapp } from '../../shared/tipos';

const PROVEDORES: { id: ProvedorWhatsapp; nome: string; desc: string }[] = [
  { id: 'link', nome: 'Link (manual)', desc: 'Abre o WhatsApp Web com o texto pronto; você aperta enviar. Sem configuração. Não envia sozinho.' },
  { id: 'callmebot', nome: 'CallMeBot', desc: 'Grátis e automático, mas só envia para o PRÓPRIO número que ativou o bot. Ideal para receber seus relatórios.' },
  { id: 'evolution', nome: 'Evolution API', desc: 'Automático, para qualquer número. Você hospeda (Docker/VPS) e conecta seu WhatsApp por QR code.' },
  { id: 'zapi', nome: 'Z-API', desc: 'Automático, para qualquer número. Serviço pago, conecta por QR code.' },
];
const DIAS: [string, string][] = [['1', 'Seg'], ['2', 'Ter'], ['3', 'Qua'], ['4', 'Qui'], ['5', 'Sex'], ['6', 'Sáb'], ['0', 'Dom']];

export default function Configuracoes() {
  const toast = useToast();
  const { dados } = useCarregar(api.config);
  const [c, setC] = useState<Cfg>();
  const [salvando, setSalvando] = useState(false);
  useEffect(() => setC(dados), [dados]);
  if (!c) return <div className="page"><div className="skeleton" style={{ height: 300 }} /></div>;

  const w = <K extends keyof Cfg['whatsapp']>(k: K, v: Cfg['whatsapp'][K]) => setC({ ...c, whatsapp: { ...c.whatsapp, [k]: v } });
  const r = <K extends keyof Cfg['relatorios']>(k: K, v: Cfg['relatorios'][K]) => setC({ ...c, relatorios: { ...c.relatorios, [k]: v } });

  const salvar = async () => {
    setSalvando(true);
    try {
      setC(await api.salvarConfig(c));
      toast('Configurações salvas', 'ok');
    } catch (e: any) {
      toast(e.message, 'erro');
    } finally {
      setSalvando(false);
    }
  };

  const testar = async () => {
    await api.salvarConfig(c);
    const res = await api.testarWhatsapp(c.whatsapp.destino);
    if (res.ok) toast('Mensagem de teste enviada', 'ok');
    else if (res.link) {
      window.open(res.link, '_blank');
      toast(res.detalhe ?? 'Abrindo link', c.whatsapp.provedor === 'link' ? 'info' : 'erro');
    } else toast(res.detalhe ?? 'Falhou', 'erro');
  };

  return (
    <div className="page" style={{ maxWidth: 940 }}>
      <div className="page-head">
        <div>
          <h1>Configurações</h1>
          <p>Tudo fica salvo só neste computador (<code>painel/data/config.json</code>).</p>
        </div>
        <button className="btn primary" onClick={salvar} disabled={salvando}><Save size={16} /> {salvando ? 'Salvando…' : 'Salvar'}</button>
      </div>

      <div className="stack-lg">
        <div className="card">
          <div className="card-head"><h3><MessageCircle size={17} /> WhatsApp dos relatórios</h3></div>
          <div className="card-pad stack-lg">
            <Field label="Número que recebe os relatórios" hint="Com DDD. Ex.: +55 61 99999-9999">
              <div className="row">
                <input className="input" value={c.whatsapp.destino} onChange={(e) => w('destino', e.target.value)} placeholder="+55 61 9…" style={{ maxWidth: 280 }} />
                <button className="btn" onClick={testar} disabled={!c.whatsapp.destino}><Send size={15} /> Enviar teste</button>
              </div>
            </Field>
            <div className="stack">
              <span className="lbl-txt">Como enviar</span>
              <div className="choice-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))' }}>
                {PROVEDORES.map((p) => (
                  <button type="button" key={p.id} className={`choice ${c.whatsapp.provedor === p.id ? 'on' : ''}`} onClick={() => w('provedor', p.id)}>
                    <b>{p.nome}</b>
                    <span>{p.desc}</span>
                  </button>
                ))}
              </div>
            </div>
            {c.whatsapp.provedor === 'callmebot' && (
              <div className="stack">
                <div className="callout small">
                  <div>
                    Ativação (1 vez): siga o passo a passo em <a href="https://www.callmebot.com/blog/free-api-whatsapp-messages/" target="_blank" rel="noreferrer">callmebot.com</a> — você adiciona o número do bot, manda <code>I allow callmebot to send me messages</code> e recebe a API key. Ela só funciona para o número que mandou a mensagem.
                  </div>
                </div>
                <Field label="API key do CallMeBot"><input className="input" value={c.whatsapp.callmebotApiKey} onChange={(e) => w('callmebotApiKey', e.target.value)} style={{ maxWidth: 280 }} /></Field>
              </div>
            )}
            {c.whatsapp.provedor === 'evolution' && (
              <div className="grid g3">
                <Field label="URL da Evolution API"><input className="input" value={c.whatsapp.evolutionUrl} onChange={(e) => w('evolutionUrl', e.target.value)} placeholder="https://evo.seudominio.com" /></Field>
                <Field label="Instância"><input className="input" value={c.whatsapp.evolutionInstancia} onChange={(e) => w('evolutionInstancia', e.target.value)} /></Field>
                <Field label="API key"><input className="input" type="password" value={c.whatsapp.evolutionApiKey} onChange={(e) => w('evolutionApiKey', e.target.value)} /></Field>
              </div>
            )}
            {c.whatsapp.provedor === 'zapi' && (
              <div className="grid g3">
                <Field label="ID da instância"><input className="input" value={c.whatsapp.zapiInstancia} onChange={(e) => w('zapiInstancia', e.target.value)} /></Field>
                <Field label="Token"><input className="input" type="password" value={c.whatsapp.zapiToken} onChange={(e) => w('zapiToken', e.target.value)} /></Field>
                <Field label="Client-Token (segurança)"><input className="input" type="password" value={c.whatsapp.zapiClientToken} onChange={(e) => w('zapiClientToken', e.target.value)} /></Field>
              </div>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-head"><h3><CalendarClock size={17} /> Relatórios automáticos</h3></div>
          <div className="card-pad">
            <div className="toggle-row">
              <div><b>🔔 Sininho de lembrete</b><small>Avisa toda sexta-feira (semanal) e no último dia do mês (geral), a partir do horário escolhido</small></div>
              <div className="row">
                {c.relatorios.lembreteAtivo && (
                  <input className="input" type="time" value={c.relatorios.lembreteHora} onChange={(e) => r('lembreteHora', e.target.value)} style={{ width: 120 }} />
                )}
                <Switch checked={c.relatorios.lembreteAtivo} onChange={(v) => r('lembreteAtivo', v)} />
              </div>
            </div>
            <div className="toggle-row">
              <div><b>Relatório semanal (sábado a sexta)</b><small>Gerado no dia e hora abaixo, cobrindo sábado a sexta (no começo do mês, a partir do dia 1)</small></div>
              <Switch checked={c.relatorios.semanalAtivo} onChange={(v) => r('semanalAtivo', v)} />
            </div>
            {c.relatorios.semanalAtivo && (
              <div className="row wrap" style={{ padding: '4px 0 14px' }}>
                <Seg value={String(c.relatorios.semanalDia)} onChange={(v) => r('semanalDia', Number(v))} options={DIAS} />
                <input className="input" type="time" value={c.relatorios.semanalHora} onChange={(e) => r('semanalHora', e.target.value)} style={{ width: 130 }} />
                <span className="muted small">{c.relatorios.semanalDia === 5 ? 'sexta: dados de sexta ainda parciais' : c.relatorios.semanalDia === 6 || c.relatorios.semanalDia === 0 ? 'semana útil completa' : 'cobre a semana anterior'}</span>
              </div>
            )}
            <div className="toggle-row">
              <div><b>Relatório mensal</b><small>Fechamento do mês</small></div>
              <Switch checked={c.relatorios.mensalAtivo} onChange={(v) => r('mensalAtivo', v)} />
            </div>
            {c.relatorios.mensalAtivo && (
              <div className="row wrap" style={{ padding: '4px 0 14px' }}>
                <Seg value={c.relatorios.mensalQuando} onChange={(v) => r('mensalQuando', v)} options={[['ultimo-dia', 'Último dia do mês'], ['primeiro-dia', 'Dia 1º (mês fechado)']]} />
                <input className="input" type="time" value={c.relatorios.mensalHora} onChange={(e) => r('mensalHora', e.target.value)} style={{ width: 130 }} />
              </div>
            )}
            <div className="toggle-row">
              <div><b>Enviar automaticamente no WhatsApp</b><small>Exige CallMeBot, Evolution ou Z-API (o modo link precisa de você)</small></div>
              <Switch checked={c.relatorios.enviarAutomatico} onChange={(v) => r('enviarAutomatico', v)} />
            </div>
            <div className="toggle-row">
              <div><b>Enviar também para os clientes</b><small>Cada cliente recebe só o dele, no número cadastrado na página do cliente</small></div>
              <Switch checked={c.relatorios.enviarParaClientes} onChange={(v) => r('enviarParaClientes', v)} />
            </div>
            <div className="callout warn small" style={{ marginTop: 10 }}>
              Os relatórios automáticos rodam enquanto o painel estiver aberto (iniciar.bat). Se o PC estiver desligado no horário, o painel gera o que ficou pendente quando for aberto.
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-head"><h3><KeyRound size={17} /> De onde vêm os números</h3></div>
          <div className="card-pad stack">
            <Field label="Fonte do relatório semanal" hint="O mensal sempre soma os relatórios salvos do mês (e exporta só os dias que faltarem).">
              <Seg
                value={c.relatorios.fonte}
                onChange={(v) => r('fonte', v)}
                options={[['exportacao', 'Exportação do Gerenciador (padrão)'], ['meta-api', 'API do Meta (token)']]}
              />
            </Field>
            {c.relatorios.fonte === 'exportacao' ? (
              <div className="callout small">
                O Claude abre a conta de cada cliente, filtra as campanhas <b>ativas</b>, escolhe o período, clica em Exportar (.csv) e salva o arquivo em
                <code>clientes/&lt;cliente&gt;/relatorios/</code>. O painel lê o arquivo e guarda o relatório. Precisa do Chrome aberto com a extensão do Claude.
              </div>
            ) : null}
            <p className="muted small" style={{ margin: 0 }}>
              Só usado com a fonte “API do Meta”: deixa o relatório instantâneo, sem abrir o navegador.
              Para gerar: Business Manager → Configurações → Usuários do sistema → gerar token com <code>ads_read</code> (e acesso às contas dos clientes).
            </p>
            <div className="grid" style={{ gridTemplateColumns: '1fr 140px' }}>
              <Field label="Token de acesso"><input className="input" type="password" value={c.meta.accessToken} onChange={(e) => setC({ ...c, meta: { ...c.meta, accessToken: e.target.value } })} placeholder="EAAG…" /></Field>
              <Field label="Versão da API"><input className="input" value={c.meta.versaoApi} onChange={(e) => setC({ ...c, meta: { ...c.meta, versaoApi: e.target.value } })} /></Field>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-head"><h3><Bot size={17} /> Claude</h3></div>
          <div className="card-pad stack">
            <div className="toggle-row">
              <div><b>Usar o navegador (Claude in Chrome)</b><small>Necessário para criar campanhas e ler o Gerenciador</small></div>
              <Switch checked={c.claude.usarChrome} onChange={(v) => setC({ ...c, claude: { ...c.claude, usarChrome: v } })} />
            </div>
            <div className="grid g2">
              <Field label="Modo de permissão" hint="“auto” deixa o Claude trabalhar sem pedir confirmação a cada passo (as regras do CLAUDE.md continuam valendo).">
                <select className="select" value={c.claude.modoPermissao} onChange={(e) => setC({ ...c, claude: { ...c.claude, modoPermissao: e.target.value as Cfg['claude']['modoPermissao'] } })}>
                  <option value="auto">auto (recomendado)</option>
                  <option value="acceptEdits">acceptEdits (só aceita edições de arquivo)</option>
                  <option value="default">default (bloqueia o que pediria permissão)</option>
                  <option value="bypassPermissions">bypassPermissions (sem checagens)</option>
                </select>
              </Field>
              <Field label="Modelo" hint="Vazio = padrão do Claude Code">
                <input className="input" value={c.claude.modelo} onChange={(e) => setC({ ...c, claude: { ...c.claude, modelo: e.target.value } })} placeholder="ex.: claude-opus-5-5" />
              </Field>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Building2, Check, Megaphone, Target, Wallet } from 'lucide-react';
import { api } from '../api';
import { Field, Seg, useToast } from '../components/ui';
import type { NovoClienteInput } from '../../shared/tipos';

const VAZIO: NovoClienteInput = {
  nome: '', nicho: '', cidade: '', contato: '', status: 'ativo', contaId: '', pagina: '', instagram: '', site: '',
  whatsapp: '', oferta: '', diferenciais: '', compradorIdeal: '', regiao: '', publicosPersonalizados: '',
  orcamentoMensal: '', orcamentoDiario: '', observacoesMarca: '', whatsappRelatorio: '',
};

const NICHOS = ['Imóveis', 'Saúde / clínica', 'Consultoria', 'Estética / beleza', 'Eventos / festas', 'Educação / cursos', 'Varejo / loja', 'Restaurante / delivery', 'Serviços locais'];

export default function NovoCliente() {
  const nav = useNavigate();
  const toast = useToast();
  const [d, setD] = useState(VAZIO);
  const [salvando, setSalvando] = useState(false);
  const set = (k: keyof NovoClienteInput) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setD({ ...d, [k]: e.target.value });

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    setSalvando(true);
    try {
      const c = await api.criarCliente(d);
      toast(`Cliente "${c.nome}" criado`, 'ok');
      nav(`/clientes/${c.slug}`);
    } catch (err: any) {
      toast(err.message, 'erro');
    } finally {
      setSalvando(false);
    }
  };

  const contaOk = !d.contaId || /^\d{8,}$/.test(d.contaId.replace(/\D/g, ''));

  return (
    <form className="page" onSubmit={salvar} style={{ maxWidth: 920 }}>
      <Link to="/clientes" className="crumb"><ArrowLeft size={14} /> Clientes</Link>
      <div className="page-head">
        <div>
          <h1>Novo cliente</h1>
          <p>Só o nome é obrigatório. O resto pode ser completado depois — o Claude pergunta o que faltar antes de criar campanha.</p>
        </div>
      </div>

      <div className="stack-lg">
        <div className="card">
          <div className="card-head"><h3><Building2 size={17} /> Quem é</h3></div>
          <div className="card-pad grid g2">
            <Field label="Nome do cliente / negócio" req>
              <input className="input" required autoFocus value={d.nome} onChange={set('nome')} placeholder="Ex.: Clínica Sorriso" />
            </Field>
            <Field label="Nicho">
              <input className="input" list="nichos" value={d.nicho} onChange={set('nicho')} placeholder="Ex.: imóveis (casas)" />
              <datalist id="nichos">{NICHOS.map((n) => <option key={n} value={n} />)}</datalist>
            </Field>
            <Field label="Cidade / região de atuação">
              <input className="input" value={d.cidade} onChange={set('cidade')} placeholder="Ex.: Brasília-DF" />
            </Field>
            <Field label="Contato (responsável)">
              <input className="input" value={d.contato} onChange={set('contato')} placeholder="Nome e telefone" />
            </Field>
            <Field label="Status">
              <Seg value={d.status} onChange={(status) => setD({ ...d, status })} options={[['ativo', 'Ativo'], ['pausado', 'Pausado'], ['prospect', 'Prospect']]} />
            </Field>
          </div>
        </div>

        <div className="card">
          <div className="card-head"><h3><Megaphone size={17} /> Contas e canais</h3></div>
          <div className="card-pad grid g2">
            <Field label="ID da conta de anúncios Meta" hint={contaOk ? 'Números do act= na URL do Gerenciador' : <span style={{ color: 'var(--red)' }}>O ID costuma ter 15–16 dígitos</span>}>
              <input className="input" inputMode="numeric" value={d.contaId} onChange={set('contaId')} placeholder="Ex.: 123456789012345" />
            </Field>
            <Field label="Página do Facebook">
              <input className="input" value={d.pagina} onChange={set('pagina')} placeholder="Nome ou link da página" />
            </Field>
            <Field label="Instagram">
              <input className="input" value={d.instagram} onChange={set('instagram')} placeholder="@perfil" />
            </Field>
            <Field label="Site / pixel">
              <input className="input" value={d.site} onChange={set('site')} placeholder="https://… (e se tem pixel)" />
            </Field>
            <Field label="WhatsApp de atendimento" hint="Para onde os anúncios de WhatsApp levam">
              <input className="input" value={d.whatsapp} onChange={set('whatsapp')} placeholder="+55 61 9…" />
            </Field>
            <Field label="WhatsApp para relatório do cliente" hint="Opcional — se quiser mandar o relatório para o próprio cliente">
              <input className="input" value={d.whatsappRelatorio} onChange={set('whatsappRelatorio')} placeholder="+55 …" />
            </Field>
          </div>
        </div>

        <div className="card">
          <div className="card-head"><h3><Target size={17} /> Oferta e público</h3></div>
          <div className="card-pad grid g2">
            <Field label="O que vende (produto, faixa de preço)">
              <textarea className="textarea" value={d.oferta} onChange={set('oferta')} placeholder="Ex.: consultoria de sono infantil, R$ 380 a R$ 950" />
            </Field>
            <Field label="Diferenciais / condições">
              <textarea className="textarea" value={d.diferenciais} onChange={set('diferenciais')} placeholder="Ex.: entrada facilitada, usa FGTS, parcelamento…" />
            </Field>
            <Field label="Comprador ideal">
              <textarea className="textarea" value={d.compradorIdeal} onChange={set('compradorIdeal')} placeholder="Renda, momento de vida, motivo da compra" />
            </Field>
            <Field label="Região de anúncio (cidade + raio)">
              <textarea className="textarea" value={d.regiao} onChange={set('regiao')} placeholder="Ex.: Brasília +17 km" />
            </Field>
            <Field label="Públicos personalizados disponíveis">
              <textarea className="textarea" value={d.publicosPersonalizados} onChange={set('publicosPersonalizados')} placeholder="Lista de clientes, visitantes do site, engajamento IG…" />
            </Field>
            <Field label="Observações de marca">
              <textarea className="textarea" value={d.observacoesMarca} onChange={set('observacoesMarca')} placeholder="Tom, cores, o que NÃO pode dizer" />
            </Field>
          </div>
        </div>

        <div className="card">
          <div className="card-head"><h3><Wallet size={17} /> Verba</h3></div>
          <div className="card-pad grid g2">
            <Field label="Orçamento mensal">
              <input className="input" value={d.orcamentoMensal} onChange={set('orcamentoMensal')} placeholder="Ex.: R$ 1.500" />
            </Field>
            <Field label="Orçamento diário padrão">
              <input className="input" value={d.orcamentoDiario} onChange={set('orcamentoDiario')} placeholder="Ex.: R$ 50/dia" />
            </Field>
          </div>
        </div>

        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <Link to="/clientes" className="btn ghost">Cancelar</Link>
          <button className="btn primary lg" disabled={salvando || !d.nome.trim()}>
            <Check size={17} /> {salvando ? 'Criando…' : 'Criar cliente'}
          </button>
        </div>
      </div>
    </form>
  );
}

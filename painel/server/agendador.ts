// Agenda os relatórios automáticos. Roda enquanto o painel estiver aberto (iniciar.bat);
// ao iniciar, recupera um relatório que tenha ficado para trás com o computador desligado.
import cron from 'node-cron';
import { db } from './db.ts';
import { enviarRelatorio, gerarRelatorio, iso, periodoMensal, periodoSemanal, relatorioFalhou, ultimoDiaDoMes } from './relatorios.ts';
import type { TipoRelatorio } from '../shared/tipos.ts';

let tarefas: { stop: () => void }[] = [];
let ocupado = false;

function log(...a: unknown[]) {
  console.log(`[agendador ${new Date().toLocaleString('pt-BR')}]`, ...a);
}

async function executar(tipo: TipoRelatorio) {
  if (ocupado) return log('já existe um relatório em geração, pulando', tipo);
  const periodo = tipo === 'mensal' ? periodoMensal() : periodoSemanal();
  const jaFeito = db.relatorios().some((r) => r.tipo === tipo && r.inicio === periodo.inicio && r.fim === periodo.fim && !relatorioFalhou(r));
  if (jaFeito) return log(`relatório ${tipo} ${periodo.inicio}→${periodo.fim} já existe`);
  ocupado = true;
  try {
    log(`gerando relatório ${tipo} ${periodo.inicio}→${periodo.fim}`);
    const rel = await gerarRelatorio(tipo, { ...periodo, automatico: true });
    const cfg = db.config();
    if (cfg.relatorios.enviarAutomatico && cfg.whatsapp.provedor !== 'link') {
      const envios = await enviarRelatorio(rel.id).catch((e) => [{ ok: false, detalhe: e.message }]);
      log('envios:', envios.map((e: any) => `${e.para ?? ''} ${e.ok ? 'ok' : 'falhou: ' + e.detalhe}`).join(' | '));
    }
  } catch (e: any) {
    log('erro ao gerar', tipo, e.message);
  } finally {
    ocupado = false;
  }
}

function hm(h: string) {
  const [hora, min] = (h || '09:00').split(':').map((x) => parseInt(x, 10) || 0);
  return { hora, min };
}

export function reagendar() {
  tarefas.forEach((t) => t.stop());
  tarefas = [];
  const r = db.config().relatorios;

  if (r.semanalAtivo) {
    const { hora, min } = hm(r.semanalHora);
    tarefas.push(cron.schedule(`${min} ${hora} * * ${r.semanalDia}`, () => void executar('semanal')));
  }
  if (r.mensalAtivo) {
    const { hora, min } = hm(r.mensalHora);
    if (r.mensalQuando === 'primeiro-dia') {
      tarefas.push(cron.schedule(`${min} ${hora} 1 * *`, () => void executar('mensal')));
    } else {
      tarefas.push(
        cron.schedule(`${min} ${hora} 28-31 * *`, () => {
          if (ultimoDiaDoMes(new Date())) void executar('mensal');
        }),
      );
    }
  }
  log(`agendado: semanal ${r.semanalAtivo ? `dia ${r.semanalDia} ${r.semanalHora}` : 'desligado'} · mensal ${r.mensalAtivo ? `${r.mensalQuando} ${r.mensalHora}` : 'desligado'}`);
}

/** Se o horário do relatório já passou e ele não foi gerado (PC desligado), gera agora. */
export async function recuperarAtrasados() {
  const cfg = db.config();
  const r = cfg.relatorios;
  // Só recupera depois que o painel foi configurado (evita abrir o navegador sozinho no 1º uso).
  if (!cfg.whatsapp.destino.trim()) return log('recuperação ignorada: WhatsApp de destino ainda não configurado');
  const agora = new Date();
  const passou = (h: string) => {
    const { hora, min } = hm(h);
    return agora.getHours() * 60 + agora.getMinutes() >= hora * 60 + min;
  };
  if (r.semanalAtivo) {
    const p = periodoSemanal(agora);
    // dia agendado = a sexta que fecha a semana + até o dia da semana configurado
    const diaAgendado = new Date(p.fim + 'T00:00:00');
    diaAgendado.setDate(diaAgendado.getDate() + ((r.semanalDia + 2) % 7));
    const hoje = iso(agora);
    if (hoje > iso(diaAgendado) || (hoje === iso(diaAgendado) && passou(r.semanalHora))) await executar('semanal');
  }
  if (r.mensalAtivo) {
    const p = periodoMensal(agora);
    const fimDoMes = p.fim === iso(agora);
    const diaUmCedo = r.mensalQuando === 'primeiro-dia' && agora.getDate() === 1 && !passou(r.mensalHora);
    if (diaUmCedo) return;
    if (!fimDoMes || passou(r.mensalHora)) await executar('mensal');
  }
}

// Sininho: lembra o usuário toda sexta-feira (relatório semanal) e no último dia do mês (relatório geral).
// O lembrete só aparece no próprio dia, a partir do horário configurado; no dia seguinte some sozinho.
import { db, novoId } from './db.ts';
import { iso, periodoMensal, periodoSemanal, relatorioFalhou, tituloPeriodo } from './relatorios.ts';
import type { Notificacao } from '../shared/tipos.ts';

/** Só no próprio dia (sexta / último dia do mês), a partir do horário configurado. */
function ehAHora(diaIso: string, hora: string, agora: Date) {
  if (iso(agora) !== diaIso) return false;
  const [h, m] = (hora || '16:00').split(':').map((x) => parseInt(x, 10) || 0);
  return agora.getHours() * 60 + agora.getMinutes() >= h * 60 + m;
}

const dataBr = (s: string) => s.split('-').reverse().slice(0, 2).join('/');

export function garantirLembretes(agora = new Date()) {
  const cfg = db.config().relatorios;
  if (!cfg.lembreteAtivo) return;
  const lista = db.notificacoes();
  const existe = (tipo: Notificacao['tipo'], inicio: string, fim: string) => lista.some((n) => n.tipo === tipo && n.inicio === inicio && n.fim === fim);
  const novas: Notificacao[] = [];

  const s = periodoSemanal(agora); // sáb–sex (dentro do mês); o "fim" é a sexta
  if (ehAHora(s.fim, cfg.lembreteHora, agora) && !existe('semanal', s.inicio, s.fim)) {
    novas.push({
      id: novoId(),
      tipo: 'semanal',
      ...s,
      titulo: 'Hora do relatório semanal',
      texto: `Sexta-feira! Gere o relatório de ${dataBr(s.inicio)} a ${dataBr(s.fim)} (campanhas ativas de cada cliente).`,
      criadaEm: new Date().toISOString(),
      lida: false,
    });
  }

  const m = periodoMensal(agora); // no último dia = mês corrente
  if (ehAHora(m.fim, cfg.lembreteHora, agora) && !existe('mensal', m.inicio, m.fim)) {
    novas.push({
      id: novoId(),
      tipo: 'mensal',
      ...m,
      titulo: 'Fim do mês: relatório geral',
      texto: `Junte os relatórios de ${tituloPeriodo('mensal', m.inicio, m.fim)} e faça o geral do mês.`,
      criadaEm: new Date().toISOString(),
      lida: false,
    });
  }

  if (novas.length) db.salvarNotificacoes([...novas, ...lista]);
}

export function listarNotificacoes(): Notificacao[] {
  garantirLembretes();
  const rels = db.relatorios();
  const hoje = iso(new Date());
  // só os lembretes de hoje; os de dias anteriores somem sozinhos
  return db.notificacoes().filter((n) => !n.dispensada && n.fim === hoje).map((n) => ({
    ...n,
    concluida: rels.some((r) => r.tipo === n.tipo && r.inicio === n.inicio && r.fim === n.fim && !relatorioFalhou(r)),
  }));
}

export function marcarLida(id?: string) {
  db.salvarNotificacoes(db.notificacoes().map((n) => (!id || n.id === id ? { ...n, lida: true } : n)));
}

export function dispensar(id: string) {
  // mantém o registro (marcado) para o lembrete não ser recriado
  db.salvarNotificacoes(db.notificacoes().map((n) => (n.id === id ? { ...n, lida: true, dispensada: true } : n)));
}

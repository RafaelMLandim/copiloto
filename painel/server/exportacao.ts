// Leitura do arquivo exportado pelo Gerenciador de Anúncios ("Exportar dados da tabela" → .csv).
// Aceita cabeçalhos em PT-BR ou inglês, separador "," ou ";" e números "1.234,56" ou "1234.56".
import fs from 'node:fs';
import type { Metricas, MetricasCampanha } from '../shared/tipos.ts';

function normalizar(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function separarLinhas(txt: string, sep: string): string[][] {
  const linhas: string[][] = [];
  let campo = '';
  let linha: string[] = [];
  let aspas = false;
  for (let i = 0; i < txt.length; i++) {
    const ch = txt[i];
    if (aspas) {
      if (ch === '"' && txt[i + 1] === '"') {
        campo += '"';
        i++;
      } else if (ch === '"') aspas = false;
      else campo += ch;
    } else if (ch === '"') aspas = true;
    else if (ch === sep) {
      linha.push(campo);
      campo = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && txt[i + 1] === '\n') i++;
      linha.push(campo);
      if (linha.some((c) => c.trim())) linhas.push(linha);
      linha = [];
      campo = '';
    } else campo += ch;
  }
  linha.push(campo);
  if (linha.some((c) => c.trim())) linhas.push(linha);
  return linhas;
}

export function numero(bruto: string | undefined): number {
  let s = String(bruto ?? '').replace(/R\$|BRL|%|\s/g, '');
  if (!s || s === '-' || s === '—') return 0;
  const ultPonto = s.lastIndexOf('.');
  const ultVirg = s.lastIndexOf(',');
  if (ultPonto >= 0 && ultVirg >= 0) {
    s = ultVirg > ultPonto ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (ultVirg >= 0) {
    s = /^\d{1,3}(,\d{3})+$/.test(s) ? s.replace(/,/g, '') : s.replace(',', '.');
  } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, '');
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

/** Procura a coluna cujo cabeçalho começa (ou é igual) a algum dos nomes. */
function coluna(cab: string[], nomes: string[], exato = false) {
  for (const n of nomes) {
    const i = cab.findIndex((c) => (exato ? c === n : c === n || c.startsWith(n)));
    if (i >= 0) return i;
  }
  return -1;
}

export interface LeituraExportacao {
  campanhas: (MetricasCampanha & { indicador?: string })[];
  colunasEncontradas: string[];
}

export function lerExportacao(caminho: string): LeituraExportacao {
  let txt = fs.readFileSync(caminho, 'utf8').replace(/^﻿/, '');
  if (txt.includes('\u0000')) txt = fs.readFileSync(caminho, 'utf16le').replace(/^﻿/, '');
  const primeira = txt.split(/\r?\n/)[0] ?? '';
  const sep = [';', ',', '\t'].sort((a, b) => primeira.split(b).length - primeira.split(a).length)[0];
  const linhas = separarLinhas(txt, sep);
  if (linhas.length < 2) throw new Error('Arquivo exportado vazio');

  const cab = linhas[0].map(normalizar);
  const iNome = coluna(cab, ['nome da campanha', 'campaign name', 'nome do conjunto de anuncios', 'nome do anuncio']);
  if (iNome < 0) throw new Error('Não achei a coluna "Nome da campanha" no arquivo');
  const idx = {
    investido: coluna(cab, ['valor usado', 'amount spent', 'valor gasto']),
    impressoes: coluna(cab, ['impressoes', 'impressions']),
    alcance: coluna(cab, ['alcance', 'reach']),
    cliques: coluna(cab, ['cliques no link', 'link clicks', 'cliques (todos)', 'clicks (all)']),
    conversas: coluna(cab, ['conversas por mensagem iniciadas', 'messaging conversations started', 'conversas iniciadas']),
    leads: coluna(cab, ['leads', 'cadastros', 'leads (formulario)', 'leads no facebook'], true),
    resultados: coluna(cab, ['resultados', 'results'], true),
    indicador: coluna(cab, ['indicador de resultado', 'result indicator', 'tipo de resultado']),
    status: coluna(cab, ['veiculacao da campanha', 'veiculacao', 'delivery', 'status']),
  };
  const v = (l: string[], i: number) => (i >= 0 ? numero(l[i]) : 0);

  const campanhas = linhas
    .slice(1)
    .filter((l) => (l[iNome] ?? '').trim())
    .map((l) => {
      const indicador = idx.indicador >= 0 ? normalizar(l[idx.indicador] ?? '') : '';
      const resultados = v(l, idx.resultados);
      let conversas = v(l, idx.conversas);
      let leads = v(l, idx.leads);
      // Sem coluna específica: usa "Resultados" conforme o indicador da campanha
      if (!conversas && !leads && resultados) {
        if (/mensag|messag|convers/.test(indicador)) conversas = resultados;
        else if (/lead|cadastro/.test(indicador)) leads = resultados;
      }
      const investido = v(l, idx.investido);
      const impressoes = v(l, idx.impressoes);
      const cliques = v(l, idx.cliques);
      const total = conversas + leads;
      const m: Metricas = {
        investido,
        impressoes,
        alcance: v(l, idx.alcance),
        cliques,
        ctr: impressoes ? (cliques / impressoes) * 100 : 0,
        cpm: impressoes ? (investido / impressoes) * 1000 : 0,
        conversas,
        leads,
        resultados: total,
        custoPorResultado: total ? investido / total : null,
      };
      return { nome: l[iNome].trim(), status: idx.status >= 0 ? l[idx.status] : undefined, indicador, ...m };
    });

  return { campanhas, colunasEncontradas: Object.entries(idx).filter(([, i]) => i >= 0).map(([k]) => k) };
}

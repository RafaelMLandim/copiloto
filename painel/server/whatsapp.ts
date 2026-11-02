// Envio de mensagens de WhatsApp. Provedores:
//  - link:      não envia sozinho; gera um link wa.me que abre o WhatsApp com o texto pronto
//  - callmebot: grátis, só envia para o PRÓPRIO número que ativou o bot (bom para relatório pessoal)
//  - evolution: Evolution API (self-hosted), envia para qualquer número
//  - zapi:      Z-API (pago), envia para qualquer número
import { db } from './db.ts';

export function normalizarNumero(n: string) {
  let d = n.replace(/\D/g, '');
  if (d.length === 10 || d.length === 11) d = '55' + d; // número brasileiro sem DDI
  return d;
}

export function linkWhatsapp(numero: string, texto: string) {
  return `https://wa.me/${normalizarNumero(numero)}?text=${encodeURIComponent(texto)}`;
}

export async function enviarWhatsapp(numero: string, texto: string): Promise<{ ok: boolean; detalhe?: string; link?: string }> {
  const w = db.config().whatsapp;
  const tel = normalizarNumero(numero);
  if (!tel) return { ok: false, detalhe: 'Número vazio' };
  const link = linkWhatsapp(tel, texto);

  try {
    switch (w.provedor) {
      case 'callmebot': {
        if (!w.callmebotApiKey) throw new Error('Falta a API key do CallMeBot');
        const url = `https://api.callmebot.com/whatsapp.php?phone=${tel}&apikey=${encodeURIComponent(w.callmebotApiKey)}&text=${encodeURIComponent(texto)}`;
        const r = await fetch(url);
        const corpo = await r.text();
        if (!r.ok || /error|invalid/i.test(corpo.slice(0, 300))) throw new Error(corpo.replace(/<[^>]+>/g, ' ').trim().slice(0, 200));
        return { ok: true, detalhe: 'Enviado via CallMeBot', link };
      }
      case 'evolution': {
        if (!w.evolutionUrl || !w.evolutionInstancia) throw new Error('Configure URL e instância da Evolution API');
        const r = await fetch(`${w.evolutionUrl.replace(/\/$/, '')}/message/sendText/${encodeURIComponent(w.evolutionInstancia)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', apikey: w.evolutionApiKey },
          body: JSON.stringify({ number: tel, text: texto }),
        });
        if (!r.ok) throw new Error(`Evolution API: ${r.status} ${(await r.text()).slice(0, 200)}`);
        return { ok: true, detalhe: 'Enviado via Evolution API', link };
      }
      case 'zapi': {
        if (!w.zapiInstancia || !w.zapiToken) throw new Error('Configure instância e token da Z-API');
        const r = await fetch(`https://api.z-api.io/instances/${w.zapiInstancia}/token/${w.zapiToken}/send-text`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(w.zapiClientToken ? { 'Client-Token': w.zapiClientToken } : {}) },
          body: JSON.stringify({ phone: tel, message: texto }),
        });
        if (!r.ok) throw new Error(`Z-API: ${r.status} ${(await r.text()).slice(0, 200)}`);
        return { ok: true, detalhe: 'Enviado via Z-API', link };
      }
      default:
        return { ok: false, detalhe: 'Modo link: abra o link para enviar pelo WhatsApp', link };
    }
  } catch (e: any) {
    return { ok: false, detalhe: e.message, link };
  }
}

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8';

export function metaReceiver(kind: 'meta' | 'whatsapp') {
  const functionName = kind === 'meta' ? 'desk-meta-webhook' : 'desk-whatsapp-webhook';
  const prefix = kind === 'meta' ? 'DESK_META' : 'DESK_WHATSAPP';
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type, x-hub-signature-256', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' };
  return async (req: Request) => {
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
    const reply = (message: string, status: number) => new Response(JSON.stringify({ message }), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
    const url = new URL(req.url);
    if (req.method === 'GET') {
      const expected = Deno.env.get(prefix + '_VERIFY_TOKEN');
      if (!expected || expected.length < 32) return reply('Verifica webhook non configurata', 503);
      if (url.searchParams.get('hub.mode') !== 'subscribe' || url.searchParams.get('hub.verify_token') !== expected) return reply('Verifica non autorizzata', 403);
      return new Response(url.searchParams.get('hub.challenge') || '', { headers: cors });
    }
    if (req.method !== 'POST') return reply('Metodo non consentito', 405);
    const secret = Deno.env.get(prefix + '_APP_SECRET');
    if (!secret) return reply('Firma webhook non configurata', 503);
    const signature = req.headers.get('x-hub-signature-256') || '';
    if (!/^sha256=[a-f0-9]{64}$/i.test(signature)) return reply('Firma assente o non valida', 401);
    if (Number(req.headers.get('content-length')) > 262144) return reply('Evento troppo grande', 413);
    const raw = await req.text();
    if (new TextEncoder().encode(raw).length > 262144) return reply('Evento troppo grande', 413);
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
    const bytes = new Uint8Array(signature.slice(7).match(/.{2}/g)!.map(x => parseInt(x, 16)));
    if (!await crypto.subtle.verify('HMAC', key, bytes, new TextEncoder().encode(raw))) return reply('Firma non valida', 401);
    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
    try {
      const body = JSON.parse(raw);
      if (body.object !== (kind === 'meta' ? 'page' : 'whatsapp_business_account') || !Array.isArray(body.entry)) return reply('Evento non pertinente', 200);
      let accepted = 0;
      for (const entry of body.entry) {
        for (const change of Array.isArray(entry.changes) ? entry.changes : []) {
          if (kind === 'meta' && change.field !== 'leadgen' || kind === 'whatsapp' && change.field !== 'messages') continue;
          const value = change.value;
          const remote = kind === 'meta' ? String(value?.page_id || entry.id || '') : String(value?.metadata?.phone_number_id || '');
          if (!/^\d{1,40}$/.test(remote)) continue;
          const { data: connection, error: readError } = await db.from('desk_connections').select('id,tenant_id,config').eq('kind', kind).eq('remote_id', remote).eq('enabled', true).maybeSingle();
          if (readError) throw readError;
          if (!connection) continue;
          const events: { external_id: string; payload: Record<string, unknown> }[] = [];
          if (kind === 'meta') {
            const lead = String(value.leadgen_id || ''); const form = String(value.form_id || '');
            if (!/^\d{1,40}$/.test(lead) || !connection.config.form_ids?.includes(form)) continue;
            events.push({ external_id: lead, payload: { lead_id: lead, form_id: form } });
          } else {
            for (const message of Array.isArray(value.messages) ? value.messages : []) {
              if (typeof message.id !== 'string' || message.id.length > 250 || !/^\d{7,20}$/.test(message.from || '') || !/^\d{10}$/.test(message.timestamp || '')) continue;
              const received = new Date(Number(message.timestamp) * 1000);
              if (received.getTime() > Date.now() + 300000) continue;
              const profile = (value.contacts || []).find((x: { wa_id: string }) => x.wa_id === message.from)?.profile;
              const referral = message.referral?.source_type === 'ad' && /^\d+$/.test(String(message.referral?.source_id || '')) ? { original_source: 'Meta Ads', referral_id: String(message.referral.source_id) } : { original_source: 'Origine non determinata' };
              events.push({ external_id: message.id, payload: { name: typeof profile?.name === 'string' ? profile.name.trim().slice(0, 150) || 'Contatto WhatsApp' : 'Contatto WhatsApp', phone: '+' + message.from, email: '', received_at: received.toISOString(), attribution: referral } });
            }
            for (const status of Array.isArray(value.statuses) ? value.statuses : []) {
              if (typeof status.id !== 'string' || status.id.length > 250 || !['sent','delivered','read','failed'].includes(status.status) || !/^\d{10}$/.test(status.timestamp || '')) continue;
              const { error } = await db.rpc('desk_whatsapp_receipt', { p_connection: connection.id, p_message: status.id, p_status: status.status, p_at: new Date(Number(status.timestamp) * 1000).toISOString() });
              if (error) throw error;
            }
          }
          for (const event of events) {
            const { error } = await db.from('desk_external_events').upsert({ connection_id: connection.id, tenant_id: connection.tenant_id, ...event }, { onConflict: 'connection_id,external_id', ignoreDuplicates: true });
            if (error) throw error;
            accepted++;
          }
          const { error } = await db.from('desk_connections').update({ webhook_at: new Date().toISOString() }).eq('id', connection.id);
          if (error) throw error;
        }
      }
      console.info(`[${functionName}] Eventi firmati acquisiti`, { accepted });
      return reply('Eventi acquisiti in coda persistente', 200);
    } catch (error) {
      console.error(`[${functionName}] Acquisizione non riuscita`, { name: error instanceof Error ? error.name : 'Errore' });
      return reply('Acquisizione non riuscita: ritentare lo stesso evento', 503);
    }
  };
}

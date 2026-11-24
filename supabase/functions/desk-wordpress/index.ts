import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type, x-desk-connection, x-desk-timestamp, x-desk-signature', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  const reply = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
  if (req.method !== 'POST') return reply({ error: 'Metodo non consentito' }, 405);
  const connection = req.headers.get('x-desk-connection') || '';
  const timestamp = req.headers.get('x-desk-timestamp') || '';
  const signature = req.headers.get('x-desk-signature') || '';
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuid.test(connection) || !/^\d{10}$/.test(timestamp) || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300 || !/^[a-f0-9]{64}$/i.test(signature)) return reply({ error: 'Firma non valida o scaduta' }, 401);
  if (Number(req.headers.get('content-length')) > 32768) return reply({ error: 'Evento troppo grande' }, 413);
  try {
    const raw = await req.text();
    if (new TextEncoder().encode(raw).length > 32768) return reply({ error: 'Evento troppo grande' }, 413);
    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
    const { data: config, error } = await db.rpc('desk_wp_secret', { p_id: connection });
    if (error || !config) return reply({ error: 'Connessione non autorizzata' }, 401);
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(config.secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
    const bytes = new Uint8Array(signature.match(/.{2}/g)!.map(b => parseInt(b, 16)));
    const verified = await crypto.subtle.verify('HMAC', key, bytes, new TextEncoder().encode(`${timestamp}.${raw}`));
    if (!verified) return reply({ error: 'Firma non valida' }, 401);
    const input = JSON.parse(raw);
    if (input.action === 'test') {
      const { error } = await db.from('desk_wordpress_connections').update({ verified_at: new Date().toISOString() }).eq('id', connection);
      if (error) throw error;
      console.info('[desk-wordpress] Connessione verificata');
      return reply({ success: true, message: 'Firma verificata. Collegamento al CRM riuscito; nessun contatto creato.' });
    }
    const text = (value: unknown, max: number) => typeof value === 'string' ? value.trim().slice(0, max) : '';
    const name = text(input.name, 150), email = text(input.email, 254), phone = text(input.phone, 40).replace(/[^+\d]/g, '');
    const formName = text(input.form_name, 120), formId = text(input.form_id, 120), page = text(input.page_url, 1000);
    const received = new Date(input.received_at);
    if (!uuid.test(input.event_id || '') || name.length < 2 || !formName || !formId || (!phone && !email) || email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !Number.isFinite(received.getTime()) || received.getTime() > Date.now() + 300000) return reply({ error: 'Dati amministrativi non validi' }, 400);
    let pageUrl: URL;
    try { pageUrl = new URL(page); } catch { return reply({ error: 'Pagina non valida' }, 400); }
    if (pageUrl.origin !== new URL(config.site_url).origin) return reply({ error: 'Sito non autorizzato' }, 400);
    const utm: Record<string, string> = {};
    for (const field of ['utm_source','utm_medium','utm_campaign','utm_content','utm_term']) { const value = text(input.utm?.[field], 250); if (value) utm[field] = value; }
    let referrer = '', landingPage = '';
    try { const url = new URL(text(input.referrer, 1000)); if (['https:','http:'].includes(url.protocol)) referrer = url.origin + url.pathname; } catch { /* referrer facoltativo */ }
    try { const url = new URL(text(input.landing_page, 1000)); if (url.origin === new URL(config.site_url).origin) landingPage = url.origin + url.pathname; } catch { /* landing page facoltativa */ }
    const payload = { name, email, phone, form_name: formName, form_id: formId, page_url: pageUrl.origin + pageUrl.pathname, received_at: received.toISOString(), utm, referrer, landing_page: landingPage };
    const { error: insertError } = await db.from('desk_wordpress_events').upsert({ connection_id: connection, tenant_id: config.tenant_id, external_id: input.event_id, payload }, { onConflict: 'connection_id,external_id', ignoreDuplicates: true });
    if (insertError) throw insertError;
    await db.from('desk_wordpress_connections').update({ last_event_at: new Date().toISOString() }).eq('id', connection);
    console.info('[desk-wordpress] Evento acquisito in coda persistente');
    return reply({ success: true, message: 'Evento acquisito. Elaborazione server entro il prossimo ciclo.' }, 202);
  } catch (error) {
    console.error('[desk-wordpress] Acquisizione non riuscita', { name: error instanceof Error ? error.name : 'Errore' });
    return reply({ error: 'Servizio temporaneamente non disponibile. Conservare e ritentare lo stesso evento.' }, 503);
  }
});

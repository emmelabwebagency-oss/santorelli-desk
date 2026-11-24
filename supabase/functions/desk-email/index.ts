import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-desk-worker', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  const reply = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
  if (req.method !== 'POST') return reply({ error: 'Metodo non consentito' }, 405);
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  try {
    let callerId: string | null = null, callerEmail: string | null = null, tenantId: string | null = null;
    const input = await req.json().catch(() => ({}));
    let machine = false;
    const machineKey = req.headers.get('x-desk-worker');
    if (machineKey) { const { data, error } = await db.rpc('desk_worker_authorize', { p_token: machineKey }); machine = !error && data === true; }
    if (!machine) {
      const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
      if (!token) return reply({ error: 'Non autorizzato' }, 401);
      const { data: auth, error } = await db.auth.getUser(token);
      if (error || !auth.user) return reply({ error: 'Sessione non valida' }, 401);
      const { data: caller } = await db.from('desk_members').select('role,tenant_id').eq('id', auth.user.id).eq('active', true).single();
      if (caller?.role !== 'super_admin') return reply({ error: 'Accesso tecnico richiesto' }, 403);
      callerId = auth.user.id; callerEmail = auth.user.email || null; tenantId = caller.tenant_id;
    }
    if (input.action === 'test') {
      if (machine || !callerId || !callerEmail || !tenantId) return reply({ error: 'Test riservato al Super Admin autenticato' }, 403);
      const { error } = await db.from('desk_email_outbox').upsert({ tenant_id: tenantId, recipient: callerEmail, subject: 'Santorelli Desk · verifica invio email', dedup_key: `test:${callerId}:${Math.floor(Date.now() / 300000)}` }, { onConflict: 'dedup_key', ignoreDuplicates: true });
      if (error) throw error;
    }
    const key = Deno.env.get('RESEND_API_KEY');
    const from = Deno.env.get('DESK_EMAIL_FROM');
    const appOrigin = Deno.env.get('DESK_APP_ORIGIN');
    let origin: URL | null = null;
    try { origin = appOrigin ? new URL(appOrigin) : null; } catch { /* configurazione validata sotto */ }
    if (!key || !from || /[\r\n]/.test(from) || origin?.protocol !== 'https:') {
      await db.from('desk_service_health').upsert({ name: 'email', status: 'configurazione_mancante', checked_at: new Date().toISOString() });
      return reply({ configured: false, sent: 0, message: 'Configurare RESEND_API_KEY, DESK_EMAIL_FROM e DESK_APP_ORIGIN nei segreti server.' });
    }
    const { data: rows, error } = await db.rpc('desk_email_claim_for', { p_tenant: machine ? null : tenantId });
    if (error) throw error;
    let sent = 0, failed = 0;
    for (const row of rows || []) {
      let success = false, permanent = false, provider: string | null = null, failure: string | null = null;
      try {
        const appUrl = new URL('/', origin!).href;
        const body = typeof row.body_text === 'string' && row.body_text ? row.body_text.replaceAll('{app_url}', appUrl) : 'È richiesta una verifica amministrativa nello spazio riservato dello studio.';
        const response = await fetch('https://api.resend.com/emails', {
          method: 'POST', signal: AbortSignal.timeout(15000),
          headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json', 'Idempotency-Key': `desk-email-${row.id}` },
          body: JSON.stringify({ from, to: [row.recipient], subject: row.subject, text: `Santorelli Desk\n\n${row.subject}\n\n${body}\n\nAccedi: ${appUrl}\n\nQuesta email non contiene dati del contatto o informazioni cliniche. Non rispondere con dati paziente.` }),
        });
        const result = await response.json().catch(() => ({}));
        success = response.ok && typeof result.id === 'string'; provider = success ? result.id : null;
        if (!success) { failure = `Risposta provider HTTP ${response.status}`; permanent = response.status >= 400 && response.status < 500 && ![408,409,429].includes(response.status); }
      } catch { failure = 'Provider non raggiungibile o tempo di attesa superato'; }
      const { error: finishError } = await db.rpc('desk_email_finish', { p_id: row.id, p_lease: row.lease_token, p_success: success, p_provider: provider, p_error: failure, p_permanent: permanent });
      if (finishError) console.error('[desk-email] Esito non salvato', { code: finishError.code });
      if (success) sent++; else failed++;
    }
    await db.from('desk_service_health').upsert({ name: 'email', status: failed ? 'errori_consegna' : sent ? 'invio_accettato' : 'pronto_nessun_invio', checked_at: new Date().toISOString() });
    console.info('[desk-email] Ciclo completato', { sent, failed });
    return reply({ configured: true, sent, failed, message: sent ? 'Email accettate dal provider. La ricezione in casella deve essere verificata.' : failed ? 'Uno o più invii non sono riusciti. Consultare la coda.' : 'Nessuna email da inviare.' });
  } catch (error) {
    console.error('[desk-email] Errore worker', { name: error instanceof Error ? error.name : 'Errore' });
    return reply({ error: 'Elaborazione email non riuscita' }, 500);
  }
});

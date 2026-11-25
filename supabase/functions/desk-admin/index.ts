import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8';
import { deskOrigin, sendAuthEmail } from '../_shared/auth-email.ts';

const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
  if (req.method !== 'POST') return reply({ error: 'Metodo non consentito' }, 405);
  try {
    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } });
    const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
    if (!token) return reply({ error: 'Non autorizzato' }, 401);
    const { data: auth, error: authError } = await db.auth.getUser(token);
    if (authError || !auth.user) return reply({ error: 'Sessione non valida' }, 401);
    const { data: caller } = await db.from('desk_members').select('*').eq('id', auth.user.id).eq('active', true).single();
    const tenant = '11111111-1111-4111-8111-111111111111';
    if (!caller || caller.tenant_id !== tenant || !['super_admin', 'admin'].includes(caller.role)) return reply({ error: 'Permessi insufficienti' }, 403);
    const raw = await req.text();
    if (new TextEncoder().encode(raw).length > 4096) return reply({ error: 'Richiesta troppo grande' }, 413);
    let input;
    try { input = JSON.parse(raw); } catch { return reply({ error: 'Richiesta non valida' }, 400); }
    if (input?.action !== 'invite') return reply({ error: 'Operazione non disponibile' }, 400);
    const role = input.role;
    if (!['segretaria', 'admin', 'super_admin'].includes(role) || (caller.role === 'admin' && role !== 'segretaria')) return reply({ error: 'Ruolo non consentito' }, 403);
    const email = String(input.email || '').trim().toLowerCase();
    const name = String(input.name || '').trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || name.length < 2 || name.length > 150) return reply({ error: 'Nome o email non validi' }, 400);
    const loginUrl = new URL('/accesso', deskOrigin);
    if (loginUrl.protocol !== 'https:' || !Deno.env.get('RESEND_API_KEY')) return reply({ error: 'Servizio email non configurato' }, 503);
    // L’account viene creato soltanto dopo l’autorizzazione del responsabile.
    const { data: created, error: createError } = await db.auth.admin.createUser({ email, email_confirm: false });
    if (createError || !created.user) {
      console.error('[desk-admin] Creazione account non riuscita', { code: createError?.code });
      return reply({ error: 'Account non creato. L’indirizzo potrebbe essere già registrato: controlla gli utenti prima di riprovare.' }, 400);
    }
    const { error: memberError } = await db.from('desk_members').insert({ id: created.user.id, tenant_id: tenant, full_name: name, role });
    if (memberError) {
      console.error('[desk-admin] Profilo non creato', { code: memberError.code });
      const { error: cleanupError } = await db.auth.admin.deleteUser(created.user.id);
      if (cleanupError) console.error('[desk-admin] Rimozione account incompleto non riuscita');
      return reply({ error: 'Abilitazione non riuscita. Nessun accesso operativo è stato concesso.' }, 500);
    }
    try {
      await sendAuthEmail('desk-admin', email, 'Sei stato abilitato a Santorelli Desk', `Il responsabile ti ha abilitato a Santorelli Desk.\n\nPer accedere apri ${loginUrl.href} e richiedi il codice usando questo indirizzo email. Non serve una password.\n\nNon condividere i codici di accesso. Se non riconosci questo invito, contatta il responsabile dello studio.`);
    } catch {
      console.error('[desk-admin] Account abilitato ma notifica non inviata');
      return reply({ error: 'Account abilitato, ma Resend non ha confermato l’invio della notifica. L’utente può richiedere il codice dalla pagina di accesso. Non ripetere la creazione.' }, 502);
    }
    console.info('[desk-admin] Account abilitato e notifica inviata', { role });
    return reply({ success: true, message: 'Account abilitato. Invito inviato tramite Resend.' });
  } catch {
    console.error('[desk-admin] Errore operazione');
    return reply({ error: 'Operazione non riuscita' }, 500);
  }
});

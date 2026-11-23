import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8';

const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-bootstrap-secret', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  if (req.method !== 'POST') return reply({ error: 'Metodo non consentito' }, 405);
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const origin = Deno.env.get('DESK_APP_ORIGIN');
  if (!origin || !origin.startsWith('https://')) return reply({ error: 'Origine pubblica HTTPS non configurata' }, 503);
  try {
    const input = await req.json();
    const tenant = '11111111-1111-4111-8111-111111111111';
    let email: string; let name: string; let role: string;
    if (input.action === 'bootstrap') {
      const expected = Deno.env.get('DESK_BOOTSTRAP_SECRET');
      const supplied = req.headers.get('x-bootstrap-secret');
      if (!expected || expected.length < 32 || supplied !== expected) return reply({ error: 'Non autorizzato' }, 401);
      const { count, error } = await db.from('desk_members').select('id', { count: 'exact', head: true }).eq('role', 'super_admin');
      if (error) throw error;
      if (count) return reply({ error: 'Bootstrap già completato' }, 409);
      email = Deno.env.get('DESK_BOOTSTRAP_EMAIL') || ''; name = 'Amministrazione EmmeLab'; role = 'super_admin';
    } else if (input.action === 'invite') {
      const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
      if (!token) return reply({ error: 'Non autorizzato' }, 401);
      const { data: auth, error } = await db.auth.getUser(token);
      if (error || !auth.user) return reply({ error: 'Sessione non valida' }, 401);
      const { data: caller } = await db.from('desk_members').select('*').eq('id', auth.user.id).eq('active', true).single();
      if (!caller || caller.tenant_id !== tenant || !['super_admin', 'admin'].includes(caller.role)) return reply({ error: 'Permessi insufficienti' }, 403);
      role = input.role;
      if (!['segretaria', 'admin'].includes(role) || (caller.role === 'admin' && role !== 'segretaria')) return reply({ error: 'Ruolo non consentito' }, 403);
      email = String(input.email || '').trim(); name = String(input.name || '').trim();
    } else return reply({ error: 'Operazione non disponibile' }, 400);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || name.length < 2 || name.length > 150) return reply({ error: 'Nome o email non validi' }, 400);
    const { data: invited, error: inviteError } = await db.auth.admin.inviteUserByEmail(email, { redirectTo: new URL('/reset-password', origin).href });
    if (inviteError || !invited.user) {
      console.error('[desk-admin] Invito non riuscito', { code: inviteError?.code });
      return reply({ error: 'Invito non riuscito. Verificare configurazione email ed eventuale account esistente.' }, 400);
    }
    const { error: memberError } = input.action === 'bootstrap'
      ? await db.rpc('desk_bootstrap_member', { p_user: invited.user.id })
      : await db.from('desk_members').insert({ id: invited.user.id, tenant_id: tenant, full_name: name, role });
    if (memberError) {
      console.error('[desk-admin] Profilo non creato', { code: memberError.code });
      await db.auth.admin.deleteUser(invited.user.id);
      return reply({ error: 'Abilitazione non riuscita. Nessun accesso operativo è stato concesso.' }, 500);
    }
    console.info('[desk-admin] Account abilitato', { role });
    return reply({ success: true, message: 'Account abilitato. Invito inviato tramite il servizio di autenticazione.' });
  } catch (error) {
    console.error('[desk-admin] Errore operazione', { name: error instanceof Error ? error.name : 'Errore' });
    return reply({ error: 'Operazione non riuscita' }, 500);
  }
});

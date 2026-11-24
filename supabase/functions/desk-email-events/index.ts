import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8';
import { Webhook } from 'https://esm.sh/svix@1.62.0';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type, svix-id, svix-timestamp, svix-signature' };
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  const reply = (message: string, status: number) => new Response(JSON.stringify({ message }), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
  if (req.method !== 'POST') return reply('Metodo non consentito', 405);
  const secret = Deno.env.get('RESEND_WEBHOOK_SECRET');
  if (!secret) return reply('Ricevute email non configurate', 503);
  if (Number(req.headers.get('content-length')) > 65536) return reply('Evento troppo grande', 413);
  const raw = await req.text();
  if (new TextEncoder().encode(raw).length > 65536) return reply('Evento troppo grande', 413);
  let event: { type: string; created_at: string; data: { email_id: string } };
  const id = req.headers.get('svix-id') || '';
  try {
    event = new Webhook(secret).verify(raw, { 'svix-id': id, 'svix-timestamp': req.headers.get('svix-timestamp') || '', 'svix-signature': req.headers.get('svix-signature') || '' }) as typeof event;
  } catch {
    console.warn('[desk-email-events] Firma ricevuta rifiutata');
    return reply('Firma non valida', 401);
  }
  if (!['email.delivered', 'email.bounced', 'email.complained', 'email.delivery_delayed'].includes(event.type)) return reply('Evento non pertinente', 200);
  const at = new Date(event.created_at);
  if (!id || typeof event.data?.email_id !== 'string' || !Number.isFinite(at.getTime())) return reply('Evento non valido', 400);
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const { error } = await db.rpc('desk_email_receipt', { p_event: id, p_provider: event.data.email_id, p_type: event.type, p_at: at.toISOString() });
  if (error) {
    console.error('[desk-email-events] Ricevuta non salvata', { code: error.code });
    return reply('Riprovare la consegna dell’evento', 503);
  }
  console.info('[desk-email-events] Ricevuta elaborata', { type: event.type });
  return reply('Ricevuta acquisita', 200);
});

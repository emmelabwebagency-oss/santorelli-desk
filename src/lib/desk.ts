import { supabase } from '@/integrations/supabase/client';

export type Member = { id: string; tenant_id: string; full_name: string; role: 'segretaria' | 'admin' | 'super_admin'; active: boolean };
export type Contact = { id: string; name: string; phone: string; email: string };
export type Inquiry = { id: string; contact_id: string; administrative_category: string; attribution: Record<string, unknown>; source: string; subject: string; priority: string; status: string; assigned_to: string | null; created_at: string; first_handled_at: string | null; closed_at: string | null; desk_contacts: Contact };
export type Task = { id: string; inquiry_id: string; assigned_to: string; kind: string; due_at: string; completed_at: string | null };
export type Activity = { id: string; inquiry_id: string; actor_id: string | null; event: string; note: string; created_at: string };
export type Notice = { id: string; title: string; created_at: string };
export type Site = { id: string; name: string };
export const dateTime = (value: string) => new Intl.DateTimeFormat('it-IT', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome' }).format(new Date(value));
export const romeDay = (value: string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value));
export const isOpen = (i: Inquiry) => !['CHIUSA', 'ANNULLATA'].includes(i.status);
export const isEscalated = (i: Inquiry) => isOpen(i) && i.attribution?.historical_import !== true && !i.first_handled_at && Date.now() - new Date(i.created_at).getTime() >= 48 * 3600000;
export async function command(action: string, data: Record<string, unknown>) {
  const { error } = await supabase.rpc('desk_command', { p_action: action, p_data: data });
  if (error) throw new Error(error.message);
}
export function authMessage(message: string) {
  if (/invalid login/i.test(message)) return 'Email o password non corrette.';
  if (/email not confirmed/i.test(message)) return 'Conferma prima il tuo indirizzo email.';
  if (/rate limit|too many/i.test(message)) return 'Troppi tentativi. Attendi qualche minuto e riprova.';
  return 'Operazione non riuscita. Verifica i dati o contatta il responsabile tecnico.';
}
export function downloadCsv(rows: string[][], filename: string) {
  const csv = '\uFEFF' + rows.map(row => row.map(v => '"' + (/^[=+@\-\t\r]/.test(v) ? "'" + v : v).replace(/"/g, '""') + '"').join(';')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url);
}

export const deskOrigin = Deno.env.get('DESK_APP_ORIGIN') || 'https://desk.adrianosantorelli.it';

export async function sendAuthEmail(functionName: 'desk-login' | 'desk-admin', email: string, subject: string, text: string) {
  const key = Deno.env.get('RESEND_API_KEY');
  if (!key) throw new Error('Servizio email non configurato');
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: 'Santorelli Desk <desk@adrianosantorelli.it>', to: [email], subject, text }),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    console.error(`[${functionName}] Invio Resend rifiutato`, { status: response.status });
    throw new Error('Invio email non riuscito');
  }
  console.info(`[${functionName}] Email accettata da Resend`);
}

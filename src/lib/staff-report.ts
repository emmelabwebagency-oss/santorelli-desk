export type ReportMetrics = {
  actions: number; worked: number; calls: number; emails: number; whatsapp: number;
  callbacks: number; completed: number; appointments: number; received: number; open_now: number;
};
export type StaffReportPerson = ReportMetrics & {
  id: string | null; full_name: string; role: string; active: boolean;
  days: { day: string; actions: number; worked: number }[];
};
export type StaffReport = {
  from: string; to: string; scope: 'studio' | 'personale'; generated_at: string;
  people: StaffReportPerson[]; totals: ReportMetrics;
};

export const reportMetrics: { key: keyof ReportMetrics; label: string }[] = [
  {key:'actions',label:'Azioni registrate'},
  {key:'worked',label:'Richieste lavorate'},
  {key:'calls',label:'Telefonate / tentativi'},
  {key:'emails',label:'Esiti email manuali'},
  {key:'whatsapp',label:'Esiti WhatsApp manuali'},
  {key:'callbacks',label:'Richiami pianificati'},
  {key:'completed',label:'Chiusure registrate'},
  {key:'appointments',label:'Appuntamenti registrati manualmente'},
  {key:'received',label:'Nuove richieste assegnate'},
  {key:'open_now',label:'Di queste, ancora aperte'},
];

export const reportNotes = [
  'Le azioni sono attribuite alla persona che le ha registrate nel periodo, anche se la richiesta è stata successivamente riassegnata. Non vengono esportati nomi, recapiti o note dei contatti.',
  'Le nuove richieste sono quelle ricevute nel periodo e attribuite all’assegnatario attuale. Lo stato aperto è quello al momento della generazione, non uno storico alla data finale.',
  'Telefonate, email, WhatsApp e appuntamenti indicano esiti registrati manualmente nel CRM: non certificano invii, consegne o conferme AlfaDocs. I richiami sono pianificazioni, non chiamate effettuate.',
  'Le richieste lavorate sono univoche nel totale del periodo. La stessa richiesta può comparire per più operatori o giorni: le righe non sono quindi sempre sommabili. Tutte le date usano Europe/Rome.',
];

export function reportDate(value: string): string {
  return value.split('-').reverse().join('/');
}

export function validReportRange(from: string, to: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from)||!/^\d{4}-\d{2}-\d{2}$/.test(to)) return false;
  const difference=(Date.parse(to)-Date.parse(from))/86400000;
  return Number.isFinite(difference)&&difference>=0&&difference<=365;
}

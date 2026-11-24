import Papa from 'papaparse';

export const historyFields = [
  ['id', 'ID stabile originale', true], ['name', 'Nome e cognome', true],
  ['phone', 'Telefono', false], ['email', 'Email', false],
  ['received_at', 'Ricezione (ISO con fuso)', true], ['source', 'Fonte originale', false],
  ['status', 'Stato originale', false], ['first_handled_at', 'Prima gestione (ISO con fuso)', false],
  ['closed_at', 'Chiusura (ISO con fuso)', false], ['campaign_id', 'ID campagna', false],
  ['campaign_name', 'Campagna', false], ['adset_id', 'ID gruppo inserzioni', false],
  ['adset_name', 'Gruppo inserzioni', false], ['ad_id', 'ID inserzione', false], ['ad_name', 'Inserzione', false],
] as const;
export type HistoryField = typeof historyFields[number][0];
export type HistoryMapping = Partial<Record<HistoryField, string>>;
export type HistoryRow = Record<HistoryField, string>;
export const historicalSources = ['Facebook Lead Ads','Instagram Lead Ads','Meta Lead Ads','WhatsApp','WordPress','Telefono','Richiesta manuale','Origine non determinata','Pipelean (storico)'];
const statuses = ['NUOVA','PRESA IN CARICO','DA CONTATTARE','CONTATTATA','NON RISPONDE','DA RICONTATTARE','IN ATTESA PAZIENTE','IN ATTESA STUDIO','APPUNTAMENTO FISSATO','CHIUSA','ANNULLATA'];
export function parseHistoryCsv(text: string) {
  if (text.length > 2_000_000) throw new Error('Il CSV supera 2 MB. Suddividilo in file più piccoli.');
  const result = Papa.parse<Record<string,string>>(text, { header:true, skipEmptyLines:'greedy', dynamicTyping:false });
  if (result.errors.length) throw new Error(`CSV non valido alla riga ${(result.errors[0].row ?? 0)+2}: controlla delimitatori, virgolette e numero di colonne.`);
  const headers = result.meta.fields || [];
  if (headers.some(h=>['__proto__','constructor','prototype'].includes(h))) throw new Error('Intestazione riservata non consentita.');
  if (!headers.length || !result.data.length || result.data.length > 2000) throw new Error('Inserisci intestazioni e da 1 a 2.000 righe per file.');
  if (result.meta.renamedHeaders && Object.keys(result.meta.renamedHeaders).length) throw new Error('Le intestazioni devono essere univoche.');
  const mapping:HistoryMapping = {};
  for (const [key] of historyFields) {
    const aliases:Record<string,string[]> = { id:['lead_id','id_richiesta'], name:['nome','nome_e_cognome','full_name'], phone:['telefono','phone_number'], email:['e-mail'], received_at:['created_at','data_ricezione'], source:['fonte'], status:['stato'] };
    const header = headers.find(h=>[key,...(aliases[key]||[])].includes(h.trim().toLowerCase().replace(/\s+/g,'_')));
    if (header) mapping[key] = header;
  }
  return { headers, records:result.data, mapping };
}
function validDate(value:string) {
  const match=/^(\d{4})-(\d{2})-(\d{2})T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!match || Number(match[2])<1 || Number(match[2])>12 || Number(match[3])<1 || Number(match[3])>new Date(Date.UTC(Number(match[1]),Number(match[2]),0)).getUTCDate()) return false;
  return Number.isFinite(Date.parse(value));
}
export function prepareHistory(records:Record<string,string>[], mapping:HistoryMapping) {
  const rows:HistoryRow[]=[]; const errors:string[]=[]; const ids=new Set<string>();
  for (const [index,record] of records.entries()) {
    const row=Object.fromEntries(historyFields.map(([key])=>[key,(record[mapping[key]||'']||'').trim()])) as HistoryRow;
    row.source ||= 'Pipelean (storico)'; row.status = row.status.toUpperCase() || 'NUOVA';
    const problems:string[]=[];
    if (!row.id || row.id.length>180 || ids.has(row.id)) problems.push('ID mancante, troppo lungo o ripetuto nel file');
    ids.add(row.id);
    if (row.name.length<2 || row.name.length>150) problems.push('nome da 2 a 150 caratteri');
    if (row.phone.length>40 || row.email.length>254 || (!row.email && row.phone.replace(/\D/g,'').length<7) || (row.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email))) problems.push('recapito non valido');
    if (!historicalSources.includes(row.source)) problems.push('fonte non riconosciuta');
    if (!statuses.includes(row.status)) problems.push('stato non riconosciuto');
    if (!validDate(row.received_at) || Date.parse(row.received_at)>Date.now()+300000 || Date.parse(row.received_at)<Date.UTC(2000,0,1)) problems.push('ricezione ISO non valida o futura');
    for (const key of ['first_handled_at','closed_at'] as const) if (row[key] && (!validDate(row[key]) || Date.parse(row[key])<Date.parse(row.received_at) || Date.parse(row[key])>Date.now()+300000)) problems.push(`${key}: data non valida o incoerente`);
    if (problems.length) errors.push(`Riga ${index+2}: ${problems.join('; ')}.`);
    rows.push(row);
  }
  return { rows,errors };
}
export function historyTemplate() {
  return [historyFields.map(([key])=>key), historyFields.map(([key])=>({id:'esempio-001',name:'Contatto sintetico',email:'esempio@example.invalid',received_at:'2025-01-15T10:00:00+01:00',source:'Pipelean (storico)',status:'CHIUSA'}[key] || ''))];
}

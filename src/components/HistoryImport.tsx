import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FileUp, Download, CheckCircle2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { dateTime, downloadCsv } from '@/lib/desk';
import { historyFields, historyTemplate, parseHistoryCsv, prepareHistory, HistoryMapping } from '@/lib/history-import';
import { useSession } from './SessionProvider';

type Parsed = ReturnType<typeof parseHistoryCsv>;
export default function HistoryImport() {
  const {member}=useSession(); const client=useQueryClient();
  const [parsed,setParsed]=useState<Parsed|null>(null); const [mapping,setMapping]=useState<HistoryMapping>({});
  const [namespace,setNamespace]=useState('pipelean'); const [confirmed,setConfirmed]=useState(false);
  const [busy,setBusy]=useState(false); const [progress,setProgress]=useState(0); const [result,setResult]=useState(''); const [error,setError]=useState('');
  const prepared=useMemo(()=>parsed?prepareHistory(parsed.records,mapping):null,[parsed,mapping]);
  const batches=useQuery({queryKey:['history-batches',member?.id],enabled:member?.role==='admin',queryFn:async()=>{const r=await supabase.from('desk_import_batches').select('id,namespace,imported,skipped,created_at').order('created_at',{ascending:false}).limit(15);if(r.error)throw r.error;return r.data;}});
  if(member?.role!=='admin')return null;
  async function openFile(file?:File) {
    if(!file)return;setParsed(null);setConfirmed(false);setResult('');setError('');
    try {if(file.size>2_000_000)throw new Error('Dimensione massima 2 MB.');const next=parseHistoryCsv(await file.text());setParsed(next);setMapping(next.mapping);}catch(e){setError((e as Error).message);}
  }
  async function run() {
    if(!prepared||prepared.errors.length||!confirmed||busy)return;
    setBusy(true);setProgress(0);setError('');setResult('');let imported=0,skipped=0;
    try {
      for(let offset=0;offset<prepared.rows.length;offset+=250){
        const response=await supabase.rpc('desk_import_history',{p_namespace:namespace,p_rows:prepared.rows.slice(offset,offset+250)});
        if(response.error)throw new Error(response.error.message);
        const counts=response.data as {imported:number;skipped:number};imported+=counts.imported;skipped+=counts.skipped;setProgress(Math.min(offset+250,prepared.rows.length));
      }
      setResult(`${imported} richieste importate; ${skipped} già presenti e non modificate.`);setConfirmed(false);toast.success('Importazione storica completata');
    } catch(e) {setError(`${(e as Error).message} Sono state importate ${imported} righe nei lotti già conclusi. Correggi il file e ripeti con lo stesso namespace: gli ID già presenti verranno saltati.`);}
    finally {setBusy(false);await client.invalidateQueries({queryKey:['history-batches']});await client.invalidateQueries({queryKey:['desk']});await client.invalidateQueries({queryKey:['campaign-report']});}
  }
  return <section className="desk-panel"><div className="panel-heading"><div><h3>Import storico CSV</h3><p>Pipelean e altri archivi · solo Admin Studio</p></div><FileUp size={21} className="text-blue-600"/></div><div className="space-y-5 p-5 sm:p-6">
    <p className="text-xs leading-6 text-slate-600">Usa soltanto recapiti e metadati amministrativi, mai note o informazioni cliniche. Il file rimane nel browser: vengono inviate soltanto le colonne mappate. Lo storico non genera escalation retroattive, non assegna richieste e non inventa una prima gestione. Le nuove richieste live restano separate.</p>
    <div className="flex flex-wrap items-center gap-3"><Button variant="outline" className="rounded-xl" onClick={()=>downloadCsv(historyTemplate(),'modello-storico-santorelli.csv')} disabled={busy}><Download size={16}/>Scarica modello</Button><label className="field flex-1">File CSV (virgola o punto e virgola)<Input type="file" accept=".csv,text/csv" disabled={busy} onChange={e=>void openFile(e.target.files?.[0])}/></label></div>
    <label className="field">Namespace archivio<Input value={namespace} maxLength={60} pattern="[a-z0-9][a-z0-9_-]{0,59}" disabled={busy} onChange={e=>{setNamespace(e.target.value);setConfirmed(false);}}/><span className="text-xs font-normal leading-5 text-slate-500">Mantieni lo stesso valore per ogni riesportazione dello stesso archivio. Namespace + ID originale impediscono doppioni; gli elementi esistenti non vengono sovrascritti.</span></label>
    {parsed&&prepared&&<><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{historyFields.map(([key,label,required])=><label key={key} className="field">{label}{required?' *':''}<select className="desk-select" value={mapping[key]||''} disabled={busy} onChange={e=>{setMapping({...mapping,[key]:e.target.value});setConfirmed(false);}}><option value="">{required?'Seleziona colonna…':key==='source'?'Predefinita: Pipelean (storico)':key==='status'?'Predefinito: NUOVA':'Non importare'}</option>{parsed.headers.map(h=><option key={h} value={h}>{h}</option>)}</select></label>)}</div>
    <p className="text-xs leading-6 text-slate-500">Date obbligatoriamente ISO con fuso: 2025-01-15T10:00:00+01:00. Fonti: Facebook Lead Ads, Instagram Lead Ads, Meta Lead Ads, WhatsApp, WordPress, Telefono, Richiesta manuale, Origine non determinata, Pipelean (storico). Gli stati devono corrispondere agli stati del CRM.</p>
    <div className="overflow-x-auto rounded-xl border"><table className="w-full text-left text-xs"><caption className="p-3 text-left font-semibold text-slate-600">Anteprima delle prime 5 righe · {prepared.rows.length} totali</caption><thead className="bg-blue-50"><tr>{['ID','Nome','Ricezione','Fonte','Stato'].map(h=><th key={h} className="p-3">{h}</th>)}</tr></thead><tbody>{prepared.rows.slice(0,5).map((r,i)=><tr key={i} className="border-t">{[r.id,r.name,r.received_at,r.source,r.status].map((v,j)=><td key={j} className="max-w-48 truncate p-3">{v||'—'}</td>)}</tr>)}</tbody></table></div>
    {prepared.errors.length>0?<div role="alert" className="rounded-xl bg-amber-50 p-4 text-xs leading-6 text-amber-900"><strong>{prepared.errors.length} righe da correggere. Nessun invio consentito.</strong><ul>{prepared.errors.slice(0,12).map(e=><li key={e}>{e}</li>)}</ul>{prepared.errors.length>12&&<p>Altri errori nelle righe successive.</p>}</div>:<p className="flex items-center gap-2 text-xs text-emerald-700"><CheckCircle2 size={16}/>Validazione locale superata. Il server ripeterà i controlli.</p>}
    <label className="flex items-start gap-3 text-xs leading-6 text-slate-600"><input type="checkbox" className="mt-1" checked={confirmed} disabled={busy} onChange={e=>setConfirmed(e.target.checked)}/>Confermo di avere verificato mapping, fusi, ID originali e autorizzazione all’importazione. Le colonne selezionate non contengono dati clinici.</label><Button className="rounded-xl" disabled={busy||!confirmed||!!prepared.errors.length||!/^[a-z0-9][a-z0-9_-]{0,59}$/.test(namespace)} onClick={()=>void run()}>{busy?`Importazione ${progress}/${prepared.rows.length}…`:'Conferma importazione'}</Button></>}
    {error&&<p role="alert" className="flex items-start gap-2 rounded-xl bg-red-50 p-4 text-xs leading-6 text-red-800"><AlertTriangle size={17} className="shrink-0"/>{error}</p>}{result&&<p role="status" className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800">{result}</p>}
    <div className="border-t pt-4"><h4 className="text-sm font-semibold">Ultimi lotti importati</h4>{batches.isError?<p className="mt-3 text-xs text-red-700">Registro non disponibile. <button onClick={()=>void batches.refetch()} className="underline">Riprova</button></p>:batches.isPending?<p className="mt-3 text-xs text-slate-500">Caricamento registro…</p>:!batches.data?.length?<p className="mt-3 text-xs text-slate-500">Nessun import storico registrato.</p>:<ul className="mt-3 space-y-2 text-xs text-slate-600">{batches.data.map(b=><li key={b.id}>{dateTime(b.created_at)} · {b.namespace} · {b.imported} importate / {b.skipped} già presenti</li>)}</ul>}</div>
  </div></section>;
}

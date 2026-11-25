import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, FileText, RefreshCw, ShieldCheck, UsersRound } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { romeDay } from '@/lib/desk';
import { reportDate, reportMetrics, reportNotes, StaffReport, validReportRange } from '@/lib/staff-report';
import { useSession } from './SessionProvider';
import { Button } from './ui/button';
import { Input } from './ui/input';

export default function StaffReports() {
  const {member}=useSession();
  const today=romeDay(new Date().toISOString());
  const [from,setFrom]=useState(today.slice(0,8)+'01');
  const [to,setTo]=useState(today);
  const [period,setPeriod]=useState({from:today.slice(0,8)+'01',to:today});
  const [exporting,setExporting]=useState(false);
  const allowed=!!member&&['admin','segretaria'].includes(member.role);
  const admin=member?.role==='admin';
  const {data:report,isPending,isFetching,isError,refetch}=useQuery({
    queryKey:['staff-report',member?.id,period.from,period.to],enabled:allowed,
    queryFn:async()=>{
      const {data,error}=await supabase.rpc('desk_staff_report',{p_from:period.from,p_to:period.to});
      if(error)throw error;
      return data as unknown as StaffReport;
    },
  });
  if(!allowed)return <section className="desk-panel p-6"><ShieldCheck className="mb-3 text-blue-600"/><h3 className="font-semibold">Report riservati ai ruoli operativi</h3><p className="mt-2 text-sm text-slate-600">Il Super Admin tecnico non accede ai report delle richieste dello studio.</p></section>;
  const changed=from!==period.from||to!==period.to;
  const valid=validReportRange(from,to);
  function apply(e:React.FormEvent) {
    e.preventDefault();if(!valid)return;
    if(!changed)void refetch();else setPeriod({from,to});
  }
  async function download() {
    if(!report||changed||isFetching||isError)return;
    setExporting(true);
    try {
      const {downloadStaffReport}=await import('@/lib/staff-report-pdf');
      downloadStaffReport(report);
      toast.success('Report PDF generato');
    } catch {toast.error('Impossibile generare il PDF. Riprova.');}
    finally {setExporting(false);}
  }
  return <div className="space-y-6">
    <section className="desk-panel overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-4 bg-blue-50/70 p-6">
        <div className="flex items-start gap-3"><span className="rounded-2xl bg-blue-100 p-3 text-blue-700"><FileText size={23}/></span><div><h2 className="text-lg font-semibold text-slate-800">{admin?'Report globale dello studio':'Il tuo report personale'}</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">{admin?'Riepilogo dello studio e dettaglio per segretaria. Le attività degli Admin e quelle di sistema restano distinte.':'Solo le azioni registrate da te e le nuove richieste attualmente assegnate a te. Nessun dato delle altre segretarie.'}</p></div></div>
        <Button type="button" onClick={()=>void download()} disabled={!report||isFetching||isError||changed||exporting} className="rounded-xl px-5"><Download size={16}/>{exporting?'Generazione…':'Scarica PDF'}</Button>
      </div>
      <form onSubmit={apply} className="flex flex-col gap-4 p-6 sm:flex-row sm:items-end">
        <label className="field flex-1">Dal<Input type="date" required value={from} onChange={e=>setFrom(e.target.value)} className="h-11 rounded-xl"/></label>
        <label className="field flex-1">Al (incluso)<Input type="date" required value={to} min={from} onChange={e=>setTo(e.target.value)} className="h-11 rounded-xl"/></label>
        <Button type="submit" variant="outline" disabled={!valid||isFetching} className="h-11 rounded-xl border-blue-200 text-blue-700"><RefreshCw size={15} className={isFetching?'animate-spin':''}/>Aggiorna report</Button>
      </form>
      <p className={`px-6 pb-5 text-xs ${!valid?'text-red-700':'text-slate-600'}`}>{!valid?'Scegli date valide in ordine, massimo 366 giorni.':changed?'Date modificate: aggiorna il report prima di scaricare il PDF.':'Date iniziale e finale incluse, fuso Europe/Rome. PDF senza anagrafiche, recapiti o note dei contatti.'}</p>
    </section>
    {isError?<section className="desk-panel p-6" role="alert"><h3 className="font-semibold text-red-700">Report non disponibile</h3><p className="mt-2 text-sm text-slate-600">Non sono stati mostrati dati di esempio. Verifica la connessione e riprova.</p><Button variant="outline" className="mt-4 rounded-xl" onClick={()=>void refetch()}>Riprova</Button></section>:isPending?<section className="desk-panel flex items-center gap-3 p-8 text-sm text-slate-600" role="status"><RefreshCw className="animate-spin" size={18}/>Preparazione del report…</section>:report&&<>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600"><p>Periodo visualizzato: <strong>{reportDate(report.from)} – {reportDate(report.to)}</strong></p><p>Generato il {new Date(report.generated_at).toLocaleString('it-IT',{timeZone:'Europe/Rome'})}</p></div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">{reportMetrics.map(metric=><div className="desk-panel p-5" key={metric.key}><p className="text-xs leading-5 text-slate-600">{metric.label}</p><p className="mt-3 text-2xl font-semibold text-blue-700">{report.totals[metric.key]}</p></div>)}</div>
      <section className="desk-panel"><div className="panel-heading"><div><h3>{admin?'Suddivisione per segretaria / operatore':'Riepilogo personale'}</h3><p>I totali univoci delle richieste possono differire dalla somma degli operatori.</p></div><UsersRound size={21} className="text-blue-600"/></div>
        <div className="overflow-x-auto"><table className="w-full min-w-[840px] text-left text-xs"><caption className="sr-only">Report attività per operatore dal {reportDate(report.from)} al {reportDate(report.to)}</caption><thead className="bg-slate-50 text-slate-600"><tr>{['Operatore','Azioni','Richieste lavorate','Telefonate / tentativi','Richiami','Chiusure','Nuove richieste assegnate'].map(label=><th className="px-5 py-4 font-semibold" scope="col" key={label}>{label}</th>)}</tr></thead><tbody className="divide-y">{report.people.map(person=><tr key={person.id||'system'}><th scope="row" className="px-5 py-4 font-medium text-slate-800">{person.full_name}<span className="mt-1 block text-[10px] font-normal text-slate-500">{person.role==='segretaria'?'Segretaria':person.role==='admin'?'Admin Studio':person.role==='system'?'Sistema':person.role}{!person.active?' · Sospeso':''}</span></th>{[person.actions,person.worked,person.calls,person.callbacks,person.completed,person.received].map((value,index)=><td className="px-5 py-4 tabular-nums" key={index}>{value}</td>)}</tr>)}</tbody></table></div>
        {report.people.length===0&&<p className="p-6 text-sm text-slate-600">Nessun operatore o attività nel periodo.</p>}
      </section>
      <section className="desk-panel p-6"><h3 className="flex items-center gap-2 text-sm font-semibold"><ShieldCheck size={18} className="text-blue-600"/>Come leggere il report</h3><ul className="mt-4 space-y-3 text-xs leading-6 text-slate-600">{reportNotes.map(note=><li key={note}>{note}</li>)}</ul><p className="mt-4 text-xs font-medium text-blue-700">Il PDF include anche il dettaglio giornaliero per operatore.</p></section>
    </>}
  </div>;
}

import { ReactNode, useState } from 'react';
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react';
import { Button } from './ui/button';
import { calendarDays, localDayKey } from '@/lib/schedule-calendar';

export type ScheduleEntry = {
  id: string;
  title: string;
  time: string;
  date?: string;
  weekdays?: number[];
};

export default function ScheduleCalendar({ entries, renderEntry, waiting = false, kind = 'appointments' }: {
  entries: ScheduleEntry[];
  renderEntry: (id: string) => ReactNode;
  waiting?: boolean;
  kind?: 'appointments' | 'tasks';
}) {
  const [month,setMonth]=useState(()=>new Date());
  const [selected,setSelected]=useState(()=>new Date());
  const label=waiting?'preferenze':kind==='tasks'?'attività e richiami':'appuntamenti';
  const dayKey=localDayKey(selected);
  const todayKey=localDayKey(new Date());
  const onDay=(date:Date)=>entries.filter(entry=>entry.date===localDayKey(date)||(!entry.date&&entry.weekdays?.includes((date.getDay()+6)%7+1))).sort((a,b)=>a.time.localeCompare(b.time));
  const selectedEntries=onDay(selected);
  function moveMonth(offset:number) {
    const next=new Date(month.getFullYear(),month.getMonth()+offset,1,12);
    setMonth(next);setSelected(next);
  }
  function today(){const now=new Date();setMonth(now);setSelected(now);}
  return <div className="border-t">
    <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
      <h4 className="text-lg font-semibold capitalize text-slate-800">{month.toLocaleDateString('it-IT',{month:'long',year:'numeric'})}</h4>
      <div className="flex items-center gap-2">
        <Button type="button" variant="outline" size="sm" className="rounded-xl border-blue-100 text-blue-700" onClick={today}>Oggi</Button>
        <Button type="button" variant="outline" size="icon" className="h-9 w-9 rounded-xl" aria-label="Mese precedente" onClick={()=>moveMonth(-1)}><ChevronLeft size={17}/></Button>
        <Button type="button" variant="outline" size="icon" className="h-9 w-9 rounded-xl" aria-label="Mese successivo" onClick={()=>moveMonth(1)}><ChevronRight size={17}/></Button>
      </div>
    </div>
    <p className="px-4 pb-4 text-xs leading-5 text-slate-600 sm:px-6">{waiting?'Preferenze settimanali ricorrenti, non appuntamenti prenotati. Verifica stato, preavviso e idoneità prima di contattare.':kind==='tasks'?'Richiami aperti nel giorno della scadenza, con orari Europe/Rome. Seleziona un giorno per aprire le richieste.':'Orari dello studio: Europe/Rome. Seleziona un giorno per vedere i dettagli e le azioni.'}</p>
    <div className="overflow-x-auto px-3 pb-3 sm:px-5">
      <div className="min-w-[540px]" role="group" aria-label={waiting?'Calendario preferenze lista d’attesa':kind==='tasks'?'Calendario attività e richiami':'Calendario appuntamenti'}>
        <div className="grid grid-cols-7">{['Lun','Mar','Mer','Gio','Ven','Sab','Dom'].map(day=><div key={day} className="py-3 text-center text-xs font-semibold text-slate-500">{day}</div>)}</div>
        <div className="grid grid-cols-7 gap-1">{calendarDays(month).map(date=>{
          const key=localDayKey(date);const items=onDay(date);const chosen=key===dayKey;const current=date.getMonth()===month.getMonth();
          return <button key={key} type="button" aria-pressed={chosen} aria-label={`${date.toLocaleDateString('it-IT',{weekday:'long',day:'numeric',month:'long',year:'numeric'})}: ${items.length} ${label}`} onClick={()=>{setSelected(date);if(!current)setMonth(date);}} className={`min-h-28 min-w-0 rounded-xl border p-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${chosen?'border-blue-500 bg-blue-50':'border-slate-100 hover:border-blue-200 hover:bg-blue-50/50'} ${!current?'bg-slate-50 text-slate-500':'text-slate-800'}`}>
            <span className={`mb-2 inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${key===todayKey?'bg-blue-600 text-white':''}`}>{date.getDate()}</span>
            <span className="block space-y-1">{items.slice(0,2).map(item=><span key={item.id} className={`block truncate rounded-md px-1.5 py-1 text-[10px] leading-4 ${waiting?'bg-teal-100 text-teal-900':'bg-blue-100 text-blue-900'}`} title={`${item.time} · ${item.title}`}>{item.time} · {item.title}</span>)}{items.length>2&&<span className="block px-1 text-[10px] font-medium text-blue-700">+{items.length-2} altri</span>}</span>
          </button>;
        })}</div>
      </div>
    </div>
    <div className="border-t bg-slate-50/70 px-5 py-4"><h4 className="flex items-center gap-2 text-sm font-semibold capitalize text-slate-800"><CalendarDays size={17} className="text-blue-600"/>{selected.toLocaleDateString('it-IT',{weekday:'long',day:'numeric',month:'long',year:'numeric'})}</h4><p className="mt-1 text-xs text-slate-600">{selectedEntries.length} {waiting?'preferenze registrate':label}</p></div>
    <div className="divide-y" aria-live="polite">{selectedEntries.length?selectedEntries.map(entry=><div key={entry.id}>{renderEntry(entry.id)}</div>):<p className="p-6 text-sm text-slate-500">{waiting?'Nessuna preferenza registrata per questo giorno della settimana.':kind==='tasks'?'Nessun richiamo aperto in scadenza nel giorno selezionato.':'Nessun appuntamento per il giorno selezionato.'}</p>}</div>
  </div>;
}

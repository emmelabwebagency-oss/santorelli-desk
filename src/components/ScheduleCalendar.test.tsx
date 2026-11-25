import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import ScheduleCalendar from './ScheduleCalendar';
import { localDayKey } from '@/lib/schedule-calendar';

afterEach(()=>vi.useRealTimers());

describe('Calendario appuntamenti e attesa',()=>{
  it('mostra gli appuntamenti del giorno con i controlli di navigazione',()=>{
    vi.useFakeTimers();vi.setSystemTime(new Date(2030,3,1,12));
    const html=renderToStaticMarkup(<ScheduleCalendar entries={[{id:'demo',date:localDayKey(new Date()),time:'09:30',title:'Contatto sintetico'}]} renderEntry={id=><button>Apri {id}</button>}/>);
    expect(html).toContain('Mese precedente');
    expect(html).toContain('Mese successivo');
    expect(html).toContain('Contatto sintetico');
    expect(html).toContain('Apri demo');
    expect(html).toContain('Europe/Rome');
  });
  it('mostra le preferenze ricorrenti come disponibilità, non prenotazioni',()=>{
    vi.useFakeTimers();vi.setSystemTime(new Date(2030,3,1,12));
    const html=renderToStaticMarkup(<ScheduleCalendar waiting entries={[{id:'monday',weekdays:[1],time:'09:00–12:00',title:'Preferenza sintetica'},{id:'tuesday',weekdays:[2],time:'14:00–18:00',title:'Altra preferenza'}]} renderEntry={id=><span>Dettaglio {id}</span>}/>);
    expect(html).toContain('non appuntamenti prenotati');
    expect(html).toContain('Dettaglio monday');
    expect(html).not.toContain('Dettaglio tuesday');
  });
  it('gestisce il giorno senza eventi',()=>{
    const html=renderToStaticMarkup(<ScheduleCalendar entries={[]} renderEntry={()=>null}/>);
    expect(html).toContain('Nessun appuntamento per il giorno selezionato');
  });
  it('distingue i richiami dagli appuntamenti e mantiene tutti i richiami dello stesso giorno',()=>{
    vi.useFakeTimers();vi.setSystemTime(new Date(2030,3,1,12));
    const html=renderToStaticMarkup(<ScheduleCalendar kind="tasks" entries={[{id:'first',date:localDayKey(new Date()),time:'09:00',title:'Primo richiamo'},{id:'second',date:localDayKey(new Date()),time:'11:00',title:'Secondo richiamo'}]} renderEntry={id=><button>Richiama {id}</button>}/>);
    expect(html).toContain('Calendario attività e richiami');
    expect(html).toContain('Richiama first');
    expect(html).toContain('Richiama second');
    expect(html).not.toContain('Calendario appuntamenti');
  });
  it('mostra il messaggio corretto se non ci sono richiami in scadenza',()=>{
    const html=renderToStaticMarkup(<ScheduleCalendar kind="tasks" entries={[]} renderEntry={()=>null}/>);
    expect(html).toContain('Nessun richiamo aperto in scadenza nel giorno selezionato');
  });
});

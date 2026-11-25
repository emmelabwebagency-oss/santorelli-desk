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
});

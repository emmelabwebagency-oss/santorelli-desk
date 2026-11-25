import { describe, expect, it } from 'vitest';
import { appointmentDayKey, calendarDays, localDayKey } from './schedule-calendar';

describe('Date calendario agenda',()=>{
  it('allinea le settimane da lunedì a domenica senza perdere giorni del mese',()=>{
    const cells=calendarDays(new Date(2026,10,15,12));
    expect(cells[0].getDay()).toBe(1);
    expect(cells[cells.length-1].getDay()).toBe(0);
    expect(cells.length%7).toBe(0);
    expect(cells.filter(day=>day.getMonth()===10)).toHaveLength(30);
    expect(new Set(cells.map(localDayKey)).size).toBe(cells.length);
  });
  it('gestisce febbraio bisestile e il cambio di anno',()=>{
    expect(calendarDays(new Date(2028,1,1,12)).filter(day=>day.getMonth()===1)).toHaveLength(29);
    expect(calendarDays(new Date(2027,0,1,12)).some(day=>day.getFullYear()===2026)).toBe(true);
  });
  it('colloca gli appuntamenti nel giorno italiano, anche oltre la mezzanotte UTC',()=>{
    expect(appointmentDayKey('2026-11-25T23:30:00Z')).toBe('2026-11-26');
    expect(appointmentDayKey('2026-07-01T22:30:00Z')).toBe('2026-07-02');
    expect(appointmentDayKey('2026-03-29T01:30:00Z')).toBe('2026-03-29');
  });
});

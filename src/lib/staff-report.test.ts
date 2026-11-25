import { describe, expect, it } from 'vitest';
import { reportDate, validReportRange } from './staff-report';

describe('Intervalli report PDF',()=>{
  it('accetta un giorno o al massimo 366 giorni inclusi',()=>{
    expect(validReportRange('2026-11-25','2026-11-25')).toBe(true);
    expect(validReportRange('2026-01-01','2027-01-01')).toBe(true);
    expect(validReportRange('2026-01-01','2027-01-02')).toBe(false);
  });
  it('rifiuta date mancanti o invertite',()=>{
    expect(validReportRange('','2026-11-25')).toBe(false);
    expect(validReportRange('2026-11-26','2026-11-25')).toBe(false);
  });
  it('formatta le date senza spostarle nel fuso del browser',()=>{
    expect(reportDate('2026-11-25')).toBe('25/11/2026');
  });
});

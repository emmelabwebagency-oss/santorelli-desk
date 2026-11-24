import { describe, expect, it } from 'vitest';
import { historyTemplate, parseHistoryCsv, prepareHistory } from './history-import';

const base='id;nome;email;data_ricezione\n0001;Contatto sintetico;fixture@example.invalid;2025-01-15T10:00:00+01:00';
describe('Import storico amministrativo',()=>{
  it('riconosce BOM, punto e virgola e alias senza perdere gli zeri degli ID',()=>{
    const parsed=parseHistoryCsv('\uFEFF'+base);
    const prepared=prepareHistory(parsed.records,parsed.mapping);
    expect(prepared.errors).toEqual([]);
    expect(prepared.rows[0].id).toBe('0001');
    expect(prepared.rows[0].source).toBe('Pipelean (storico)');
    expect(prepared.rows[0].first_handled_at).toBe('');
  });
  it('gestisce virgolette, separatori nel nome e righe multilinea senza importare colonne non mappate',()=>{
    const parsed=parseHistoryCsv('id,name,email,received_at,note\nx1,"Contatto, sintetico",fixture@example.invalid,2025-01-15T09:00:00Z,"non importare\nquesta colonna"');
    const prepared=prepareHistory(parsed.records,parsed.mapping);
    expect(prepared.errors).toEqual([]);
    expect(prepared.rows[0].name).toBe('Contatto, sintetico');
    expect(JSON.stringify(prepared.rows)).not.toContain('questa colonna');
    expect(prepared.rows[0]).not.toHaveProperty('note');
  });
  it('rifiuta ID ripetuti prima di qualsiasi invio',()=>{
    const parsed=parseHistoryCsv(base+'\n0001;Altro sintetico;altro@example.invalid;2025-01-15T09:00:00Z');
    expect(prepareHistory(parsed.records,parsed.mapping).errors).toHaveLength(1);
  });
  it('rifiuta date senza fuso e giorni impossibili',()=>{
    for(const date of ['2025-01-15T10:00:00','2025-02-30T10:00:00Z']){
      const parsed=parseHistoryCsv(base.replace('2025-01-15T10:00:00+01:00',date));
      expect(prepareHistory(parsed.records,parsed.mapping).errors.join(' ')).toContain('ricezione ISO');
    }
  });
  it('non inventa una gestione per stati importati e rifiuta la cronologia incoerente',()=>{
    const parsed=parseHistoryCsv(base.replace('data_ricezione','data_ricezione;first_handled_at;status')+';2025-01-14T09:00:00Z;CONTATTATA');
    expect(prepareHistory(parsed.records,parsed.mapping).errors.join(' ')).toContain('first_handled_at');
  });
  it('rifiuta intestazioni duplicate o riservate e CSV strutturalmente non validi',()=>{
    expect(()=>parseHistoryCsv('id,id\na,b')).toThrow('univoche');
    expect(()=>parseHistoryCsv('id,__proto__\na,b')).toThrow('riservata');
    expect(()=>parseHistoryCsv('id,name\na,b,c')).toThrow('CSV non valido');
  });
  it('rifiuta fonti e stati sconosciuti invece di indovinarne il significato',()=>{
    const parsed=parseHistoryCsv(base.replace('data_ricezione','data_ricezione;source;status')+';Social sconosciuto;Prenotato forse');
    const errors=prepareHistory(parsed.records,parsed.mapping).errors.join(' ');
    expect(errors).toContain('fonte non riconosciuta');
    expect(errors).toContain('stato non riconosciuto');
  });
  it('genera un modello coerente con i campi mappabili',()=>{
    const template=historyTemplate();
    expect(template[0].length).toBe(template[1].length);
    expect(template[0]).not.toContain('note');
    expect(template[0]).not.toContain('diagnosi');
  });
});

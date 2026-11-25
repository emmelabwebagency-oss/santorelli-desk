import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StaffReport } from './staff-report';

const captured=vi.hoisted(()=>({filename:'',content:'',pages:0}));
vi.mock('jspdf',async importOriginal=>{
  const actual=await importOriginal<typeof import('jspdf')>();
  return {...actual,jsPDF:function(options?:import('jspdf').jsPDFOptions){
    const doc=new actual.jsPDF(options);
    doc.save=((filename:string)=>{captured.filename=filename;captured.content=doc.output();captured.pages=doc.getNumberOfPages();return doc;}) as typeof doc.save;
    return doc;
  }};
});
import { downloadStaffReport } from './staff-report-pdf';

const metrics={actions:2,worked:1,calls:1,emails:0,whatsapp:0,callbacks:1,completed:0,appointments:0,received:1,open_now:1};
const fixture:StaffReport={from:'2030-04-01',to:'2030-04-30',scope:'personale',generated_at:'2030-05-01T10:00:00Z',totals:metrics,people:[{...metrics,id:'synthetic',full_name:'Segretaria sintetica',role:'segretaria',active:true,days:[{day:'2030-04-01',actions:2,worked:1}]}]};
beforeEach(()=>{captured.filename='';captured.content='';captured.pages=0;});

describe('Generazione PDF effettiva',()=>{
  it('produce un file PDF personale con periodo nel nome',()=>{
    downloadStaffReport(fixture);
    expect(captured.content.startsWith('%PDF-')).toBe(true);
    expect(captured.filename).toBe('santorelli-report-personale-2030-04-01-2030-04-30.pdf');
    expect(captured.content).toContain('Santorelli Desk');
    expect(captured.content).toContain('Segretaria sintetica');
    expect(captured.pages).toBeGreaterThanOrEqual(1);
  });
  it('impagina il report globale con molti operatori senza troncare il documento',()=>{
    const report:StaffReport={...fixture,scope:'studio',people:Array.from({length:12},(_,index)=>({...fixture.people[0],id:String(index),full_name:`Operatore sintetico ${index}`,days:Array.from({length:30},(_,day)=>({day:`2030-04-${String(day+1).padStart(2,'0')}`,actions:2,worked:1}))}))};
    downloadStaffReport(report);
    expect(captured.filename).toContain('report-studio');
    expect(captured.pages).toBeGreaterThan(3);
    expect(captured.content).toContain('Operatore sintetico 11');
    expect(captured.content).toContain('Criteri di lettura');
  });
});

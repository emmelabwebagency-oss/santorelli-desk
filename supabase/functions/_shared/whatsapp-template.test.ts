import { describe, expect, it } from 'vitest';
import { administrativeTemplate } from './whatsapp-template';
const base={id:'12345',name:'avviso_amministrativo',language:'it',status:'APPROVED',category:'UTILITY',components:[{type:'BODY',text:'Contattare la segreteria. STOP per interrompere.'}]};
describe('Modelli WhatsApp amministrativi',()=>{
  it('accetta un modello ufficiale Utility statico senza parametri',async()=>{
    const value=await administrativeTemplate(base);
    expect(value?.name).toBe(base.name);expect(value?.preview).toContain('STOP');expect(value?.fingerprint).toMatch(/^[a-f0-9]{64}$/);
  });
  it('rifiuta marketing, autenticazione e modelli non approvati',async()=>{
    for(const variation of [{category:'MARKETING'},{category:'AUTHENTICATION'},{status:'PAUSED'},{status:'PENDING'}])expect(await administrativeTemplate({...base,...variation})).toBeNull();
  });
  it('rifiuta variabili posizionali o nominali',async()=>{
    for(const text of ['Ciao {{1}}','Ciao {{nome}}'])expect(await administrativeTemplate({...base,components:[{type:'BODY',text}]})).toBeNull();
  });
  it('rifiuta immagini, documenti e pulsanti',async()=>{
    for(const extra of [{type:'HEADER',format:'IMAGE',example:{}},{type:'HEADER',format:'DOCUMENT',text:'Documento'},{type:'BUTTONS',buttons:[]}])expect(await administrativeTemplate({...base,components:[...base.components,extra]})).toBeNull();
  });
  it('include header e footer statici nell’anteprima e nel fingerprint indipendentemente dall’ordine',async()=>{
    const components=[{type:'HEADER',format:'TEXT',text:'Segreteria'},{type:'FOOTER',text:'Rispondere STOP per interrompere.'},...base.components];
    const a=await administrativeTemplate({...base,components});const b=await administrativeTemplate({...base,components:[...components].reverse()});
    expect(a?.preview).toContain('Segreteria');expect(a?.fingerprint).toBe(b?.fingerprint);
  });
  it('cambia fingerprint quando cambia il testo o la lingua',async()=>{
    const a=await administrativeTemplate(base);const b=await administrativeTemplate({...base,components:[{type:'BODY',text:'Testo amministrativo aggiornato'}]});const c=await administrativeTemplate({...base,language:'en_US'});
    expect(a?.fingerprint).not.toBe(b?.fingerprint);expect(a?.fingerprint).not.toBe(c?.fingerprint);
  });
  it('rifiuta body assente, componenti duplicati e input malformati',async()=>{
    for(const value of [null,{},[],{...base,components:[]},{...base,components:[...base.components,...base.components]},{...base,components:[null]}])expect(await administrativeTemplate(value)).toBeNull();
  });
  it('rifiuta identificativi non numerici e testi oltre i limiti',async()=>{
    expect(await administrativeTemplate({...base,id:'../messages'})).toBeNull();expect(await administrativeTemplate({...base,components:[{type:'BODY',text:'x'.repeat(3001)}]})).toBeNull();
  });
});

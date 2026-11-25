import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8';
import { graph, resolveToken } from '../_shared/connector-adapters.ts';
import type { Connection } from '../_shared/connector-adapters.ts';
import { administrativeTemplate } from '../_shared/whatsapp-template.ts';
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type, x-desk-worker','Access-Control-Allow-Methods':'POST, OPTIONS'};
Deno.serve(async(req:Request)=>{
  if(req.method==='OPTIONS')return new Response(null,{headers:cors});
  const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json','Cache-Control':'no-store'}});
  if(req.method!=='POST')return reply({error:'Metodo non consentito'},405);
  const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
  try{
    const input=await req.json().catch(()=>({}));
    if(input.action==='catalog'){
      const jwt=req.headers.get('Authorization')?.replace(/^Bearer\s+/i,'');if(!jwt)return reply({error:'Accesso richiesto'},401);
      const {data:auth,error}=await db.auth.getUser(jwt);if(error||!auth.user)return reply({error:'Sessione non valida'},401);
      const {data:actor}=await db.from('desk_members').select('tenant_id,role').eq('id',auth.user.id).eq('active',true).single();
      if(!actor||!['admin','super_admin'].includes(actor.role))return reply({error:'Accesso riservato ai responsabili'},403);
      if(typeof input.connection_id!=='string'||!/^[a-f0-9-]{36}$/i.test(input.connection_id))return reply({error:'Identificativo non valido'},400);
      const {data:verified,error:connectionError}=await db.from('desk_connections').select('*').eq('id',input.connection_id).eq('tenant_id',actor.tenant_id).eq('kind','whatsapp').eq('enabled',true).not('verified_at','is',null).single();
      if(connectionError||!verified)return reply({error:'Collegamento WhatsApp verificato non disponibile: eseguire prima il test API'},400);
      const connection=verified as Connection;const rows=[];let after:string|undefined;let complete=false;
      for(let page=0;page<20;page++){
        const params:Record<string,string>={fields:'id,name,language,status,category,components',limit:'100'};if(after)params.after=after;
        const result=await graph(db,connection,`${connection.config.business_id}/message_templates`,params);
        if(!Array.isArray(result.data))throw new Error('Catalogo non riconosciuto');
        for(const raw of result.data){const template=await administrativeTemplate(raw);if(template)rows.push(template);}
        if(!result.paging?.next){complete=true;break;}after=result.paging?.cursors?.after;if(typeof after!=='string')break;
      }
      if(!complete)return reply({error:'Catalogo oltre il limite di 2.000 modelli o paginazione non valida: nessuna modifica applicata'},422);
      const {data:count,error:cacheError}=await db.rpc('desk_wa_template_cache',{p_connection:connection.id,p_rows:rows});if(cacheError)throw cacheError;
      console.info('[desk-whatsapp-send] Catalogo amministrativo aggiornato',{count});return reply({count});
    }
    if(input.action!=='process')return reply({error:'Azione non valida'},400);
    const key=req.headers.get('x-desk-worker');if(!key)return reply({error:'Autenticazione del pianificatore richiesta'},401);
    const {data:authorized,error:authError}=await db.rpc('desk_worker_authorize',{p_token:key});if(authError||authorized!==true)return reply({error:'Non autorizzato'},401);
    const {data:rows,error}=await db.rpc('desk_wa_claim');if(error)throw error;
    let accepted=0,failed=0,uncertain=0;
    for(const row of rows||[]){
      let status='failed',provider:string|null=null,message:string|null=null,started=false;
      try{
        const {data:context,error:contextError}=await db.rpc('desk_wa_context',{p_id:row.id,p_lease:row.lease});if(contextError||!context)throw new Error('Autorizzazioni o preferenze cambiate: invio bloccato');
        const c=context.connection as Connection;
        const remote=await graph(db,c,context.template.remote_id,{fields:'id,name,language,status,category,components'});
        const current=await administrativeTemplate(remote);
        if(!current||current.fingerprint!==context.template.fingerprint)throw new Error('Modello modificato, sospeso o non compatibile: serve una nuova approvazione locale');
        const token=await resolveToken(db,c);const secret=Deno.env.get('DESK_WHATSAPP_APP_SECRET');if(!secret)throw new Error('Segreto WhatsApp non configurato');
        const proofKey=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
        const proof=Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',proofKey,new TextEncoder().encode(token)))).map(x=>x.toString(16).padStart(2,'0')).join('');
        const {error:finalCheck}=await db.rpc('desk_wa_context',{p_id:row.id,p_lease:row.lease});if(finalCheck)throw new Error('Autorizzazioni o opt-out cambiati prima dell’invio');
        const url=new URL(`https://graph.facebook.com/${c.config.graph_version}/${c.remote_id}/messages`);url.searchParams.set('appsecret_proof',proof);
        started=true;
        const response=await fetch(url,{method:'POST',signal:AbortSignal.timeout(15000),headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({messaging_product:'whatsapp',to:context.recipient.slice(1),type:'template',template:{name:current.name,language:{code:current.language}}})});
        const result=await response.json().catch(()=>({}));
        if(response.ok&&typeof result.messages?.[0]?.id==='string'&&result.messages[0].id.length<=250){status='accepted';provider=result.messages[0].id;}
        else if(response.status>=400&&response.status<500){status='failed';message=`Provider HTTP ${response.status}: richiesta rifiutata; verificare configurazione e modello`;}
        else{status='uncertain';message='Risposta provider non conclusiva: controllare sul servizio ufficiale prima di qualsiasi nuovo invio';}
      }catch(error){status=started?'uncertain':'failed';message=started?'Esito di rete incerto: nessun reinvio automatico':'Controlli prima dell’invio non superati: verificare autorizzazioni, opt-out, token e modello';console.warn('[desk-whatsapp-send] Invio da verificare',{started,name:error instanceof Error?error.name:'Errore'});}
      const {error:finishError}=await db.rpc('desk_wa_finish',{p_id:row.id,p_lease:row.lease,p_status:status,p_provider:provider,p_error:message});
      if(finishError)console.error('[desk-whatsapp-send] Esito non salvato',{code:finishError.code});
      if(status==='accepted')accepted++;else if(status==='uncertain')uncertain++;else failed++;
    }
    console.info('[desk-whatsapp-send] Ciclo completato',{accepted,failed,uncertain});return reply({accepted,failed,uncertain});
  }catch(error){console.error('[desk-whatsapp-send] Operazione non riuscita',{name:error instanceof Error?error.name:'Errore'});return reply({error:'Operazione WhatsApp non riuscita; nessun reinvio automatico degli esiti incerti'},503);}
});

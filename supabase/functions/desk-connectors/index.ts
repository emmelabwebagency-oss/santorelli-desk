import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8';
import { ConnectorError, importEvent, syncConnection, testConnection } from '../_shared/connector-adapters.ts';
import type { Connection } from '../_shared/connector-adapters.ts';

const cors={ 'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type, x-desk-worker','Access-Control-Allow-Methods':'POST, OPTIONS' };
Deno.serve(async(req:Request)=>{
  if(req.method==='OPTIONS')return new Response(null,{headers:cors});
  const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json'}});
  if(req.method!=='POST')return reply({error:'Metodo non consentito'},405);
  const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
  const secret=req.headers.get('x-desk-worker');
  if(!secret)return reply({error:'Autenticazione del pianificatore richiesta'},401);
  const {data:authorized,error:authError}=await db.rpc('desk_worker_authorize',{p_token:secret});
  if(authError||authorized!==true)return reply({error:'Non autorizzato'},401);
  let jobsDone=0,eventsDone=0,failed=0;
  const failure=async(table:string,row:{id:string;lease:string;attempts:number;connection_id:string},err:unknown)=>{
    const permanent=err instanceof ConnectorError&&err.permanent;
    const message=err instanceof ConnectorError?err.message:'Errore di servizio: nuovo tentativo necessario';
    const terminal=permanent||row.attempts>=8;
    const {error}=await db.from(table).update({status:terminal?'failed':'retry',error:message,locked_until:null,available_at:new Date(Date.now()+Math.min(3600000,60000*2**row.attempts)).toISOString(),...(table==='desk_sync_jobs'&&terminal?{finished_at:new Date().toISOString()}: {})}).eq('id',row.id).eq('lease',row.lease);
    if(error)console.error('[desk-connectors] Stato errore non salvato',{code:error.code});
    await db.from('desk_connections').update({last_error:message}).eq('id',row.connection_id);
    if(terminal)await db.rpc('desk_connector_failure_notice',{p_connection:row.connection_id,p_event:row.id});
    console.warn('[desk-connectors] Operazione da verificare',{table,terminal}); failed++;
  };
  try{
    const {data:jobs,error}=await db.rpc('desk_connector_claim',{p_events:false});if(error)throw error;
    for(const job of jobs||[]){
      try{
        const {data:c,error}=await db.from('desk_connections').select('*').eq('id',job.connection_id).eq('enabled',true).single();if(error||!c)throw new ConnectorError('Connessione sospesa o non disponibile',true);
        const connection=c as Connection;
        await db.from('desk_connections').update({last_attempt_at:new Date().toISOString()}).eq('id',c.id);
        if(job.kind==='test'||!c.verified_at){
          try{await testConnection(db,connection);}catch(e){await db.from('desk_connections').update({verified_at:null}).eq('id',c.id);throw e;}
          const {error}=await db.from('desk_connections').update({verified_at:new Date().toISOString(),last_error:null}).eq('id',c.id);if(error)throw error;
        }
        const result=job.kind==='test'?{continuation:false,records:0}:await syncConnection(db,connection);
        const {error:doneError}=await db.from('desk_sync_jobs').update({status:'done',finished_at:new Date().toISOString(),locked_until:null,error:null}).eq('id',job.id).eq('lease',job.lease);if(doneError)throw doneError;
        const update:Record<string,unknown>={last_error:null};if(job.kind==='sync'&&!result.continuation)update.last_success_at=new Date().toISOString();
        await db.from('desk_connections').update(update).eq('id',c.id);
        if(result.continuation){const {error}=await db.from('desk_sync_jobs').insert({connection_id:c.id,tenant_id:c.tenant_id,kind:'sync'});if(error&&error.code!=='23505')throw error;}
        jobsDone++;
      }catch(e){await failure('desk_sync_jobs',job,e);}
    }
    const {data:events,error:eventError}=await db.rpc('desk_connector_claim',{p_events:true});if(eventError)throw eventError;
    for(const event of events||[]){
      try{
        const {data:c,error}=await db.from('desk_connections').select('*').eq('id',event.connection_id).eq('enabled',true).single();if(error||!c)throw new ConnectorError('Connessione sospesa',true);
        const inquiry=await importEvent(db,c as Connection,event);
        const {error:doneError}=await db.from('desk_external_events').update({status:'processed',payload:{},inquiry_id:inquiry,error:null,locked_until:null}).eq('id',event.id).eq('lease',event.lease);if(doneError)throw doneError;
        await db.from('desk_connections').update({last_success_at:new Date().toISOString(),last_error:null}).eq('id',c.id);
        eventsDone++;
      }catch(e){await failure('desk_external_events',event,e);}
    }
    console.info('[desk-connectors] Ciclo completato',{jobsDone,eventsDone,failed});
    return reply({jobsDone,eventsDone,failed});
  }catch(e){console.error('[desk-connectors] Ciclo interrotto',{name:e instanceof Error?e.name:'Errore'});return reply({error:'Ciclo non riuscito; i lease scaduti verranno recuperati'},503);}
});

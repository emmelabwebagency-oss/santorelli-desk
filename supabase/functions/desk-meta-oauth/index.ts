import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8';

const callback='https://smbiewvuspweetdjbnwe.supabase.co/functions/v1/desk-meta-oauth';
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, GET, OPTIONS'};
const scopes=['pages_show_list','pages_read_engagement','pages_manage_metadata','pages_manage_ads','leads_retrieval','ads_management'];
const digest=async(value:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))).map(x=>x.toString(16).padStart(2,'0')).join('');
async function meta(url:URL,init:RequestInit={}){
  const r=await fetch(url,{...init,signal:AbortSignal.timeout(15000)});const data=await r.json().catch(()=>({}));
  if(!r.ok||data.error)throw new Error('Meta ha rifiutato la richiesta. Verificare app, autorizzazioni e permessi.');return data;
}
Deno.serve(async(req:Request)=>{
  if(req.method==='OPTIONS')return new Response(null,{headers:cors});
  const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json','Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
  if(!['POST','GET'].includes(req.method))return reply({error:'Metodo non consentito'},405);
  let origin:URL;
  try{origin=new URL(Deno.env.get('DESK_APP_ORIGIN')||'');if(origin.protocol!=='https:'||origin.username||origin.password||origin.pathname!=='/'||origin.search||origin.hash)throw new Error();}catch{return reply({error:'Configurare DESK_APP_ORIGIN con l’origine HTTPS pubblica'},503);}
  const appId=Deno.env.get('DESK_META_APP_ID');const secret=Deno.env.get('DESK_META_APP_SECRET');
  if(!appId||!/^\d{1,40}$/.test(appId)||!secret)return reply({error:'Configurare DESK_META_APP_ID e DESK_META_APP_SECRET nei segreti server'},503);
  const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
  const finish=(result:string)=>new Response(null,{status:303,headers:{Location:new URL(`/?meta_oauth=${result}`,origin.origin).href,'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
  try{
    if(req.method==='POST'){
      const jwt=req.headers.get('Authorization')?.replace(/^Bearer\s+/i,'');
      if(!jwt)return reply({error:'Accesso tecnico richiesto'},401);
      const {data:auth,error}=await db.auth.getUser(jwt);if(error||!auth.user)return reply({error:'Sessione non valida'},401);
      const {data:actor}=await db.from('desk_members').select('id,tenant_id').eq('id',auth.user.id).eq('active',true).eq('role','super_admin').single();
      if(!actor)return reply({error:'Accesso riservato al Super Admin'},403);
      const input=await req.json();if(typeof input.connection_id!=='string'||!/^[a-f0-9-]{36}$/i.test(input.connection_id))return reply({error:'Identificativo non valido'},400);
      const {data:c}=await db.from('desk_connections').select('id,config').eq('id',input.connection_id).eq('tenant_id',actor.tenant_id).eq('kind','meta').eq('enabled',true).single();
      if(!c||c.config.app_id!==appId||!/^v\d{1,2}\.0$/.test(c.config.graph_version||''))return reply({error:'Pagina non disponibile o ID app diverso dall’app configurata sul server'},400);
      const state=crypto.randomUUID()+crypto.randomUUID();const {error:save}=await db.rpc('desk_oauth_begin',{p_connection:c.id,p_actor:actor.id,p_hash:await digest(state)});if(save)throw new Error();
      const login=new URL(`https://www.facebook.com/${c.config.graph_version}/dialog/oauth`);
      login.searchParams.set('client_id',appId);login.searchParams.set('redirect_uri',callback);login.searchParams.set('state',state);login.searchParams.set('response_type','code');login.searchParams.set('scope',scopes.join(','));login.searchParams.set('auth_type','rerequest');
      return reply({url:login.href,callback});
    }
    const url=new URL(req.url);const state=url.searchParams.get('state')||'';
    if(!/^[a-f0-9-]{72}$/i.test(state))return finish('invalid');
    const {data:flow,error:flowError}=await db.rpc('desk_oauth_consume',{p_hash:await digest(state)});
    if(flowError||!flow)return finish('expired');
    if(url.searchParams.has('error'))return finish('denied');
    const code=url.searchParams.get('code');if(!code||code.length>4096)return finish('invalid');
    const {data:c,error:cError}=await db.from('desk_connections').select('id,remote_id,config').eq('id',flow.connection_id).eq('enabled',true).single();
    if(cError||!c||c.config.app_id!==appId||!/^v\d{1,2}\.0$/.test(c.config.graph_version||''))return finish('invalid');
    const graph=`https://graph.facebook.com/${c.config.graph_version}/`;
    const exchange=async(params:Record<string,string>)=>meta(new URL('oauth/access_token',graph),{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:appId,client_secret:secret,...params})});
    const short=await exchange({code,redirect_uri:callback});if(typeof short.access_token!=='string')throw new Error();
    const extended=await exchange({grant_type:'fb_exchange_token',fb_exchange_token:short.access_token});if(typeof extended.access_token!=='string')throw new Error();
    const proofKey=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
    const proof=Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',proofKey,new TextEncoder().encode(extended.access_token)))).map(x=>x.toString(16).padStart(2,'0')).join('');
    let after:string|undefined;let pageToken:string|undefined;
    for(let n=0;n<100;n++){
      const pages=new URL('me/accounts',graph);pages.searchParams.set('fields','id,access_token');pages.searchParams.set('limit','100');pages.searchParams.set('appsecret_proof',proof);if(after)pages.searchParams.set('after',after);
      const result=await meta(pages,{headers:{Authorization:`Bearer ${extended.access_token}`}});
      const selected=Array.isArray(result.data)?result.data.find((p:{id:string})=>String(p.id)===c.remote_id):null;
      if(typeof selected?.access_token==='string'){pageToken=selected.access_token;break;}
      if(!result.paging?.next)break;after=result.paging?.cursors?.after;if(typeof after!=='string')break;
    }
    if(!pageToken)return finish('permissions');
    const debugUrl=new URL('debug_token',graph);debugUrl.searchParams.set('input_token',pageToken);
    const debug=await meta(debugUrl,{headers:{Authorization:`Bearer ${appId}|${secret}`}});const details=debug.data;
    if(!details?.is_valid||String(details.app_id)!==appId||!scopes.every(scope=>Array.isArray(details.scopes)&&details.scopes.includes(scope)))return finish('permissions');
    const expiry=(value:unknown)=>typeof value==='number'&&value>0?new Date(value*1000).toISOString():null;
    const {error:stored}=await db.rpc('desk_oauth_store',{p_connection:c.id,p_actor:flow.actor_id,p_config_hash:flow.config_hash,p_token:pageToken,p_expires:expiry(details.expires_at),p_data_expires:expiry(details.data_access_expires_at)});if(stored)throw new Error();
    console.info('[desk-meta-oauth] Autorizzazione pagina conservata nel Vault');
    return finish('ok');
  }catch(error){console.warn('[desk-meta-oauth] Autorizzazione non completata',{name:error instanceof Error?error.name:'Errore'});return req.method==='GET'?finish('failed'):reply({error:'Impossibile iniziare l’autorizzazione. Verificare la configurazione server.'},503);}
});

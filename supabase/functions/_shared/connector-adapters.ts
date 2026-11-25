import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8';

type DB = ReturnType<typeof createClient>;
export type Connection = { id: string; tenant_id: string; kind: 'meta'|'whatsapp'|'alfadocs'; remote_id: string; config: { graph_version?: string; app_id?: string; business_id?: string; archive_id?: string; form_ids?: string[] }; verified_at: string|null; sync_form_index: number };
export class ConnectorError extends Error { constructor(message: string, public permanent = false) { super(message); } }
export function credentialName(c: Connection) { return `DESK_${c.kind.toUpperCase()}_TOKEN_${c.id.replace(/-/g, '').toUpperCase()}`; }
function token(c: Connection) { const value = Deno.env.get(credentialName(c)); if (!value) throw new ConnectorError(`Configurare il segreto server ${credentialName(c)}`, true); return value; }
async function graph(c: Connection, path: string, fields: Record<string,string> = {}) {
  if (!/^v\d{1,2}\.0$/.test(c.config.graph_version || '') || !/^[0-9]+(?:\/[a-z_]+)?$/.test(path)) throw new ConnectorError('Identificativi o versione Graph non validi', true);
  const url = new URL(`https://graph.facebook.com/${c.config.graph_version}/${path}`);
  for (const [key,value] of Object.entries(fields)) url.searchParams.set(key,value);
  const accessToken = token(c);
  const appSecret = Deno.env.get(`DESK_${c.kind.toUpperCase()}_APP_SECRET`);
  if (!appSecret) throw new ConnectorError('Configurare il segreto server dell’app Meta prima del test API', true);
  const proofKey = await crypto.subtle.importKey('raw', new TextEncoder().encode(appSecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const proof = new Uint8Array(await crypto.subtle.sign('HMAC', proofKey, new TextEncoder().encode(accessToken)));
  url.searchParams.set('appsecret_proof', Array.from(proof).map(x=>x.toString(16).padStart(2,'0')).join(''));
  const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new ConnectorError(`Graph API HTTP ${response.status}: verificare permessi, autorizzazione e limiti`, [400,401,403,404].includes(response.status));
  const data = await response.json();
  if (data.error) throw new ConnectorError('Graph API ha rifiutato la richiesta: verificare permessi e configurazione', true);
  return data;
}
async function alfa(c: Connection, path: string) {
  const response = await fetch(`https://app.alfadocs.com/api/v1/${path}`, { headers: { 'X-Api-Key': token(c), Accept: 'application/json' }, signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new ConnectorError(`AlfaDocs HTTP ${response.status}: verificare autorizzazione e limiti`, [400,401,403,404].includes(response.status));
  const data = await response.json();
  if (data.error || data.status && data.status !== 'success') throw new ConnectorError('AlfaDocs ha rifiutato la richiesta', true);
  return data;
}
export async function testConnection(c: Connection) {
  if (c.kind === 'meta') {
    const page = await graph(c,c.remote_id,{fields:'id,name'});
    if (String(page.id) !== c.remote_id) throw new ConnectorError('Pagina Meta non corrispondente',true);
    const forms = await graph(c,`${c.remote_id}/leadgen_forms`,{fields:'id,name',limit:'100'});
    if (!(c.config.form_ids || []).every(id=>(forms.data || []).some((f:{id:string})=>String(f.id)===id))) throw new ConnectorError('Uno o più moduli non risultano accessibili nella pagina (verifica elenco moduli e permessi)',true);
    const apps = await graph(c,`${c.remote_id}/subscribed_apps`,{fields:'id,subscribed_fields'});
    if (!(apps.data || []).some((app:{id:string;subscribed_fields?:string[]})=>String(app.id)===c.config.app_id && app.subscribed_fields?.includes('leadgen'))) throw new ConnectorError('App non sottoscritta agli eventi leadgen della pagina. Configurare la sottoscrizione ufficiale.',true);
  } else if (c.kind === 'whatsapp') {
    const number = await graph(c,c.remote_id,{fields:'id,display_phone_number'});
    if (String(number.id) !== c.remote_id) throw new ConnectorError('Numero WhatsApp non corrispondente',true);
    const apps = await graph(c,`${c.config.business_id}/subscribed_apps`);
    if (!(apps.data || []).some((app:{id?:string;whatsapp_business_api_data?:{id:string}})=>String(app.whatsapp_business_api_data?.id || app.id)===c.config.app_id)) throw new ConnectorError('App non sottoscritta all’account WhatsApp Business',true);
  } else {
    const result = await alfa(c,'me');
    if (String(result.data?.practiceId) !== c.remote_id || String(result.data?.archiveId) !== c.config.archive_id) throw new ConnectorError('Studio o archivio AlfaDocs non corrispondente alla chiave',true);
  }
}
export async function syncConnection(db: DB,c: Connection):Promise<{continuation:boolean;records:number}> {
  if (c.kind === 'whatsapp') return {continuation:false,records:0};
  if (c.kind === 'alfadocs') {
    const start = new Date(Date.now()-86400000).toISOString().slice(0,10);
    const end = new Date(Date.now()+27*86400000).toISOString().slice(0,10);
    const response = await alfa(c,`practices/${c.remote_id}/archives/${c.config.archive_id}/appointments?dateStart=${start}&dateEnd=${end}`);
    if (!Array.isArray(response.data)) throw new ConnectorError('Formato appuntamenti AlfaDocs non riconosciuto',true);
    const rows = response.data.map((r:{id:number|string;date:string;state:string;duration:number;emailReminder?:boolean;smsReminder?:boolean})=>({id:String(r.id),date:r.date,state:r.state,duration:r.duration,source_reminders:r.emailReminder===true||r.smsReminder===true}));
    const {data,error}=await db.rpc('desk_alfadocs_import',{p_connection:c.id,p_rows:rows}); if(error)throw new ConnectorError('Importazione appuntamenti non riuscita: verificare formato e timezone',true);
    return {continuation:false,records:Number(data)};
  }
  const forms=c.config.form_ids || []; const index=c.sync_form_index % Math.max(1,forms.length); const form=forms[index];
  if(!form)throw new ConnectorError('Nessun modulo Meta configurato',true);
  const {data:cursor,error:cursorError}=await db.from('desk_sync_cursors').select('after_cursor').eq('connection_id',c.id).eq('form_id',form).maybeSingle();
  if(cursorError)throw new ConnectorError('Checkpoint Meta non disponibile');
  const query:Record<string,string>={fields:'id',limit:'50'}; if(cursor?.after_cursor)query.after=cursor.after_cursor;
  const result=await graph(c,`${form}/leads`,query);
  if(!Array.isArray(result.data))throw new ConnectorError('Formato elenco Meta non riconosciuto',true);
  for(const lead of result.data){if(!/^\d{1,40}$/.test(String(lead.id)))continue;const {error}=await db.from('desk_external_events').upsert({connection_id:c.id,tenant_id:c.tenant_id,external_id:String(lead.id),payload:{lead_id:String(lead.id),form_id:form}},{onConflict:'connection_id,external_id',ignoreDuplicates:true});if(error)throw new ConnectorError('Accodamento lead non riuscito');}
  const next=result.paging?.next && typeof result.paging?.cursors?.after==='string' ? result.paging.cursors.after : null;
  const {error:checkpointError}=await db.from('desk_sync_cursors').upsert({connection_id:c.id,form_id:form,after_cursor:next},{onConflict:'connection_id,form_id'});if(checkpointError)throw new ConnectorError('Salvataggio checkpoint Meta non riuscito');
  const nextIndex=next?index:(index+1)%forms.length;
  const {error}=await db.from('desk_connections').update({sync_form_index:nextIndex}).eq('id',c.id);if(error)throw new ConnectorError('Avanzamento moduli non salvato');
  return {continuation:!!next||nextIndex!==0,records:result.data.length};
}
export async function importEvent(db: DB,c: Connection,event:{external_id:string;payload:Record<string,unknown>}):Promise<string> {
  let payload=event.payload;
  if(c.kind==='meta'){
    const lead=await graph(c,event.external_id,{fields:'id,created_time,field_data,form_id,ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,platform'});
    if(!(c.config.form_ids || []).includes(String(lead.form_id)))throw new ConnectorError('Modulo del lead non autorizzato',true);
    const fields:Record<string,string>={};
    for(const f of lead.field_data || []){if(['full_name','first_name','last_name','email','phone_number'].includes(f.name)&&Array.isArray(f.values))fields[f.name]=String(f.values[0]||'');}
    const name=(fields.full_name || `${fields.first_name||''} ${fields.last_name||''}`).trim().slice(0,150);
    if(name.length<2)throw new ConnectorError('Lead senza nome amministrativo utilizzabile: verificare mapping del modulo',true);
    payload={name,phone:(fields.phone_number||'').slice(0,40),email:(fields.email||'').slice(0,254),received_at:lead.created_time,platform:lead.platform,attribution:{original_source:lead.platform==='ig'?'Instagram Lead Ads':lead.platform==='fb'?'Facebook Lead Ads':'Meta Lead Ads',page_id:c.remote_id,form_id:String(lead.form_id),ad_id:lead.ad_id,ad_name:lead.ad_name,adset_id:lead.adset_id,adset_name:lead.adset_name,campaign_id:lead.campaign_id,campaign_name:lead.campaign_name}};
  }
  const {data,error}=await db.rpc('desk_external_import',{p_connection:c.id,p_external:event.external_id,p_data:payload});
  if(error)throw new ConnectorError('Importazione amministrativa non riuscita: verificare recapiti e formato',true);
  return data as string;
}

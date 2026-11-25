import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8';

const cors = { 'Access-Control-Allow-Origin':'*', 'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods':'POST, OPTIONS' };
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null,{headers:cors});
  const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json','Cache-Control':'no-store'}});
  if(req.method!=='POST')return reply({error:'Metodo non consentito'},405);
  try {
    const raw=await req.text();
    if(new TextEncoder().encode(raw).length>2048)return reply({error:'Richiesta non valida'},400);
    let input;
    try{input=JSON.parse(raw);}catch{return reply({error:'Richiesta non valida'},400);}
    const email=typeof input?.email==='string'?input.email.trim().toLowerCase():'';
    if(email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return reply({error:'Indirizzo email non valido'},400);
    const allowed=(Deno.env.get('DESK_AUTH_ALLOWED_ORIGINS')||'').split(',').concat(Deno.env.get('DESK_APP_ORIGIN')||'').map(v=>v.trim()).filter(Boolean);
    const origin=req.headers.get('Origin');
    if(!allowed.length)return reply({error:'Accesso email non ancora configurato. Contatta il responsabile tecnico.'},503);
    if(!origin||!allowed.includes(origin))return reply({error:'Origine dell’app non autorizzata'},403);
    let callback:URL;
    try{
      const base=new URL(origin);
      if(base.origin!==origin||base.username||base.password||!(base.protocol==='https:'||(base.protocol==='http:'&&['localhost','127.0.0.1'].includes(base.hostname))))throw new Error('Origin');
      callback=new URL('/auth/callback',base);
    }catch{return reply({error:'Origine dell’app non valida'},400);}
    const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
    const {data:allowedUser,error}=await db.rpc('desk_login_request',{p_email:email});
    if(error){console.error('[desk-login] Verifica autorizzazione non disponibile',{code:error.code});return reply({error:'Accesso temporaneamente non disponibile. Riprova più tardi.'},503);}
    if(allowedUser===true){
      const auth=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_ANON_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
      const {error:sendError}=await auth.auth.signInWithOtp({email,options:{shouldCreateUser:false,emailRedirectTo:callback.href}});
      if(sendError)console.warn('[desk-login] Richiesta OTP non accettata dal provider',{code:sendError.code||'provider_error'});
    }
    return reply({message:'Se l’indirizzo è autorizzato, riceverai un codice monouso via email. Controlla anche la posta indesiderata.'});
  }catch{
    console.error('[desk-login] Richiesta accesso non riuscita');
    return reply({error:'Accesso temporaneamente non disponibile. Riprova più tardi.'},503);
  }
});

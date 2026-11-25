import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8';
import { deskOrigin, sendAuthEmail } from '../_shared/auth-email.ts';

const cors = { 'Access-Control-Allow-Origin':'*', 'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods':'POST, OPTIONS' };
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null,{headers:cors});
  const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json','Cache-Control':'no-store'}});
  if(req.method!=='POST')return reply({error:'Metodo non consentito'},405);
  try {
    if(Number(req.headers.get('content-length'))>2048)return reply({error:'Richiesta troppo grande'},413);
    const raw=await req.text();
    if(new TextEncoder().encode(raw).length>2048)return reply({error:'Richiesta non valida'},400);
    let input;
    try{input=JSON.parse(raw);}catch{return reply({error:'Richiesta non valida'},400);}
    const email=typeof input?.email==='string'?input.email.trim().toLowerCase():'';
    if(email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return reply({error:'Indirizzo email non valido'},400);
    const allowed=(Deno.env.get('DESK_AUTH_ALLOWED_ORIGINS')||'').split(',').concat(deskOrigin).map(v=>v.trim()).filter(Boolean);
    const origin=req.headers.get('Origin');
    if(!Deno.env.get('RESEND_API_KEY'))return reply({error:'Servizio email non configurato'},503);
    if(!origin||!allowed.includes(origin))return reply({error:'Origine dell’app non autorizzata'},403);
    let callback:URL;
    try{
      const base=new URL(origin);
      const local=base.hostname==='localhost'||base.hostname==='127.0.0.1'||base.hostname.endsWith('.localhost');
      if(base.origin!==origin||base.username||base.password||!(base.protocol==='https:'||(base.protocol==='http:'&&local)))throw new Error('Origin');
      callback=new URL('/auth/callback',base);
    }catch{return reply({error:'Origine dell’app non valida'},400);}
    const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
    const {data:allowedUser,error}=await db.rpc('desk_login_request',{p_email:email});
    if(error){console.error('[desk-login] Verifica autorizzazione non disponibile',{code:error.code});return reply({error:'Accesso temporaneamente non disponibile. Riprova più tardi.'},503);}
    if(allowedUser===true){
      try {
        const {data:link,error:linkError}=await db.auth.admin.generateLink({type:'magiclink',email,options:{redirectTo:callback.href}});
        if(linkError||!link.user||!link.properties?.email_otp)throw new Error('Generazione codice non riuscita');
        const {data:profile,error:profileError}=await db.from('desk_members').select('id,active').eq('id',link.user.id).maybeSingle();
        if(profileError)throw new Error('Verifica profilo non riuscita');
        if(!profile){
          const {error:bootstrapError}=await db.rpc('desk_bootstrap_member',{p_user:link.user.id});
          if(bootstrapError)throw new Error('Abilitazione iniziale non riuscita');
          console.info('[desk-login] Primo Super Admin abilitato');
        }else if(!profile.active)throw new Error('Profilo non attivo');
        const code=link.properties.email_otp;
        if(!/^\d{6,10}$/.test(code))throw new Error('Formato codice non supportato');
        await sendAuthEmail('desk-login',email,'Il tuo codice di accesso a Santorelli Desk',`Il tuo codice di accesso è: ${code}\n\nInseriscilo nella pagina di accesso a Santorelli Desk. Il codice è personale, monouso e ha validità limitata. Non condividerlo.\n\nSe non hai richiesto l’accesso, ignora questa email.`);
      } catch {
        // La risposta resta identica anche se l’indirizzo non è autorizzato.
        console.error('[desk-login] Generazione o consegna codice non riuscita');
      }
    }
    return reply({message:'Se l’indirizzo è autorizzato, riceverai un codice monouso via email. Controlla anche la posta indesiderata.'});
  }catch{
    console.error('[desk-login] Richiesta accesso non riuscita');
    return reply({error:'Accesso temporaneamente non disponibile. Riprova più tardi.'},503);
  }
});

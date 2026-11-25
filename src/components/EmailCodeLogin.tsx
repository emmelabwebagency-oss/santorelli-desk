import { useEffect, useState } from 'react';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { ArrowRight, Mail, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';

export default function EmailCodeLogin() {
  const [email,setEmail]=useState('');
  const [sentTo,setSentTo]=useState('');
  const [code,setCode]=useState('');
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const [error,setError]=useState('');
  const [retryAt,setRetryAt]=useState(0);
  const [now,setNow]=useState(Date.now());
  const remaining=Math.max(0,Math.ceil((retryAt-now)/1000));
  useEffect(()=>{if(!retryAt)return;const timer=window.setInterval(()=>setNow(Date.now()),1000);return()=>window.clearInterval(timer);},[retryAt]);

  async function requestCode(e?:React.FormEvent) {
    e?.preventDefault(); if(busy||remaining)return;
    const normalized=(sentTo||email).trim().toLowerCase();
    setBusy(true);setError('');setMessage('');
    try {
      const result=await supabase.functions.invoke('desk-login',{body:{email:normalized}});
      if(result.error){
        if(result.error instanceof FunctionsHttpError){
          const body=await result.error.context.json().catch(()=>null);
          if(typeof body?.error==='string')throw new Error(body.error);
        }
        throw new Error('Impossibile richiedere il codice. Verifica la connessione e riprova.');
      }
      setSentTo(normalized);setCode('');setNow(Date.now());setRetryAt(Date.now()+60000);
      setMessage('Se l’indirizzo è autorizzato, riceverai un codice monouso. Controlla anche la posta indesiderata.');
    }catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  async function verify(e:React.FormEvent) {
    e.preventDefault();if(busy||!/^\d{6}$/.test(code))return;
    setBusy(true);setError('');
    try {
      const {error}=await supabase.auth.verifyOtp({email:sentTo,token:code,type:'email'});
      if(error)throw new Error(/rate|too many/i.test(error.message)?'Troppi tentativi. Attendi prima di riprovare.':'Codice non valido o scaduto. Verifica le cifre oppure richiedi un nuovo codice.');
    }catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  return <div className="space-y-5">{!sentTo?<form onSubmit={requestCode} className="space-y-5"><label className="field">Email autorizzata<Input autoFocus type="email" autoComplete="email" required maxLength={254} value={email} disabled={busy} onChange={e=>setEmail(e.target.value)} className="h-12 rounded-xl" placeholder="nome@studio.it"/></label><Button disabled={busy} className="h-12 w-full rounded-xl">{busy?'Richiesta in corso…':'Ricevi il codice via email'}<Mail size={17}/></Button><p className="text-xs leading-6 text-slate-500">Nessuna registrazione pubblica. L’indirizzo deve essere stato abilitato dal responsabile dello studio.</p></form>:<><div className="rounded-2xl border border-blue-100 bg-blue-50 p-4"><p className="text-xs text-blue-800">Indirizzo inserito</p><p className="mt-1 break-all text-sm font-semibold text-blue-900">{sentTo}</p></div><form onSubmit={verify} className="space-y-5"><label className="field">Codice ricevuto via email<Input autoFocus type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" minLength={6} maxLength={6} required value={code} disabled={busy} onChange={e=>setCode(e.target.value.replace(/\D/g,''))} className="h-14 rounded-xl text-center text-2xl tracking-[.35em]" placeholder="000000"/><span className="text-xs font-normal text-slate-500">Inserisci le 6 cifre, senza condividere il codice.</span></label><Button disabled={busy||!/^\d{6}$/.test(code)} className="h-12 w-full rounded-xl">{busy?'Verifica in corso…':'Verifica e accedi'}<ArrowRight size={17}/></Button></form><div className="flex flex-wrap items-center justify-between gap-3"><button type="button" disabled={busy||remaining>0} onClick={()=>void requestCode()} className="inline-flex items-center gap-2 text-xs font-semibold text-blue-700 disabled:text-slate-500"><RefreshCw size={14}/>{remaining?`Richiedi di nuovo tra ${remaining}s`:'Invia un nuovo codice'}</button><button type="button" disabled={busy} onClick={()=>{setSentTo('');setCode('');setMessage('');setError('');setRetryAt(0);}} className="text-xs text-slate-600 underline">Cambia email</button></div></>}{message&&<p role="status" className="text-xs leading-6 text-slate-600">{message}</p>}{error&&<p role="alert" className="rounded-xl bg-red-50 p-4 text-sm leading-6 text-red-800">{error}</p>}</div>;
}

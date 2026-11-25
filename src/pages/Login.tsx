import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, ShieldCheck, MailCheck, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { useSession } from '@/components/SessionProvider';
import { authMessage } from '@/lib/desk';
import BrandLogo from '@/components/BrandLogo';
import EmailCodeLogin from '@/components/EmailCodeLogin';

export default function Login({ reset = false }: { reset?: boolean }) {
  const { session, member, recovery, loading, error:sessionError } = useSession();
  const [password,setPassword]=useState('');
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const navigate=useNavigate();
  const recovering=reset||recovery;
  const denied=!!session&&!loading&&!member&&!recovering;
  if(session&&member&&!recovering&&!loading)return <Navigate to="/" replace/>;
  async function updatePassword(e:React.FormEvent){
    e.preventDefault();setBusy(true);setMessage('');
    try{
      const {error}=await supabase.auth.updateUser({password});
      if(error)throw error;
      const {error:outError}=await supabase.auth.signOut();if(outError)throw outError;
      navigate('/accesso',{replace:true});
    }catch(e){setMessage(authMessage((e as Error).message));}finally{setBusy(false);}
  }
  async function exit(){setBusy(true);setMessage('');const {error}=await supabase.auth.signOut();if(error)setMessage('Uscita non riuscita. Riprova.');setBusy(false);}
  return <div className="grid min-h-screen bg-white lg:grid-cols-2">
    <section className="relative hidden flex-col justify-between bg-[#edf3fc] p-14 lg:flex">
      <Link to="/"><BrandLogo className="w-64"/></Link>
      <div><div className="mb-8"><img src="/assets/reception-santorelli.png" alt="Reception stilizzata con agenda e documenti amministrativi" className="mx-auto w-full max-w-sm rounded-3xl object-contain"/></div><h1 className="brand text-5xl leading-tight text-slate-800">Ogni richiesta conta.<br/>Nessuna va dimenticata.</h1><p className="mt-5 max-w-md leading-7 text-slate-600">Uno spazio di lavoro ordinato per la segreteria. Una visione chiara per lo studio.</p></div>
      <p className="text-xs text-slate-500">Una piattaforma EmmeLab · Santorelli & Partners</p>
    </section>
    <section className="flex flex-col justify-center px-6 py-12 sm:px-16"><div className="mx-auto w-full max-w-sm"><div className="mb-8 lg:hidden"><BrandLogo/></div><div className="mb-6 flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600"><MailCheck size={24}/></div><h2 className="brand text-3xl">{recovering?'Imposta la password':denied?'Accesso non autorizzato':'Accedi allo studio'}</h2><p className="mb-8 mt-3 text-sm leading-6 text-slate-500">{recovering?'Questa schermata conserva il recupero dei precedenti inviti. Per gli accessi ordinari usa il codice email.':denied?'Il tuo account non dispone di un profilo attivo nello studio. Contatta il responsabile per l’abilitazione.':'Inserisci la tua email autorizzata. Riceverai un codice monouso: non serve una password.'}</p>
    {loading?<div role="status" className="flex items-center gap-3 rounded-xl bg-blue-50 p-5 text-sm text-blue-800"><RefreshCw size={18} className="animate-spin"/>Verifica dell’accesso…</div>:recovering?<form onSubmit={updatePassword} className="space-y-4"><label className="field">Nuova password<Input className="h-12 rounded-xl" type="password" autoComplete="new-password" minLength={12} required value={password} onChange={e=>setPassword(e.target.value)}/></label><Button className="h-12 w-full rounded-xl" disabled={busy||!session}>{busy?'Salvataggio…':'Salva password'}<ArrowRight size={16}/></Button>{!session&&<p className="text-sm text-amber-800">Apri il link di recupero ricevuto via email, oppure accedi con un nuovo codice.</p>}<Link to="/accesso" onClick={()=>{if(recovery)void exit();}} className="inline-flex items-center gap-2 text-sm text-blue-700"><ArrowLeft size={15}/>Torna all’accesso con codice</Link></form>:denied?<div className="space-y-4">{sessionError&&<p role="alert" className="text-sm text-red-700">{sessionError}</p>}<Button onClick={()=>void exit()} disabled={busy} variant="outline" className="h-12 w-full rounded-xl">Esci e usa un’altra email</Button></div>:<EmailCodeLogin/>}
    {message&&<p role="alert" className="mt-4 text-sm leading-6 text-red-700">{message}</p>}
    <div className="mt-10 flex items-start gap-3 border-t pt-6 text-xs leading-5 text-slate-500"><ShieldCheck size={17} className="shrink-0 text-blue-600"/>Solo indirizzi abilitati dal responsabile. Il codice è personale e monouso: non condividerlo. Nessuna registrazione pubblica.</div></div></section>
  </div>;
}

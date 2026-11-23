import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { Auth } from '@supabase/auth-ui-react';
import { ThemeSupa } from '@supabase/auth-ui-shared';
import { ArrowLeft, ArrowRight, ShieldCheck, CalendarCheck2, LockKeyhole } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { useSession } from '@/components/SessionProvider';
import { authMessage } from '@/lib/desk';

export default function Login({ reset = false }: { reset?: boolean }) {
  const { session, recovery, loading } = useSession();
  const [forgot, setForgot] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const navigate = useNavigate();
  const recovering = reset || recovery;
  if (session && !recovering && !loading) return <Navigate to="/" replace />;
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setMessage('');
    if (recovering) {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) setMessage(authMessage(error.message));
      else { await supabase.auth.signOut(); navigate('/accesso', { replace: true }); }
    } else {
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: new URL('/reset-password', window.location.origin).href });
      setMessage(error ? authMessage(error.message) : 'Se l’indirizzo è associato a un account, riceverai un link per impostare la password.');
    }
    setBusy(false);
  }
  return <div className="grid min-h-screen bg-white lg:grid-cols-2">
    <section className="relative hidden flex-col justify-between bg-[#edf3fc] p-14 lg:flex">
      <Link to="/" className="brand text-3xl">santorelli<span className="text-blue-600">.</span><span className="ml-3 font-sans text-xs uppercase tracking-[.22em] text-slate-500">Desk</span></Link>
      <div><div className="mb-8"><img src="/assets/reception-santorelli.png" alt="Reception stilizzata con agenda e documenti amministrativi" className="mx-auto w-full max-w-sm rounded-3xl object-contain"/></div><h1 className="brand text-5xl leading-tight text-slate-800">Ogni richiesta conta.<br/>Nessuna va dimenticata.</h1><p className="mt-5 max-w-md leading-7 text-slate-600">Uno spazio di lavoro ordinato per la segreteria. Una visione chiara per lo studio.</p></div>
      <p className="text-xs text-slate-500">Una piattaforma EmmeLab · Santorelli & Partners</p>
    </section>
    <section className="flex flex-col justify-center px-6 py-12 sm:px-16"><div className="mx-auto w-full max-w-sm"><Link to="/" className="mb-12 inline-flex items-center gap-2 text-sm text-slate-500"><ArrowLeft size={16}/> Torna alla panoramica</Link><div className="mb-6 flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600"><LockKeyhole size={24}/></div><h2 className="brand text-3xl">{recovering ? 'Imposta la password' : forgot ? 'Recupera l’accesso' : 'Bentornata in studio'}</h2><p className="mb-8 mt-3 text-sm leading-6 text-slate-500">{recovering ? 'Scegli una password di almeno 12 caratteri.' : 'Accedi con il tuo account personale. Gli accessi sono riservati al personale autorizzato.'}</p>
    {forgot || recovering ? <form onSubmit={submit} className="space-y-4"><label className="block text-sm">{recovering ? 'Nuova password' : 'Indirizzo email'}<Input className="mt-2 h-12 rounded-xl" type={recovering ? 'password' : 'email'} value={recovering ? password : email} minLength={recovering ? 12 : undefined} required onChange={e => recovering ? setPassword(e.target.value) : setEmail(e.target.value)} /></label><Button className="h-12 w-full rounded-xl" disabled={busy || (recovering && !session)}>{busy ? 'Operazione in corso…' : recovering ? 'Salva password' : 'Invia link di recupero'}<ArrowRight size={16}/></Button>{recovering && !session && <p className="text-sm text-amber-700">Apri il link ricevuto via email per impostare la password.</p>}{message && <p role="status" className="text-sm leading-6 text-slate-600">{message}</p>}<button type="button" onClick={() => { setForgot(false); setMessage(''); if (recovering) navigate('/accesso'); }} className="text-sm text-blue-600">Torna all’accesso</button></form> : <><Auth supabaseClient={supabase} view="sign_in" showLinks={false} providers={[]} redirectTo={new URL('/auth/callback', window.location.origin).href} theme="light" appearance={{ theme: ThemeSupa, variables: { default: { colors: { brand: '#2563eb', brandAccent: '#1d4ed8' }, radii: { borderRadiusButton: '12px', inputBorderRadius: '12px' }, space: { inputPadding: '13px', buttonPadding: '13px' } } } }} localization={{ variables: { sign_in: { email_label: 'Indirizzo email', password_label: 'Password', email_input_placeholder: 'nome@studio.it', password_input_placeholder: 'La tua password', button_label: 'Accedi allo studio', loading_button_label: 'Accesso in corso…', social_provider_text: 'Accedi con {{provider}}', link_text: 'Hai già un account?' } } }}/><button onClick={() => setForgot(true)} className="mt-4 text-sm text-blue-600">Hai dimenticato la password?</button></>}
    <div className="mt-10 flex items-start gap-3 border-t pt-6 text-xs leading-5 text-slate-500"><ShieldCheck size={17} className="shrink-0 text-blue-500"/>I dati sono riservati. Non condividere le tue credenziali e non inserire informazioni cliniche nel CRM.</div></div></section>
  </div>;
}

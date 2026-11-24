import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useSession } from './SessionProvider';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { dateTime } from '@/lib/desk';

type Prompt={show:boolean;last_sync:string|null;pending:number};
export default function SyncReminder({onSync}:{onSync:()=>void}){
  const {member}=useSession();const [prompt,setPrompt]=useState<Prompt|null>(null);const [busy,setBusy]=useState(false);const latest=useRef(Date.now());const open=useRef(false);
  useEffect(()=>{
    if(!member)return;
    let alive=true; const interact=()=>{latest.current=Date.now();};
    for(const event of ['pointerdown','keydown','pointermove','scroll'])window.addEventListener(event,interact,{passive:true});
    const timer=window.setInterval(async()=>{
      if(document.visibilityState!=='visible'||!document.hasFocus()||Date.now()-latest.current>60000||open.current)return;
      const element=document.activeElement;const editing=element instanceof HTMLElement&&(element.matches('input,textarea,select,[contenteditable="true"]')||!!document.querySelector('[role="dialog"]'));
      const {data,error}=await supabase.rpc('desk_sync_prompt',{p_action:'tick',p_allow_prompt:!editing});
      if(alive&&!error&&data?.show){open.current=true;setPrompt(data);}
    },30000);
    return ()=>{alive=false;window.clearInterval(timer);for(const event of ['pointerdown','keydown','pointermove','scroll'])window.removeEventListener(event,interact);};
  },[member?.id]);
  async function finish(sync:boolean){if(busy)return;setBusy(true);try{
    if(sync){const {error}=await supabase.rpc('desk_connector_enqueue',{p_id:null,p_test:false});if(error)throw error;toast.success('Verifica accodata sul server');}
    const {error}=await supabase.rpc('desk_sync_prompt',{p_action:sync?'sync':'snooze',p_allow_prompt:false});if(error)throw error;open.current=false;setPrompt(null);if(sync)onSync();
  }catch{toast.error('Impossibile salvare il promemoria. Riprova.');}finally{setBusy(false);}}
  return <Dialog open={!!prompt&&!!member} onOpenChange={v=>!v&&finish(false)}><DialogContent className="rounded-2xl"><DialogHeader><div className="mb-3 w-fit rounded-xl bg-blue-50 p-3 text-blue-600"><RefreshCw size={24}/></div><DialogTitle className="text-lg leading-7">È IL MOMENTO DI SINCRONIZZARE LE NUOVE RICHIESTE</DialogTitle><DialogDescription>Verifica che tutti i nuovi contatti siano stati importati correttamente.</DialogDescription></DialogHeader><div className="rounded-xl bg-slate-50 p-4 text-xs leading-7 text-slate-600">Ultima sincronizzazione registrata: {prompt?.last_sync?dateTime(prompt.last_sync):'nessuna'}<br/>Eventi in coda: {prompt?.pending??0}</div><p className="text-xs leading-6 text-slate-500">È solo un promemoria operativo: webhook e job automatici lavorano indipendentemente da questa finestra.</p><div className="flex flex-col gap-2 sm:flex-row"><Button disabled={busy} className="rounded-xl" onClick={()=>finish(true)}>SINCRONIZZA ORA</Button><Button disabled={busy} variant="outline" className="rounded-xl" onClick={()=>finish(false)}>RICORDAMELO PIÙ TARDI</Button></div></DialogContent></Dialog>;
}
export function SyncReminderSettings(){
  const {member}=useSession();const [busy,setBusy]=useState(false);
  const {data,refetch}=useQuery({queryKey:['popup-settings',member?.tenant_id],enabled:member?.role==='super_admin',queryFn:async()=>{const {data,error}=await supabase.from('desk_tenants').select('popup_enabled,popup_interval_minutes').single();if(error)throw error;return data;}});
  if(member?.role!=='super_admin')return null;
  async function save(e:React.FormEvent<HTMLFormElement>){e.preventDefault();const f=new FormData(e.currentTarget);setBusy(true);try{const {error}=await supabase.rpc('desk_popup_config',{p_enabled:f.get('enabled')==='on',p_minutes:Number(f.get('minutes'))});if(error)throw error;toast.success('Promemoria aggiornato');await refetch();}catch(e){toast.error((e as Error).message);}finally{setBusy(false);}}
  return <section className="desk-panel p-6"><h3 className="text-sm font-semibold">Promemoria di sincronizzazione</h3>{data?<form onSubmit={save} key={`${data.popup_enabled}-${data.popup_interval_minutes}`} className="mt-5 space-y-4"><label className="flex items-center gap-2 text-xs"><input type="checkbox" name="enabled" defaultChecked={data.popup_enabled}/>Attiva popup durante l’utilizzo dell’app</label><label className="field max-w-xs">Intervallo in minuti (180 = 3 ore)<Input name="minutes" type="number" min={5} max={1440} defaultValue={data.popup_interval_minutes} required/></label><p className="text-xs leading-6 text-slate-500">Conteggia solo l’uso attivo e coordina le schede tramite il server. Non interrompe i moduli aperti. Il rinvio dura 30 minuti e viene salvato per utente.</p><Button disabled={busy} className="rounded-xl">Salva promemoria</Button></form>:<p className="mt-3 text-xs text-slate-500">Caricamento configurazione…</p>}</section>;
}

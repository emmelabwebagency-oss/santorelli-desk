import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { Member } from '@/lib/desk';
import { toast } from 'sonner';

export default function InviteMember({ member }: { member: Member }) {
  const [open,setOpen]=useState(false); const [busy,setBusy]=useState(false);
  const queryClient=useQueryClient();
  if(!['admin','super_admin'].includes(member.role)) return null;
  async function submit(e:React.FormEvent<HTMLFormElement>){
    e.preventDefault(); const form=new FormData(e.currentTarget);setBusy(true);
    try {
      const {data,error}=await supabase.functions.invoke('desk-admin',{body:{action:'invite',name:form.get('name'),email:form.get('email'),role:form.get('role')}});
      if(error || data?.error) {toast.error(data?.error || 'Invito non riuscito. Verifica con EmmeLab i segreti della funzione e la configurazione email.');return;}
      toast.success('Invito inviato. Account abilitato.');setOpen(false);queryClient.invalidateQueries({queryKey:['desk']});
    } catch { toast.error('Servizio inviti non raggiungibile. Riprova più tardi.'); }
    finally {setBusy(false);}
  }
  return <div className="border-t p-6">{!open ? <Button variant="outline" className="rounded-xl" onClick={()=>setOpen(true)}><UserPlus size={16}/>Invita una persona</Button> : <form onSubmit={submit} className="space-y-4"><h4 className="text-sm font-semibold">Nuovo accesso individuale</h4><div className="grid gap-4 sm:grid-cols-2"><label className="field">Nome e cognome<Input name="name" required minLength={2} maxLength={150}/></label><label className="field">Email di lavoro<Input name="email" type="email" required maxLength={254}/></label></div><label className="field">Ruolo<select name="role" className="desk-select"><option value="segretaria">Segretaria</option>{member.role==='super_admin' && <><option value="admin">Admin Studio</option><option value="super_admin">Super Admin</option></>}</select></label><p className="text-xs leading-6 text-slate-500">Il servizio richiede l’origine pubblica HTTPS configurata da EmmeLab. L’invito usa le email di Supabase Auth, separate dai promemoria operativi.</p><div className="flex gap-2"><Button disabled={busy} className="rounded-xl">{busy ? 'Invio in corso…' : 'Invia invito'}</Button><Button type="button" variant="ghost" onClick={()=>setOpen(false)}>Annulla</Button></div></form>}</div>;
}

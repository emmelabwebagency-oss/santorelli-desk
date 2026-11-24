import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Building2, Save, ShieldCheck, UserRound } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Member, Site } from '@/lib/desk';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

export default function PracticeManagement({ member, members, sites }: { member:Member; members:Member[]; sites:Site[] }) {
  const [edit,setEdit]=useState<{kind:'site'|'member_name'|'member_active';id:string;name:string;active?:boolean}|null>(null);
  const [name,setName]=useState('');const [busy,setBusy]=useState(false);const query=useQueryClient();
  if(!['admin','super_admin'].includes(member.role)) return null;
  async function save(e:React.FormEvent){
    e.preventDefault();if(!edit)return;setBusy(true);
    const {error}=await supabase.rpc('desk_manage',{p_action:edit.kind,p_data:{id:edit.id,name,active:!edit.active}});
    setBusy(false);if(error){toast.error(error.message);return;}
    toast.success('Modifica salvata e registrata nella cronologia tecnica');setEdit(null);query.invalidateQueries({queryKey:['desk']});
  }
  function open(item:NonNullable<typeof edit>){setEdit(item);setName(item.name);}
  return <><section className="desk-panel"><div className="panel-heading"><div><h3>Sedi dello studio</h3><p>Denominazioni effettive, senza modificare i riferimenti delle richieste.</p></div><Building2 size={20} className="text-blue-500"/></div><div className="divide-y">{sites.map(s=><div key={s.id} className="flex items-center justify-between gap-3 px-6 py-4"><span className="text-sm">{s.name}</span><Button variant="outline" className="rounded-lg text-xs" onClick={()=>open({kind:'site',id:s.id,name:s.name})}>Rinomina</Button></div>)}</div></section>
  <section className="desk-panel"><div className="panel-heading"><div><h3>Gestione personale</h3><p>La sospensione blocca subito le operazioni sui dati, senza cancellare la cronologia.</p></div><ShieldCheck size={20} className="text-blue-500"/></div><div className="divide-y">{members.map(m=>{const allowed=m.id!==member.id && m.role!=='super_admin' && (member.role==='super_admin'||m.role==='segretaria');return <div key={m.id} className="flex flex-wrap items-center justify-between gap-3 px-6 py-4"><div><p className="text-sm font-medium">{m.full_name}</p><p className="mt-1 text-xs text-slate-500">{m.role==='admin'?'Admin Studio':m.role==='super_admin'?'Super Admin EmmeLab':'Segretaria'} · {m.active?'Attivo':'Sospeso'}</p></div>{allowed && <div className="flex gap-2"><Button variant="outline" className="rounded-lg text-xs" onClick={()=>open({kind:'member_name',id:m.id,name:m.full_name})}>Modifica nome</Button><Button variant="outline" className={`rounded-lg text-xs ${m.active?'text-red-700':'text-blue-600'}`} onClick={()=>open({kind:'member_active',id:m.id,name:m.full_name,active:m.active})}>{m.active?'Sospendi':'Riattiva'}</Button></div>}</div>})}</div></section>
  <Dialog open={!!edit} onOpenChange={v=>!v&&setEdit(null)}><DialogContent className="rounded-2xl"><DialogHeader><DialogTitle>{edit?.kind==='member_active' ? edit.active?'Sospendi accesso':'Riattiva accesso' : 'Modifica denominazione'}</DialogTitle><DialogDescription>{edit?.kind==='member_active' ? `${edit.name}. Le richieste assegnate rimarranno conservate. Un Admin potrà riassegnarle.` : 'La modifica viene salvata nel database e registrata nell’audit tecnico.'}</DialogDescription></DialogHeader><form className="space-y-5" onSubmit={save}>{edit?.kind!=='member_active' && <label className="field">Nome<Input value={name} onChange={e=>setName(e.target.value)} required minLength={2} maxLength={edit?.kind==='site'?100:150}/></label>}<div className="flex justify-end gap-2"><Button type="button" variant="outline" className="rounded-xl" onClick={()=>setEdit(null)}>Annulla</Button><Button className="rounded-xl" disabled={busy}>{busy?'Salvataggio…':'Conferma'}</Button></div></form></DialogContent></Dialog></>;
}

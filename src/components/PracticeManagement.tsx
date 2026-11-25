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
  const [edit,setEdit]=useState<{kind:'site'|'member_name'|'member_active'|'member_access';id:string;name:string;active?:boolean;role?:Member['role']}|null>(null);
  const [name,setName]=useState('');const [busy,setBusy]=useState(false);const query=useQueryClient();
  const [role,setRole]=useState<Member['role']>('segretaria');
  const [active,setActive]=useState(true);
  if(!['admin','super_admin'].includes(member.role)) return null;
  async function save(e:React.FormEvent){
    e.preventDefault();if(!edit)return;setBusy(true);
    try {
      const {error}=edit.kind==='member_access'
        ? await supabase.rpc('desk_update_member',{p_id:edit.id,p_role:role,p_active:active})
        : await supabase.rpc('desk_manage',{p_action:edit.kind,p_data:{id:edit.id,name,active:!edit.active}});
      if(error){toast.error(error.message);return;}
      toast.success('Modifica salvata e registrata nella cronologia tecnica');setEdit(null);
      await query.invalidateQueries({queryKey:['desk']});
      if(edit.id===member.id && edit.kind==='member_access') window.location.reload();
    } catch {toast.error('Salvataggio non riuscito. Riprova.');}
    finally {setBusy(false);}
  }
  function open(item:NonNullable<typeof edit>){setEdit(item);setName(item.name);setRole(item.role||'segretaria');setActive(item.active??true);}
  return <><section className="desk-panel"><div className="panel-heading"><div><h3>Sedi dello studio</h3><p>Denominazioni effettive, senza modificare i riferimenti delle richieste.</p></div><Building2 size={20} className="text-blue-500"/></div><div className="divide-y">{sites.map(s=><div key={s.id} className="flex items-center justify-between gap-3 px-6 py-4"><span className="text-sm">{s.name}</span><Button variant="outline" className="rounded-lg text-xs" onClick={()=>open({kind:'site',id:s.id,name:s.name})}>Rinomina</Button></div>)}</div></section>
  <section className="desk-panel"><div className="panel-heading"><div><h3>Gestione personale</h3><p>Ruoli e accessi dello studio. Deve restare almeno un Super Admin attivo.</p></div><ShieldCheck size={20} className="text-blue-500"/></div><div className="divide-y">{members.map(m=>{const allowed=m.id!==member.id && m.role!=='super_admin' && (member.role==='super_admin'||m.role==='segretaria');return <div key={m.id} className="flex flex-wrap items-center justify-between gap-3 px-6 py-4"><div><p className="text-sm font-medium">{m.full_name}{m.id===member.id?' (tu)':''}</p><p className="mt-1 text-xs text-slate-500">{m.role==='admin'?'Admin Studio':m.role==='super_admin'?'Super Admin EmmeLab':'Segretaria'} · {m.active?'Attivo':'Sospeso'}</p></div><div className="flex flex-wrap gap-2">{allowed && <Button variant="outline" className="rounded-lg text-xs" onClick={()=>open({kind:'member_name',id:m.id,name:m.full_name})}>Modifica nome</Button>}{member.role==='super_admin' ? <Button variant="outline" className="rounded-lg text-xs text-blue-700" onClick={()=>open({kind:'member_access',id:m.id,name:m.full_name,role:m.role,active:m.active})}>Ruolo e accesso</Button> : allowed && <Button variant="outline" className={`rounded-lg text-xs ${m.active?'text-red-700':'text-blue-600'}`} onClick={()=>open({kind:'member_active',id:m.id,name:m.full_name,active:m.active})}>{m.active?'Sospendi':'Riattiva'}</Button>}</div></div>})}</div></section>
  <Dialog open={!!edit} onOpenChange={v=>!busy&&!v&&setEdit(null)}><DialogContent className="rounded-2xl"><DialogHeader><DialogTitle>{edit?.kind==='member_access' ? 'Ruolo e accesso' : edit?.kind==='member_active' ? edit.active?'Sospendi accesso':'Riattiva accesso' : 'Modifica denominazione'}</DialogTitle><DialogDescription>{edit?.kind==='member_access' ? `${edit.name}. La modifica è immediata. Non puoi disabilitare o declassare l’ultimo Super Admin attivo.` : edit?.kind==='member_active' ? `${edit.name}. Le richieste assegnate rimarranno conservate. Un Admin potrà riassegnarle.` : 'La modifica viene salvata nel database e registrata nell’audit tecnico.'}</DialogDescription></DialogHeader><form className="space-y-5" onSubmit={save}>{edit?.kind==='member_access' ? <><label className="field">Ruolo<select className="desk-select" value={role} onChange={e=>setRole(e.target.value as Member['role'])} disabled={busy}><option value="segretaria">Segretaria</option><option value="admin">Admin Studio</option><option value="super_admin">Super Admin</option></select></label><label className="field">Stato<select className="desk-select" value={active?'active':'suspended'} onChange={e=>setActive(e.target.value==='active')} disabled={busy}><option value="active">Attivo</option><option value="suspended">Sospeso</option></select></label><p className="text-xs leading-6 text-slate-600">Il ruolo Super Admin non concede accesso generale ai dati dei pazienti. Sospendere conserva la cronologia.</p></> : edit?.kind!=='member_active' && <label className="field">Nome<Input value={name} onChange={e=>setName(e.target.value)} required minLength={2} maxLength={edit?.kind==='site'?100:150}/></label>}<div className="flex justify-end gap-2"><Button type="button" variant="outline" className="rounded-xl" disabled={busy} onClick={()=>setEdit(null)}>Annulla</Button><Button className="rounded-xl" disabled={busy}>{busy?'Salvataggio…':'Conferma'}</Button></div></form></DialogContent></Dialog></>;
}

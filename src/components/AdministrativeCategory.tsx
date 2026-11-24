import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useSession } from './SessionProvider';
export const administrativeCategories=['Da classificare','Nuovo contatto','Informazioni amministrative','Richiamo','Appuntamenti','Documenti amministrativi','Altro'];
export default function AdministrativeCategory({id,assignedTo,value,onSaved}:{id:string;assignedTo:string|null;value:string;onSaved:()=>void}){
  const {member}=useSession();const [category,setCategory]=useState(value);const [busy,setBusy]=useState(false);
  useEffect(()=>setCategory(value),[value,id]);
  if(!member||!(member.role==='admin'||(member.role==='segretaria'&&assignedTo===member.id)))return <p className="text-xs text-slate-500">Categoria: {value}. La classificazione è disponibile dopo la presa in carico.</p>;
  async function save(){setBusy(true);try{const r=await supabase.rpc('desk_category_set',{p_inquiry:id,p_category:category});if(r.error)throw r.error;toast.success('Categoria aggiornata, senza registrare una prima gestione');onSaved();}catch(e){toast.error((e as Error).message);}finally{setBusy(false);}}
  return <div className="rounded-xl border bg-slate-50 p-4"><div className="flex flex-wrap items-end gap-3"><label className="field min-w-48 flex-1">Categoria amministrativa<select className="desk-select" disabled={busy} value={category} onChange={e=>setCategory(e.target.value)}>{administrativeCategories.map(c=><option key={c}>{c}</option>)}</select></label><Button className="rounded-xl" variant="outline" disabled={busy||category===value} onClick={()=>void save()}>Salva categoria</Button></div><p className="mt-2 text-xs leading-5 text-slate-500">Valida anche per WhatsApp. Non include diagnosi, contenuti dei messaggi o classificazioni cliniche.</p></div>;
}

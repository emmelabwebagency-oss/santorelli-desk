import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { dateTime } from '@/lib/desk';
import { useSession } from './SessionProvider';
import { Button } from './ui/button';

type Provider = 'meta' | 'alfadocs' | 'whatsapp' | 'wordpress';
type Connection = { id: string; provider: Provider; label: string | null; last_success_at: string | null; running: boolean };
const providers: Record<Provider, { name: string; description: string }> = {
  meta: { name: 'Meta Lead Ads', description: 'Recupera i nuovi lead accessibili dalle API.' },
  alfadocs: { name: 'AlfaDocs', description: 'Aggiorna i riferimenti degli appuntamenti nel periodo supportato.' },
  whatsapp: { name: 'WhatsApp', description: 'Verifica il collegamento e gli eventi ricevuti. Non recupera lo storico dei messaggi.' },
  wordpress: { name: 'WordPress', description: 'Richiede “Scarica nuovi” al plugin. Per rileggere lo storico usa “Scarica tutto” nel pannello WordPress.' },
};

export default function SyncControls() {
  const { member } = useSession();
  const client = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const allowed = !!member && ['segretaria', 'admin', 'super_admin'].includes(member.role);
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ['sync-controls', member?.id], enabled: allowed, refetchInterval: 10000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('desk_sync_controls_status');
      if (error) throw error;
      return data as Connection[];
    },
  });
  if (!allowed) return null;

  async function sync(connection?: Connection) {
    setBusy(connection ? connection.provider + connection.id : 'all');
    try {
      const { data, error } = await supabase.rpc('desk_sync_controls_request', { p_id: connection?.id ?? null, p_provider: connection?.provider ?? null });
      if (error) throw error;
      const result = data as { queued: number; already_running: number; connected: number };
      if (!result.connected) toast.info('Nessun collegamento attivo e verificato disponibile.');
      else if (!result.queued) toast.info('Le sincronizzazioni richieste sono già in coda o in corso.');
      else toast.success(`${result.queued} sincronizzazioni accodate${result.already_running ? ` · ${result.already_running} già in corso` : ''}. L’importazione non è ancora completata.`);
      await Promise.all([
        refetch(),
        client.invalidateQueries({ queryKey: ['external-connections', member?.id] }),
        client.invalidateQueries({ queryKey: ['wordpress-imports', member?.id] }),
      ]);
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return <section className="desk-panel overflow-hidden">
    <div className="flex flex-col gap-4 border-b border-blue-100 bg-blue-50/60 p-5 sm:flex-row sm:items-center sm:justify-between">
      <div><h3 className="text-sm font-semibold text-slate-800">Sincronizza i collegamenti</h3><p className="mt-1 max-w-xl text-xs leading-5 text-slate-600">Tutti insieme oppure uno alla volta. Qui compaiono solo i collegamenti attivi e verificati del tuo studio.</p></div>
      <Button onClick={() => sync()} disabled={!!busy || isPending || isError || !data?.length || data.every(c => c.running)} className="shrink-0 self-start rounded-xl sm:self-auto"><RefreshCw size={15} className={busy === 'all' ? 'animate-spin' : ''}/>Sincronizza tutto</Button>
    </div>
    {isError ? <p role="alert" className="p-5 text-xs text-red-700">Impossibile leggere i collegamenti. <button className="underline" onClick={() => refetch()}>Riprova</button></p> : isPending ? <p className="p-5 text-xs text-slate-600">Verifica dei collegamenti disponibili…</p> : !data?.length ? <p className="p-5 text-xs leading-5 text-slate-600">Nessun collegamento pronto per la sincronizzazione. I collegamenti non configurati, sospesi o ancora da verificare non sono inclusi.</p> : <div className="grid gap-3 p-5 md:grid-cols-2">{data.map(connection => {
      const provider = providers[connection.provider];
      return <div key={connection.provider + connection.id} className="flex flex-col rounded-xl border border-slate-200 p-4">
        <div className="flex items-center justify-between gap-2"><h4 className="text-sm font-semibold text-slate-800">{provider.name}</h4><span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700"><CheckCircle2 size={13}/>Collegato</span></div>
        <p className="mt-1 break-all text-[11px] text-slate-500">{connection.label || `Collegamento ${connection.id.slice(0, 8)}`}</p>
        <p className="mt-3 flex-1 text-xs leading-5 text-slate-600">{provider.description}</p>
        <p className="mt-3 text-[11px] text-slate-500">{connection.running ? 'Operazione già in coda o in corso' : connection.last_success_at ? `Ultimo ciclo riuscito: ${dateTime(connection.last_success_at)}` : 'Nessun ciclo completato registrato'}</p>
        <Button variant="outline" className="mt-3 self-start rounded-lg border-blue-200 text-xs text-blue-700 hover:bg-blue-50" disabled={!!busy || connection.running} onClick={() => sync(connection)}><RefreshCw size={14} className={busy === connection.provider + connection.id ? 'animate-spin' : ''}/>Sincronizza {provider.name}</Button>
      </div>;
    })}</div>}
  </section>;
}

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { dateTime } from '@/lib/desk';
import { useSession } from './SessionProvider';
import { Button } from './ui/button';

type ImportJob = {
  id: string;
  mode: 'all' | 'new';
  source: 'manual' | 'hourly';
  status: 'pending' | 'running' | 'completed' | 'failed';
  queued: number;
  skipped: number;
  message: string | null;
  updated_at: string;
};
type ImportConnection = {
  id: string;
  site_url: string;
  enabled: boolean;
  verified_at: string | null;
  plugin_version: string | null;
  last_poll_at: string | null;
  import_cursor: number;
  job: ImportJob | null;
};
const labels = { pending: 'In attesa del sito', running: 'Lettura in corso', completed: 'Lettura completata', failed: 'Importazione interrotta' };

export default function WordPressImports() {
  const { member } = useSession();
  const [busy, setBusy] = useState<string | null>(null);
  const allowed = !!member && ['admin', 'super_admin', 'segretaria'].includes(member.role);
  const { data, isError, isPending, refetch } = useQuery({
    queryKey: ['wordpress-imports', member?.id],
    enabled: allowed,
    refetchInterval: 10000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('desk_wp_import_status');
      if (error) throw error;
      return data as ImportConnection[];
    },
  });
  if (!allowed) return null;

  async function request(connection: ImportConnection, mode: 'all' | 'new') {
    if (mode === 'all' && !window.confirm('Leggere tutti gli invii Elementor salvati dei moduli mappati? Gli invii già acquisiti con il plugin 1.1.0 non saranno duplicati. Gli invii acquisiti con versioni precedenti richiedono un controllo prima di recuperare lo storico.')) return;
    setBusy(connection.id);
    try {
      const { error } = await supabase.rpc('desk_wp_import_request', { p_connection: connection.id, p_mode: mode });
      if (error) throw error;
      toast.success('Richiesta registrata. WordPress la riceverà al prossimo ciclo del cron.');
      await refetch();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return <div className="space-y-3 rounded-2xl border border-blue-100 bg-blue-50/40 p-4">
    <div><h4 className="text-sm font-semibold text-slate-800">Scarica contatti da WordPress</h4><p className="mt-1 text-xs leading-5 text-slate-600">Importa in Desk gli invii salvati da Elementor, solo per i moduli mappati. Non è un download di file.</p></div>
    <div className="rounded-xl border border-blue-100 bg-white p-3 text-xs leading-5 text-slate-700"><p className="font-semibold text-blue-700">Importazione automatica ogni ora</p><p>Il server richiede “Scarica nuovi” all’inizio di ogni ora, anche con Desk chiuso, per i collegamenti attivi, verificati e aggiornati. Se una lettura è già in corso non ne avvia un’altra. WordPress deve avere il cron funzionante per eseguire la richiesta.</p></div>
    {isError ? <p role="alert" className="text-xs text-red-700">Stato importazioni non disponibile. <button className="underline" onClick={() => refetch()}>Riprova</button></p> : isPending ? <p className="text-xs text-slate-600">Caricamento collegamenti…</p> : !data?.length ? <p className="text-xs text-slate-600">{member?.role === 'segretaria' ? 'Nessun collegamento WordPress disponibile. Chiedi all’amministratore di configurarlo.' : 'Predisponi e verifica una connessione WordPress per importare gli invii.'}</p> : data.map(connection => {
      const active = connection.job && ['pending', 'running'].includes(connection.job.status);
      const ready = connection.enabled && !!connection.verified_at && !!connection.last_poll_at && connection.plugin_version === '1.1.0';
      const stale = !connection.last_poll_at || Date.now() - new Date(connection.last_poll_at).getTime() > 5 * 60 * 1000;
      return <div key={connection.id} className="space-y-3 rounded-xl border border-blue-100 bg-white p-4">
        <p className="break-all text-xs font-semibold text-slate-800">{connection.site_url}</p>
        <div className="flex flex-wrap gap-2">
          <Button className="rounded-xl" disabled={!ready || !!active || !!busy} onClick={() => request(connection, 'all')}><Download size={15}/>Scarica tutto</Button>
          <Button variant="outline" className="rounded-xl border-blue-200 text-blue-700 hover:bg-blue-50" disabled={!ready || !!active || !!busy} onClick={() => request(connection, 'new')}><RefreshCw size={15} className={busy === connection.id ? 'animate-spin' : ''}/>Scarica nuovi</Button>
        </div>
        {!ready && <p className="text-xs leading-5 text-amber-800">{!connection.enabled ? 'Connessione sospesa.' : !connection.verified_at ? 'La verifica del collegamento dal sito deve essere completata dall’amministratore.' : member?.role === 'segretaria' ? 'Chiedi all’amministratore di verificare il plugin WordPress 1.1.0 e il primo controllo del cron.' : 'Verifica che il plugin WordPress sia aggiornato allo ZIP 1.1.0 e attendi il primo ciclo del cron.'}</p>}
        <p className="text-[11px] leading-5 text-slate-600">Tutto: rilegge lo storico disponibile. Nuovi: legge gli invii successivi all’ultimo punto di importazione, manuale o oraria; al primo avvio legge lo storico disponibile. Gli ID già acquisiti dal nuovo plugin non generano altre richieste.</p>
        {connection.last_poll_at && <p className="text-[11px] text-slate-500">Ultimo controllo dal sito: {dateTime(connection.last_poll_at)}</p>}
        {ready && stale && <p className="text-xs leading-5 text-amber-800">Il sito non controlla le richieste da oltre 5 minuti. Verifica WP-Cron nell’hosting: senza esecuzione del cron il download resta in attesa.</p>}
        {connection.job && <div role="status" aria-live="polite" className={`rounded-lg p-3 text-xs leading-5 ${connection.job.status === 'failed' ? 'bg-red-50 text-red-800' : 'bg-slate-50 text-slate-700'}`}>
          <p className="font-semibold">{connection.job.source === 'hourly' ? 'Automatica oraria' : 'Manuale'} · {connection.job.mode === 'all' ? 'Storico completo' : 'Solo nuovi'} · {labels[connection.job.status]}</p>
          <p>{connection.job.queued} invii accodati o già presenti · {connection.job.skipped} esclusi (modulo non mappato o dati non validi)</p>
          {connection.job.message && <p>{connection.job.message}</p>}
          <p className="text-[11px]">Aggiornamento: {dateTime(connection.job.updated_at)}. L’acquisizione in Desk continua nella coda di elaborazione.</p>
        </div>}
      </div>;
    })}
    <p className="text-[11px] leading-5 text-slate-600">Sono recuperabili solo gli invii ancora conservati in Elementor con “Raccolta invii” attiva. Elaborazione a lotti, anche chiudendo Desk. Nessun campo clinico viene importato.</p>
  </div>;
}

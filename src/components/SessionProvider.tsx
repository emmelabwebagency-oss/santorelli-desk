import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { Member } from '@/lib/desk';

const SessionContext = createContext<{ session: Session | null; member: Member | null; loading: boolean; error: string; recovery: boolean }>({ session: null, member: null, loading: true, error: '', recovery: false });
export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [member, setMember] = useState<Member | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [recovery, setRecovery] = useState(window.location.hash.includes('type=recovery'));
  useEffect(() => {
    let alive = true;
    const { data } = supabase.auth.onAuthStateChange((event, next) => {
      if (!alive) return;
      if (event === 'PASSWORD_RECOVERY') setRecovery(true);
      if (event === 'SIGNED_OUT') { setError(''); setRecovery(false); }
      setSession(next); setMember(null); setLoading(!!next);
    });
    return () => { alive = false; data.subscription.unsubscribe(); };
  }, []);
  useEffect(() => {
    let alive = true;
    if (!session) { setLoading(false); return; }
    supabase.from('desk_members').select('*').eq('id', session.user.id).eq('active', true).maybeSingle().then(({ data, error: e }) => {
      if (!alive) return;
      setMember(data as Member | null); setError(e ? 'Impossibile verificare i permessi. Riprova più tardi.' : ''); setLoading(false);
    });
    return () => { alive = false; };
  }, [session]);
  return <SessionContext.Provider value={{ session, member, loading, error, recovery }}>{children}</SessionContext.Provider>;
}
export const useSession = () => useContext(SessionContext);

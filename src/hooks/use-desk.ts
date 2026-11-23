import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useSession } from '@/components/SessionProvider';
import { Activity, Inquiry, Member, Notice, Site, Task } from '@/lib/desk';

export function useDesk() {
  const { member } = useSession();
  return useQuery({
    queryKey: ['desk', member?.id], enabled: !!member, refetchInterval: 60000,
    queryFn: async () => {
      const operational = member?.role !== 'super_admin';
      const [inquiries, tasks, activity, members, sites, notices] = await Promise.all([
        operational ? supabase.from('desk_inquiries').select('*,desk_contacts(*)').order('created_at', { ascending: false }) : Promise.resolve({ data: [], error: null }),
        operational ? supabase.from('desk_tasks').select('*').order('due_at') : Promise.resolve({ data: [], error: null }),
        operational ? supabase.from('desk_activity').select('*').order('created_at', { ascending: false }).limit(100) : Promise.resolve({ data: [], error: null }),
        supabase.from('desk_members').select('*').eq('active', true),
        supabase.from('desk_sites').select('*').order('name'),
        supabase.from('desk_notifications').select('*').order('created_at', { ascending: false }).limit(50),
      ]);
      for (const result of [inquiries, tasks, activity, members, sites, notices]) if (result.error) throw new Error('Impossibile caricare i dati');
      return { inquiries: (inquiries.data || []) as unknown as Inquiry[], tasks: (tasks.data || []) as Task[], activity: (activity.data || []) as Activity[], members: (members.data || []) as Member[], sites: (sites.data || []) as Site[], notices: (notices.data || []) as Notice[] };
    },
  });
}

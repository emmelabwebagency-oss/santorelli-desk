import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import PracticeManagement from './PracticeManagement';
import { Member } from '@/lib/desk';

vi.mock('@/integrations/supabase/client',()=>({supabase:{rpc:vi.fn()}}));
const owner:Member={id:'owner',tenant_id:'studio',full_name:'Amministratore sintetico',role:'super_admin',active:true};
const operator:Member={id:'operator',tenant_id:'studio',full_name:'Operatore sintetico',role:'segretaria',active:true};
function markup(member:Member){
  return renderToStaticMarkup(<QueryClientProvider client={new QueryClient()}><PracticeManagement member={member} members={[owner,operator]} sites={[]}/></QueryClientProvider>);
}
describe('Gestione ruoli dal sito',()=>{
  it('mostra al Super Admin la gestione accessi anche per altri Super Admin',()=>{
    const html=markup(owner);
    expect(html.match(/Ruolo e accesso/g)).toHaveLength(2);
    expect(html).toContain('almeno un Super Admin attivo');
  });
  it('non offre agli Admin l’assegnazione dei ruoli privilegiati',()=>{
    const html=markup({...owner,role:'admin'});
    expect(html).not.toContain('Ruolo e accesso');
    expect(html).toContain('Sospendi');
  });
  it('non espone gestione personale alla segreteria',()=>{
    expect(markup(operator)).toBe('');
  });
});

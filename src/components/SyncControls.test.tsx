import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import SyncControls from './SyncControls';

const state = vi.hoisted(() => ({ role: 'segretaria' }));
vi.mock('./SessionProvider', () => ({ useSession: () => ({ member: { id: 'synthetic-operator', role: state.role } }) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: vi.fn() } }));
const connections = ['meta', 'alfadocs', 'whatsapp', 'wordpress'].map(provider => ({ id: `${provider}-synthetic`, provider, label: provider === 'wordpress' ? 'https://example.test' : null, last_success_at: null, running: false }));
function markup(items = connections, role = 'segretaria') {
  state.role = role;
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
  client.setQueryData(['sync-controls', 'synthetic-operator'], items);
  return renderToStaticMarkup(<QueryClientProvider client={client}><SyncControls/></QueryClientProvider>);
}

describe('Comandi del Centro sincronizzazione', () => {
  it('mostra un comando globale e uno per collegamento a tutti i ruoli operativi', () => {
    for (const role of ['segretaria', 'admin', 'super_admin']) {
      const html = markup(connections, role);
      for (const name of ['tutto', 'Meta Lead Ads', 'AlfaDocs', 'WhatsApp', 'WordPress']) expect(html).toContain(`Sincronizza ${name}`);
      expect(html.match(/<button/g)).toHaveLength(5);
      expect(html).not.toContain('disabled=""');
      expect(html).not.toContain('Chiave');
      expect(html).not.toContain('Modifica');
    }
  });
  it('mostra solo i singoli collegamenti restituiti dal server', () => {
    const html = markup([connections[3]]);
    expect(html).toContain('Sincronizza WordPress');
    expect(html).not.toContain('Sincronizza AlfaDocs');
    expect(html).not.toContain('Sincronizza Meta Lead Ads');
    expect(html.match(/<button/g)).toHaveLength(2);
  });
  it('non abilita il comando globale quando non ci sono collegamenti pronti', () => {
    const html = markup([]);
    expect(html).toContain('Sincronizza tutto');
    expect(html).toContain('Nessun collegamento pronto');
    expect(html.match(/disabled=""/g)).toHaveLength(1);
  });
  it('blocca i collegamenti già in corso senza bloccare gli altri', () => {
    const html = markup([{ ...connections[0], running: true }, connections[3]]);
    expect(html.match(/disabled=""/g)).toHaveLength(1);
    expect(html).toContain('Operazione già in coda o in corso');
  });
  it('non promette recupero dello storico WhatsApp', () => {
    expect(markup()).toContain('Non recupera lo storico dei messaggi');
  });
  it('non espone azioni a un ruolo non autorizzato', () => {
    expect(markup(connections, 'unknown')).toBe('');
  });
});

import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import WordPressOperations from './WordPressOperations';

vi.mock('./SessionProvider', () => ({ useSession: () => ({ member: { id: 'synthetic-secretary', role: 'segretaria' } }) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: vi.fn(), from: vi.fn() } }));

describe('Pannello WordPress per la segreteria', () => {
  it('rende raggiungibili i download dal pannello senza esporre controlli tecnici', () => {
    const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
    client.setQueryData(['wordpress-imports', 'synthetic-secretary'], [{ id: 'connection', site_url: 'https://example.test', enabled: true, verified_at: '2026-01-01T00:00:00Z', plugin_version: '1.1.0', last_poll_at: new Date().toISOString(), import_cursor: 0, job: null }]);
    const html = renderToStaticMarkup(<QueryClientProvider client={client}><WordPressOperations/></QueryClientProvider>);
    expect(html).toContain('Scarica tutto');
    expect(html).toContain('Scarica nuovi');
    expect(html).toContain('Importazione automatica ogni ora');
    for (const technical of ['Scarica plugin ZIP', 'Predisponi connessione', 'Ruota chiave', 'Chiave di firma', 'Verifica coda e riprova errori']) {
      expect(html).not.toContain(technical);
    }
  });
});

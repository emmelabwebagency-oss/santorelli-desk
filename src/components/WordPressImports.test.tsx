import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import WordPressImports from './WordPressImports';

const state = vi.hoisted(() => ({ role: 'super_admin' }));
vi.mock('./SessionProvider', () => ({ useSession: () => ({ member: { id: 'synthetic-admin', role: state.role } }) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: vi.fn() } }));
const connection = { id: 'synthetic-connection', site_url: 'https://example.test', enabled: true, verified_at: '2026-01-01T00:00:00Z', plugin_version: '1.1.0', last_poll_at: new Date().toISOString(), import_cursor: 0, job: null };
function markup(overrides: Record<string, unknown> = {}, role = 'super_admin') {
  state.role = role;
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
  client.setQueryData(['wordpress-imports', 'synthetic-admin'], [{ ...connection, ...overrides }]);
  return renderToStaticMarkup(<QueryClientProvider client={client}><WordPressImports/></QueryClientProvider>);
}

describe('Importazioni WordPress', () => {
  it('offre entrambe le azioni agli amministratori dello studio', () => {
    for (const role of ['admin', 'super_admin']) {
      const html = markup({}, role);
      expect(html).toContain('Scarica tutto');
      expect(html).toContain('Scarica nuovi');
      expect(html).not.toContain('disabled=""');
    }
  });
  it('non espone le azioni alla segreteria', () => {
    expect(markup({}, 'segretaria')).toBe('');
  });
  it('richiede l’aggiornamento prima di abilitare le azioni', () => {
    const html = markup({ plugin_version: null });
    expect(html.match(/disabled=""/g)).toHaveLength(2);
    expect(html).toContain('Aggiorna il plugin WordPress');
  });
  it('impedisce importazioni contemporanee e mostra l’avanzamento', () => {
    const html = markup({ job: { id: 'job', mode: 'all', status: 'running', queued: 25, skipped: 3, message: null, updated_at: '2026-01-01T00:00:00Z' } });
    expect(html.match(/disabled=""/g)).toHaveLength(2);
    expect(html).toContain('Lettura in corso');
    expect(html).toContain('25 invii accodati o già presenti');
    expect(html).toContain('3 esclusi');
  });
  it('distingue errore di archivio e assenza del cron da un’importazione riuscita', () => {
    const html = markup({ last_poll_at: '2020-01-01T00:00:00Z', job: { id: 'job', mode: 'new', status: 'failed', queued: 0, skipped: 0, message: 'Archivio non disponibile', updated_at: '2026-01-01T00:00:00Z' } });
    expect(html).toContain('Importazione interrotta');
    expect(html).toContain('Archivio non disponibile');
    expect(html).toContain('Verifica WP-Cron');
  });
});

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const plugin = readFileSync('public/downloads/santorelli-desk/santorelli-desk-source.txt', 'utf8');
const receiver = readFileSync('supabase/functions/desk-wordpress/index.ts', 'utf8');

describe('Contratto importazione WordPress 1.1.0', () => {
  it('mantiene versione e protocollo coerenti tra sito e ricevitore', () => {
    expect(plugin).toContain('Version: 1.1.0');
    expect(plugin).toContain("'action'=>'sync_poll','version'=>'1.1.0'");
    expect(receiver).toContain("input.action === 'sync_poll'");
    expect(receiver).toContain("input.version === '1.1.0'");
  });
  it('autentica il polling prima di leggere i comandi', () => {
    expect(receiver.indexOf("if (!verified)")).toBeLessThan(receiver.indexOf("input.action === 'sync_poll'"));
    expect(receiver).toContain(".eq('tenant_id', config.tenant_id)");
    expect(receiver).toContain(".eq('connection_id', connection)");
  });
  it('usa ID stabili, paginazione e vincoli di coda anche nei retry', () => {
    expect(plugin).toContain("hash('sha256', 'elementor:' . $connection . ':' . $id)");
    expect(plugin).toContain('WHERE id>%d ORDER BY id LIMIT 25');
    expect(plugin).toContain('ON DUPLICATE KEY UPDATE event_id=VALUES(event_id)');
    expect(receiver).toContain("onConflict: 'connection_id,external_id', ignoreDuplicates: true");
    expect(receiver).toContain(".eq('cursor', report.before)");
  });
  it('legge solo i campi autorizzati e non tutti i valori delle risposte', () => {
    expect(plugin).toContain('AND `key` IN ($placeholders)');
    expect(plugin).not.toContain('SELECT * FROM `$values_table`');
    expect(plugin).toContain("array('trash','spam')");
    expect(plugin).toContain("$result['error']='storage'");
    expect(plugin).toContain("$result['error']='queue'");
  });
  it('non reimporta automaticamente tutto lo storico dopo l’aggiornamento', () => {
    expect(plugin).toContain("add_option($option, (int) $wpdb->get_var('SELECT COALESCE(MAX(id),0)");
    expect(plugin).toContain("in_array('save-to-database'");
    expect(plugin).toContain("add_option($lock,time()+600");
  });
});

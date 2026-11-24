import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { unzipSync, strFromU8 } from 'fflate';
import { buildPluginZip } from './plugin-package';
import { matchesWaitingSlot } from './waiting-list';

const preferences = { preferred_days: [1,2,3,4,5], time_from: '09:00:00', time_to: '18:00:00', notice_hours: 24, status: 'IN ATTESA' };

describe('Pacchetto WordPress installabile', () => {
  const php = readFileSync('public/downloads/santorelli-desk/santorelli-desk.php','utf8');
  const instructions = readFileSync('public/downloads/santorelli-desk/LEGGIMI.txt','utf8');
  it('produce un vero ZIP con cartella radice e file PHP intatto', () => {
    const zip = buildPluginZip(php,instructions);
    expect(Array.from(zip.slice(0,4))).toEqual([80,75,3,4]);
    const files = unzipSync(zip);
    expect(Object.keys(files).sort()).toEqual(['santorelli-desk/LEGGIMI.txt','santorelli-desk/santorelli-desk.php']);
    expect(strFromU8(files['santorelli-desk/santorelli-desk.php'])).toBe(php);
    expect(strFromU8(files['santorelli-desk/LEGGIMI.txt'])).toBe(instructions);
  });
  it('rifiuta pagine HTML di errore al posto del plugin', () => {
    expect(() => buildPluginZip('<html>Non trovato</html>',instructions)).toThrow();
    expect(() => buildPluginZip(php,'')).toThrow();
  });
  it('contiene guardie WordPress, nonce e cifratura senza incorporare segreti operativi', () => {
    expect(php).toContain("if (!defined('ABSPATH'))");
    expect(php).toContain('check_admin_referer');
    expect(php).toContain('current_user_can');
    expect(php).toContain('aes-256-gcm');
    expect(php).toContain("hash_hmac('sha256'");
    expect(php).not.toMatch(/sb_secret_|sb_service_role_|re_[A-Za-z0-9]{20,}/);
  });
});

describe('Lista d’attesa in Europe/Rome', () => {
  const now = new Date('2026-01-04T08:00:00Z').getTime();
  it('trova un lunedì compatibile nel fuso dello studio', () => {
    expect(matchesWaitingSlot(preferences,'2026-01-05T08:00:00Z',now)).toBe(true);
  });
  it('rifiuta un giorno non selezionato', () => {
    expect(matchesWaitingSlot(preferences,'2026-01-10T10:00:00Z',now)).toBe(false);
  });
  it('rispetta il preavviso minimo', () => {
    expect(matchesWaitingSlot(preferences,'2026-01-05T08:00:00Z',now+1)).toBe(false);
  });
  it('rifiuta fasce orarie non compatibili', () => {
    expect(matchesWaitingSlot(preferences,'2026-01-05T18:00:00Z',now)).toBe(false);
  });
  it('non propone persone già contattate o soddisfatte', () => {
    expect(matchesWaitingSlot({...preferences,status:'SODDISFATTA'},'2026-01-05T08:00:00Z',now)).toBe(false);
  });
  it('applica l’ora legale italiana, non il fuso del dispositivo', () => {
    expect(matchesWaitingSlot({...preferences,notice_hours:0},'2026-07-06T07:00:00Z',new Date('2026-07-06T06:00:00Z').getTime())).toBe(true);
    expect(matchesWaitingSlot({...preferences,notice_hours:0},'2026-07-06T06:00:00Z',new Date('2026-07-06T05:00:00Z').getTime())).toBe(false);
  });
});

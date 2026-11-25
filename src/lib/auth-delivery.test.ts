import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const login = readFileSync('supabase/functions/desk-login/index.ts', 'utf8');
const admin = readFileSync('supabase/functions/desk-admin/index.ts', 'utf8');
const mail = readFileSync('supabase/functions/_shared/auth-email.ts', 'utf8');

describe('Regressioni del trasporto Auth senza SMTP', () => {
  it('genera codici Supabase senza richiedere email SMTP', () => {
    expect(login).toContain("db.rpc('desk_login_request'");
    expect(login).toContain("db.auth.admin.generateLink({type:'magiclink'");
    expect(login).toContain("db.rpc('desk_bootstrap_member'");
    expect(login).not.toContain('signInWithOtp');
    expect(login).not.toContain('action_link');
  });
  it('verifica il chiamante prima di creare gli account invitati', () => {
    expect(admin.indexOf('db.auth.getUser(token)')).toBeLessThan(admin.indexOf('db.auth.admin.createUser'));
    expect(admin).toContain("caller.role === 'admin' && role !== 'segretaria'");
    expect(admin).not.toContain('inviteUserByEmail');
    expect(admin).toContain("sendAuthEmail('desk-admin'");
  });
  it('usa la chiave solo sul server e un mittente verificato', () => {
    expect(mail).toContain("Deno.env.get('RESEND_API_KEY')");
    expect(mail).toContain('https://api.resend.com/emails');
    expect(mail).toContain('Santorelli Desk <desk@adrianosantorelli.it>');
    expect(mail).not.toContain('console.log(text');
    expect(mail).not.toContain('response.text()');
  });
});

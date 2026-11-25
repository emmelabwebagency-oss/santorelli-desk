import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import EmailCodeLogin from './EmailCodeLogin';

vi.mock('@/integrations/supabase/client',()=>({supabase:{functions:{invoke:vi.fn()},auth:{verifyOtp:vi.fn()}}}));

describe('Accesso con codice email',()=>{
  it('presenta un’email autorizzata senza password o registrazione pubblica',()=>{
    const html=renderToStaticMarkup(<EmailCodeLogin/>);
    expect(html).toContain('type="email"');
    expect(html).toContain('Ricevi il codice via email');
    expect(html).toContain('Nessuna registrazione pubblica');
    expect(html).not.toContain('type="password"');
  });
  it('non incorpora nel markup elenco di email o credenziali di servizio',()=>{
    const html=renderToStaticMarkup(<EmailCodeLogin/>);
    expect(html).not.toContain('info@emmelab.it');
    expect(html).not.toContain('service_role');
    expect(html).not.toContain('sb_secret_');
  });
});

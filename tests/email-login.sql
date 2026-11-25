-- Test sintetici della sola autorizzazione. Non invia email o codici.
DO $test$
DECLARE
  tenant uuid:=gen_random_uuid();
  active_user uuid:=gen_random_uuid();
  inactive_user uuid:=gen_random_uuid();
  orphan_user uuid:=gen_random_uuid();
  email text:='fixture-'||active_user||'@example.invalid';
BEGIN
  BEGIN
    INSERT INTO public.desk_tenants(id,name,alert_email) VALUES(tenant,'Fixture login','fixture@example.invalid');
    INSERT INTO auth.users(id,email) VALUES(active_user,email),(inactive_user,'fixture-'||inactive_user||'@example.invalid'),(orphan_user,'fixture-'||orphan_user||'@example.invalid');
    INSERT INTO public.desk_members(id,tenant_id,full_name,role,active) VALUES(active_user,tenant,'Operatore sintetico','segretaria',true),(inactive_user,tenant,'Operatore sospeso','segretaria',false);
    IF public.desk_login_request('unknown-'||gen_random_uuid()||'@example.invalid') THEN RAISE EXCEPTION 'Email sconosciuta accettata'; END IF;
    IF public.desk_login_request('fixture-'||inactive_user||'@example.invalid') THEN RAISE EXCEPTION 'Profilo sospeso accettato'; END IF;
    IF public.desk_login_request('fixture-'||orphan_user||'@example.invalid') THEN RAISE EXCEPTION 'Account senza profilo accettato'; END IF;
    IF NOT public.desk_login_request(upper(email)) THEN RAISE EXCEPTION 'Email autorizzata rifiutata'; END IF;
    IF public.desk_login_request(email) THEN RAISE EXCEPTION 'Cooldown ignorato'; END IF;
    UPDATE public.desk_login_requests SET requested_at=now()-interval '61 seconds' WHERE email_hash=encode(extensions.digest(email,'sha256'),'hex');
    UPDATE public.desk_members SET active=false WHERE id=active_user;
    IF public.desk_login_request(email) THEN RAISE EXCEPTION 'Sospensione non applicata'; END IF;
    IF has_function_privilege('anon','public.desk_login_request(text)','EXECUTE') OR has_function_privilege('authenticated','public.desk_login_request(text)','EXECUTE') OR has_table_privilege('anon','public.desk_login_requests','SELECT') OR has_table_privilege('authenticated','public.desk_login_requests','SELECT') THEN RAISE EXCEPTION 'Registro login esposto'; END IF;
    IF EXISTS(SELECT 1 FROM public.desk_login_requests WHERE email_hash=email) THEN RAISE EXCEPTION 'Email in chiaro conservata'; END IF;
    RAISE EXCEPTION USING ERRCODE='ZX001',MESSAGE='Autorizzazioni e cooldown verificati; rollback fixture';
  EXCEPTION WHEN SQLSTATE 'ZX001' THEN NULL;
  END;
END $test$;

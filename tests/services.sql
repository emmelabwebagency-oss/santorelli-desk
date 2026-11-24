-- Test amministrativi sintetici. Ogni modifica viene annullata dal blocco interno.
-- Nessun invio email o chiamata a provider esterni.
DO $test$
DECLARE
  tenant uuid := gen_random_uuid();
  user_id uuid := gen_random_uuid();
  connection uuid := gen_random_uuid();
  mail_id uuid;
  leased public.desk_email_outbox;
  first_id uuid;
  again_id uuid;
  prompt jsonb;
BEGIN
  BEGIN
    INSERT INTO public.desk_tenants(id,name,alert_email)
      VALUES(tenant,'Fixture sintetica','fixture@example.invalid');
    INSERT INTO auth.users(id,email)
      VALUES(user_id,'fixture-'||user_id||'@example.invalid');
    INSERT INTO public.desk_members(id,tenant_id,full_name,role)
      VALUES(user_id,tenant,'Operatore sintetico','segretaria');
    INSERT INTO public.desk_connections(id,tenant_id,kind,remote_id,config)
      VALUES(connection,tenant,'meta','999'||floor(random()*100000000000)::bigint,'{}');
    first_id := public.desk_external_import(connection,'fixture-lead',jsonb_build_object(
      'name','Contatto sintetico','phone','+39000111222','received_at',now(),'platform','fb'));
    again_id := public.desk_external_import(connection,'fixture-lead',jsonb_build_object(
      'name','Contatto sintetico','phone','+39000111222','received_at',now(),'platform','fb'));
    IF first_id <> again_id THEN RAISE EXCEPTION 'Idempotenza importazione fallita'; END IF;
    IF (SELECT first_handled_at IS NOT NULL OR assigned_to IS NOT NULL
        FROM public.desk_inquiries WHERE id=first_id) THEN
      RAISE EXCEPTION 'Importazione erroneamente considerata gestione umana';
    END IF;
    INSERT INTO public.desk_email_outbox(tenant_id,recipient,subject,dedup_key)
      VALUES(tenant,'fixture@example.invalid','Test sintetico','fixture:'||connection)
      RETURNING id INTO mail_id;
    SELECT * INTO leased FROM public.desk_email_claim_for(tenant) WHERE id=mail_id;
    IF leased.id IS NULL OR leased.attempts<>1 THEN RAISE EXCEPTION 'Claim email fallito'; END IF;
    IF EXISTS(SELECT 1 FROM public.desk_email_claim_for(tenant) WHERE id=mail_id) THEN
      RAISE EXCEPTION 'Lease concorrente duplicato';
    END IF;
    PERFORM public.desk_email_receipt('fixture-event-'||connection,'fixture-provider-'||connection,'email.delivered',now());
    PERFORM public.desk_email_finish(mail_id,leased.lease_token,true,'fixture-provider-'||connection,NULL,false);
    PERFORM public.desk_email_finish(mail_id,leased.lease_token,false,NULL,'Esito obsoleto',true);
    IF (SELECT status<>'inviata' OR delivery_status<>'consegnata'
        FROM public.desk_email_outbox WHERE id=mail_id) THEN
      RAISE EXCEPTION 'Ricevuta anticipata o esito obsoleto non gestito';
    END IF;
    PERFORM set_config('request.jwt.claim.sub',user_id::text,true);
    INSERT INTO public.desk_user_reminders(user_id,tenant_id,active_seconds)
      VALUES(user_id,tenant,10800);
    prompt := public.desk_sync_prompt('tick',true);
    IF NOT (prompt->>'show')::boolean THEN RAISE EXCEPTION 'Promemoria non mostrato'; END IF;
    prompt := public.desk_sync_prompt('tick',true);
    IF (prompt->>'show')::boolean THEN RAISE EXCEPTION 'Promemoria duplicato'; END IF;
    IF has_table_privilege('anon','public.desk_inquiries','TRUNCATE')
      OR has_table_privilege('authenticated','public.desk_inquiries','TRUNCATE')
      OR has_function_privilege('anon','public.desk_external_import(uuid,text,jsonb)','EXECUTE') THEN
      RAISE EXCEPTION 'Privilegi eccessivi';
    END IF;
    RAISE EXCEPTION USING ERRCODE='ZX001',MESSAGE='Test superati; annullamento fixture';
  EXCEPTION WHEN SQLSTATE 'ZX001' THEN NULL;
  END;
END $test$;

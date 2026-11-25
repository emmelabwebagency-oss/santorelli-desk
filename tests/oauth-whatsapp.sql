-- Regressioni sintetiche; il blocco interno annulla dati e token di prova.
-- Nessuna chiamata a Meta, WhatsApp o altri provider.
DO $test$
DECLARE
  tenant uuid:=gen_random_uuid(); admin_id uuid:=gen_random_uuid(); tech uuid:=gen_random_uuid(); operator_id uuid:=gen_random_uuid();
  cm uuid:=gen_random_uuid(); cw uuid:=gen_random_uuid(); contact uuid; inquiry uuid; model uuid; message uuid; request uuid:=gen_random_uuid();
  leased public.desk_whatsapp_outbox; flow jsonb; rejected boolean; hash text:=encode(extensions.digest(gen_random_uuid()::text,'sha256'),'hex');
BEGIN
  BEGIN
    INSERT INTO public.desk_tenants(id,name,alert_email) VALUES(tenant,'Fixture OAuth WhatsApp','fixture@example.invalid');
    INSERT INTO auth.users(id,email) VALUES(admin_id,'fixture-'||admin_id||'@example.invalid'),(tech,'fixture-'||tech||'@example.invalid'),(operator_id,'fixture-'||operator_id||'@example.invalid');
    INSERT INTO public.desk_members(id,tenant_id,full_name,role) VALUES(admin_id,tenant,'Admin sintetico','admin'),(tech,tenant,'Tecnico sintetico','super_admin'),(operator_id,tenant,'Segretaria sintetica','segretaria');
    INSERT INTO public.desk_connections(id,tenant_id,kind,remote_id,config,verified_at) VALUES
      (cm,tenant,'meta','8'||floor(random()*10000000000000)::bigint,'{"app_id":"123","graph_version":"v23.0","form_ids":["456"]}',now()),
      (cw,tenant,'whatsapp','9'||floor(random()*10000000000000)::bigint,'{"app_id":"123","graph_version":"v23.0","business_id":"789"}',now());
    PERFORM public.desk_oauth_begin(cm,tech,hash);
    flow:=public.desk_oauth_consume(hash);
    IF flow IS NULL OR public.desk_oauth_consume(hash) IS NOT NULL THEN RAISE EXCEPTION 'Stato OAuth non monouso'; END IF;
    PERFORM public.desk_oauth_store(cm,tech,flow->>'config_hash','fixture-token-non-reale-almeno-trentadue-caratteri',now()+interval '1 hour',now()+interval '2 hours');
    IF public.desk_connector_token(cm)->>'token'<>'fixture-token-non-reale-almeno-trentadue-caratteri' THEN RAISE EXCEPTION 'Vault non collegato'; END IF;
    IF has_function_privilege('authenticated','public.desk_connector_token(uuid)','EXECUTE') OR has_table_privilege('authenticated','public.desk_connector_credentials','SELECT') THEN RAISE EXCEPTION 'Token accessibile dal client'; END IF;
    PERFORM set_config('request.jwt.claim.sub',tech::text,true);
    PERFORM public.desk_oauth_disconnect(cm);
    IF public.desk_connector_token(cm) IS NOT NULL THEN RAISE EXCEPTION 'Token non rimosso'; END IF;
    INSERT INTO public.desk_contacts(tenant_id,name,phone) VALUES(tenant,'Contatto sintetico','+3900011122233') RETURNING id INTO contact;
    INSERT INTO public.desk_inquiries(tenant_id,contact_id,source,subject,assigned_to) VALUES(tenant,contact,'Telefono','Richiesta sintetica',operator_id) RETURNING id INTO inquiry;
    PERFORM public.desk_wa_template_cache(cw,jsonb_build_array(jsonb_build_object('id','12345','name','avviso_amministrativo','language','it','preview','Contattare la segreteria. STOP per interrompere.','fingerprint',repeat('a',64))));
    SELECT id INTO model FROM public.desk_whatsapp_templates WHERE connection_id=cw;
    PERFORM set_config('request.jwt.claim.sub',admin_id::text,true);
    PERFORM public.desk_wa_template_enable(model,true,true);
    PERFORM set_config('request.jwt.claim.sub',operator_id::text,true);
    message:=public.desk_wa_queue(inquiry,model,request,'CONS-FIXTURE',true);
    IF message<>public.desk_wa_queue(inquiry,model,request,'CONS-FIXTURE',true) THEN RAISE EXCEPTION 'Idempotenza non rispettata'; END IF;
    SELECT * INTO leased FROM public.desk_wa_claim() WHERE id=message;
    UPDATE public.desk_contacts SET phone='+3900099988877' WHERE id=contact;
    rejected:=false;
    BEGIN PERFORM public.desk_wa_context(message,leased.lease); EXCEPTION WHEN OTHERS THEN rejected:=true; END;
    IF NOT rejected THEN RAISE EXCEPTION 'Cambio recapito non blocca invio'; END IF;
    UPDATE public.desk_contacts SET phone='+3900011122233' WHERE id=contact;
    PERFORM public.desk_wa_context(message,leased.lease);
    PERFORM public.desk_whatsapp_receipt(cw,'fixture-provider','read',now());
    PERFORM public.desk_wa_finish(message,leased.lease,'accepted','fixture-provider',NULL);
    PERFORM public.desk_whatsapp_receipt(cw,'fixture-provider','sent',now());
    IF (SELECT delivery_status IS DISTINCT FROM 'read' FROM public.desk_whatsapp_outbox WHERE id=message) THEN RAISE EXCEPTION 'Ricevuta anticipata o regressione stato'; END IF;
    IF (SELECT first_handled_at IS NOT NULL FROM public.desk_inquiries WHERE id=inquiry) THEN RAISE EXCEPTION 'Invio finge gestione'; END IF;
    PERFORM public.desk_wa_inbound_optout(cw,'+3900011122233');
    rejected:=false;
    BEGIN PERFORM public.desk_wa_queue(inquiry,model,gen_random_uuid(),'CONS-FIXTURE',true); EXCEPTION WHEN OTHERS THEN rejected:=true; END;
    IF NOT rejected THEN RAISE EXCEPTION 'Invio dopo opt-out'; END IF;
    PERFORM public.desk_wa_preference(inquiry,false,'CONS-NUOVO');
    UPDATE public.desk_whatsapp_outbox SET created_at=now()-interval '6 minutes' WHERE id=message;
    message:=public.desk_wa_queue(inquiry,model,gen_random_uuid(),'CONS-NUOVO',true);
    SELECT * INTO leased FROM public.desk_wa_claim() WHERE id=message;
    UPDATE public.desk_whatsapp_outbox SET locked_until=now()-interval '1 minute' WHERE id=message;
    PERFORM public.desk_wa_claim();
    IF (SELECT status<>'uncertain' FROM public.desk_whatsapp_outbox WHERE id=message) OR EXISTS(SELECT 1 FROM public.desk_wa_claim() WHERE id=message) THEN RAISE EXCEPTION 'Esito incerto reinviato'; END IF;
    UPDATE public.desk_whatsapp_outbox SET created_at=now()-interval '1 day' WHERE id=message;
    rejected:=false;
    BEGIN PERFORM public.desk_wa_queue(inquiry,model,gen_random_uuid(),'CONS-NUOVO',true); EXCEPTION WHEN OTHERS THEN rejected:=true; END;
    IF NOT rejected THEN RAISE EXCEPTION 'Esito incerto vecchio non blocca nuovi invii'; END IF;
    PERFORM public.desk_wa_resolve(message,false,'VERIFICA-FIXTURE',true);
    IF NOT EXISTS(SELECT 1 FROM public.desk_whatsapp_outbox WHERE id=message AND resolution_reference='VERIFICA-FIXTURE' AND status='failed') THEN RAISE EXCEPTION 'Verifica manuale non registrata'; END IF;
    EXECUTE 'SET LOCAL ROLE authenticated';
    PERFORM set_config('request.jwt.claim.sub',tech::text,true);
    IF EXISTS(SELECT 1 FROM public.desk_whatsapp_outbox WHERE tenant_id=tenant) THEN RAISE EXCEPTION 'Super Admin vede destinatari'; END IF;
    EXECUTE 'RESET ROLE';
    RAISE EXCEPTION USING ERRCODE='ZX001',MESSAGE='Test superati; rollback fixture';
  EXCEPTION WHEN SQLSTATE 'ZX001' THEN NULL;
  END;
END $test$;

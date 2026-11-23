-- Test amministrativi sintetici. Eseguire in un ambiente di collaudo tramite un client SQL privilegiato.
-- Il blocco annulla tutte le fixture al termine; nessun dato paziente.
DO $test$
DECLARE
  t uuid := '11111111-1111-4111-8111-111111111111';
  a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); tech uuid := gen_random_uuid();
  inquiry uuid; blocked boolean;
BEGIN
  BEGIN
    INSERT INTO auth.users(id,email) VALUES (a,'fixture-a@example.invalid'),(b,'fixture-b@example.invalid'),(tech,'fixture-tech@example.invalid');
    INSERT INTO public.desk_members(id,tenant_id,full_name,role) VALUES
      (a,t,'Fixture A','segretaria'),(b,t,'Fixture B','segretaria'),(tech,t,'Fixture Tecnico','super_admin');
    PERFORM set_config('request.jwt.claim.sub',a::text,true);
    inquiry := public.desk_command('create',jsonb_build_object('name','Contatto sintetico','subject','Verifica amministrativa','source','Telefono'));
    IF (SELECT assigned_to FROM public.desk_inquiries WHERE id=inquiry) <> a THEN RAISE EXCEPTION 'Assegnazione iniziale errata'; END IF;
    IF (SELECT first_handled_at FROM public.desk_inquiries WHERE id=inquiry) IS NOT NULL THEN RAISE EXCEPTION 'Creazione considerata prima gestione'; END IF;
    PERFORM set_config('request.jwt.claim.sub',b::text,true);
    IF (SELECT public.desk_can_read(i) FROM public.desk_inquiries i WHERE id=inquiry) THEN RAISE EXCEPTION 'Accesso tra segretarie non isolato'; END IF;
    blocked := false;
    BEGIN PERFORM public.desk_command('claim',jsonb_build_object('id',inquiry)); EXCEPTION WHEN OTHERS THEN blocked:=true; END;
    IF NOT blocked THEN RAISE EXCEPTION 'Doppia assegnazione consentita'; END IF;
    PERFORM set_config('request.jwt.claim.sub',tech::text,true);
    IF (SELECT public.desk_can_read(i) FROM public.desk_inquiries i WHERE id=inquiry) THEN RAISE EXCEPTION 'Tecnico con accesso ai pazienti'; END IF;
    PERFORM set_config('request.jwt.claim.sub',a::text,true);
    UPDATE public.desk_inquiries SET created_at=now()-interval '49 hours' WHERE id=inquiry;
    PERFORM public.desk_run_reminders(); PERFORM public.desk_run_reminders();
    IF (SELECT count(*) FROM public.desk_escalations WHERE inquiry_id=inquiry)<>1 THEN RAISE EXCEPTION 'Escalation assente o duplicata'; END IF;
    IF (SELECT count(*) FROM public.desk_email_outbox WHERE dedup_key='48:'||inquiry)<>1 THEN RAISE EXCEPTION 'Email escalation assente o duplicata'; END IF;
    PERFORM public.desk_command('no_answer',jsonb_build_object('id',inquiry,'due_at',now()+interval '1 day'));
    IF (SELECT status FROM public.desk_inquiries WHERE id=inquiry)<>'NON RISPONDE' THEN RAISE EXCEPTION 'Esito non risponde errato'; END IF;
    IF (SELECT first_handled_at FROM public.desk_inquiries WHERE id=inquiry) IS NULL THEN RAISE EXCEPTION 'Tentativo non registrato come gestione'; END IF;
    IF (SELECT count(*) FROM public.desk_tasks WHERE inquiry_id=inquiry AND completed_at IS NULL)<>1 THEN RAISE EXCEPTION 'Richiamo non pianificato'; END IF;
    blocked:=false;
    BEGIN PERFORM public.desk_command('callback',jsonb_build_object('id',inquiry,'due_at',now()-interval '1 day')); EXCEPTION WHEN OTHERS THEN blocked:=true; END;
    IF NOT blocked THEN RAISE EXCEPTION 'Scadenza passata consentita'; END IF;
    RAISE EXCEPTION USING ERRCODE='ZX001',MESSAGE='Test superati: annullamento fixture';
  EXCEPTION WHEN SQLSTATE 'ZX001' THEN NULL;
  END;
END $test$;

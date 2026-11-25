-- Dati sintetici, nessun invio e rollback completo.
DO $test$
DECLARE
 t uuid:=gen_random_uuid(); t2 uuid:=gen_random_uuid();
 s1 uuid:=gen_random_uuid(); s2 uuid:=gen_random_uuid(); adm uuid:=gen_random_uuid(); tech uuid:=gen_random_uuid(); other_user uuid:=gen_random_uuid();
 c uuid:=gen_random_uuid(); c2 uuid:=gen_random_uuid(); i1 uuid:=gen_random_uuid(); i2 uuid:=gen_random_uuid(); i3 uuid:=gen_random_uuid();
 r jsonb; blocked boolean;
BEGIN
 BEGIN
  INSERT INTO public.desk_tenants(id,name,alert_email) VALUES(t,'Fixture report','fixture@example.invalid'),(t2,'Fixture altro studio','fixture@example.invalid');
  INSERT INTO auth.users(id,email) VALUES(s1,s1||'@example.invalid'),(s2,s2||'@example.invalid'),(adm,adm||'@example.invalid'),(tech,tech||'@example.invalid'),(other_user,other_user||'@example.invalid');
  INSERT INTO public.desk_members(id,tenant_id,full_name,role) VALUES(s1,t,'Segretaria Uno','segretaria'),(s2,t,'Segretaria Due','segretaria'),(adm,t,'Admin Fixture','admin'),(tech,t,'Tecnico Fixture','super_admin'),(other_user,t2,'Altro studio','segretaria');
  INSERT INTO public.desk_contacts(id,tenant_id,name,email) VALUES(c,t,'CONTATTO PRIVATO','privato@example.invalid'),(c2,t2,'ALTRO CONTATTO','altro@example.invalid');
  INSERT INTO public.desk_inquiries(id,tenant_id,contact_id,assigned_to,source,subject,created_at) VALUES(i1,t,c,s1,'Telefono','Fixture uno','2030-03-31 22:30:00+00'),(i2,t,c,s2,'Telefono','Fixture due','2030-04-01 10:00:00+00'),(i3,t2,c2,other_user,'Telefono','Fixture esterna','2030-04-01 10:00:00+00');
  INSERT INTO public.desk_activity(tenant_id,inquiry_id,actor_id,event,note,created_at) VALUES(t,i1,s1,'Esito telefonata registrato','NOTA RISERVATA','2030-03-31 22:30:00+00'),(t,i2,s2,'Richiamo pianificato','','2030-04-01 11:00:00+00'),(t2,i3,other_user,'Esito telefonata registrato','','2030-04-01 11:00:00+00'),(t,i1,s1,'Richiesta completata','','2030-04-01 22:00:00+00');
  PERFORM set_config('request.jwt.claim.sub',s1::text,true);
  r:=public.desk_staff_report('2030-04-01','2030-04-01');
  IF r->>'scope'<>'personale' OR jsonb_array_length(r->'people')<>1 OR r->'people'->0->>'id'<>s1::text OR (r->'totals'->>'actions')::int<>1 OR (r->'totals'->>'calls')::int<>1 OR (r->'totals'->>'received')::int<>1 THEN RAISE EXCEPTION 'Report personale o confini data errati'; END IF;
  IF r::text LIKE '%Segretaria Due%' OR r::text LIKE '%CONTATTO PRIVATO%' OR r::text LIKE '%NOTA RISERVATA%' OR r::text LIKE '%privato@example.invalid%' THEN RAISE EXCEPTION 'Informazioni riservate nel report'; END IF;
  PERFORM set_config('request.jwt.claim.sub',adm::text,true);
  r:=public.desk_staff_report('2030-04-01','2030-04-01');
  IF r->>'scope'<>'studio' OR (r->'totals'->>'actions')::int<>2 OR (r->'totals'->>'worked')::int<>2 OR (r->'totals'->>'received')::int<>2 OR r::text LIKE '%Altro studio%' THEN RAISE EXCEPTION 'Totale globale o isolamento tenant errato'; END IF;
  PERFORM set_config('request.jwt.claim.sub',tech::text,true);
  blocked:=false; BEGIN PERFORM public.desk_staff_report('2030-04-01','2030-04-01'); EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'Report riservato agli utenti operativi autorizzati' THEN RAISE; END IF; blocked:=true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'Super Admin autorizzato'; END IF;
  UPDATE public.desk_members SET active=false WHERE id=s1;
  PERFORM set_config('request.jwt.claim.sub',s1::text,true);
  blocked:=false; BEGIN PERFORM public.desk_staff_report('2030-04-01','2030-04-01'); EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'Report riservato agli utenti operativi autorizzati' THEN RAISE; END IF; blocked:=true; END;
  IF NOT blocked OR has_function_privilege('anon','public.desk_staff_report(date,date)','EXECUTE') THEN RAISE EXCEPTION 'Report accessibile senza autorizzazione'; END IF;
  RAISE EXCEPTION USING ERRCODE='ZX001',MESSAGE='Test report superati, rollback fixture';
 EXCEPTION WHEN SQLSTATE 'ZX001' THEN NULL;
 END;
END $test$;

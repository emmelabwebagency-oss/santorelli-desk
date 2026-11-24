# Santorelli Desk — avvio tecnico e stato reale

## Ambito di questa consegna

Il nucleo CRM è stato esteso: non si tratta ancora di una certificazione di rilascio sanitario o del completamento di tutte le fasi del progetto. Nessun connettore è dichiarato operativo solo perché il codice o la configurazione esistono. Nessuna credenziale è inclusa nei sorgenti. Non usare dati paziente prima del collaudo autorizzato.

## Funzioni disponibili

- Logo vettoriale Santorelli Desk, favicon dedicata e Arial nell’intera interfaccia, compreso il modulo Auth.
- CRM persistente italiano con contatti e richieste distinti, presa in carico atomica, assegnazione, riassegnazione Admin, esiti amministrativi, richiami futuri e cronologia.
- Ruoli: segretarie su proprie richieste e coda non assegnata; Admin Studio sul proprio tenant; Super Admin sui metadati tecnici, senza lettura dei pazienti.
- Rinomina sedi, nomi operatori e sospensione/riattivazione accessi mediante procedure autorizzate e audit.
- Cron server ogni minuto per promemoria in-app e escalation deduplicate dopo 48 ore. Aprire, assegnare o programmare un richiamo non equivale alla prima gestione umana.
- Email operative con outbox persistente, lease, recupero dopo interruzione, massimo otto tentativi, attesa crescente e chiave di idempotenza Resend. Dopo 23 ore dal primo tentativo gli invii incerti richiedono verifica manuale. Pannello tecnico con test alla propria email e retry auditati.
- Ricevute Resend con firma Svix; stati consegnata/respinta/segnalata spam separati dall’accettazione dell’invio. Gestita anche una ricevuta arrivata prima del salvataggio della risposta provider.
- WordPress/Elementor: webhook HMAC con timestamp, validazione origine, eventi persistenti deduplicati, retry, import in coda non assegnata e attribuzione UTM disponibile. I dati degli eventi elaborati sono svuotati. Il matching dei contatti evita fusioni automatiche se i recapiti sono in conflitto.
- ZIP WordPress generato dal pulsante nel Centro sincronizzazione, con cartella radice installabile, PHP e istruzioni. Mapping per Nome modulo e ID campi, chiave e coda cifrate AES-256-GCM, firma, log senza contenuti e retry con lo stesso ID. WP-Cron richiede traffico o un cron reale configurato dall’hosting. Il form non attende la rete CRM.
- Meta Lead Ads: ricevitore ufficiale per Facebook/Instagram con firma, eventi persistenti, selezione dei soli recapiti standard, dati amministrativi campagna/annuncio, recupero lead accessibili con cursori persistenti e riconciliazione ogni tre ore. Nessuna scrittura di conversioni o dati sanitari verso Meta e nessuna dipendenza live da Pipelean.
- WhatsApp Business: webhook firmato, ingresso di recapiti e metadati amministrativi e stati di consegna disponibili. I contenuti dei messaggi non vengono archiviati. Più messaggi di un contatto con richiesta aperta non generano una richiesta per messaggio; la fonte originale della richiesta rimane invariata. Referral pubblicitario conservato solo se presente nei metadati firmati; altrimenti origine non determinata.
- AlfaDocs: test autorizzazione su contesto studio/archivio e import in sola lettura dei riferimenti appuntamento da ieri ai prossimi 27 giorni. Timestamp senza offset interpretati nel fuso dello studio, da verificare sul conto reale. Solo riferimento, orario, durata, stato e indicazione dei promemoria del sistema ufficiale; niente cartelle cliniche o copia dell’anagrafica AlfaDocs. Nessuna modifica dell’agenda o messaggio al paziente.
- Appuntamenti ufficiali e lista d’attesa: associazione manuale Admin tra riferimento e richiesta, stati confermati/cancellati/mancata presentazione realmente importati, segnalazione cancellazioni, preferenze di giorni/fasce/preavviso ed esiti auditati. Le proposte sono amministrative: durata, categoria, idoneità clinica e priorità richiedono controllo umano. Nessuna prenotazione automatica.
- Centro sincronizzazione con test API e job, tentativi, errori indipendenti per connettore, recupero eventi e checkpoint, conteggi reali senza payload paziente. API verificata e ricezione webhook sono stati distinti.
- Popup sincronizzazione dopo 180 minuti di uso attivo per impostazione iniziale: testo italiano, nessuna interruzione dei moduli aperti, coordinamento tra schede tramite lock server, rinvio 30 minuti persistente per utente. Il Super Admin può modificare l’intervallo o disattivarlo. Le sincronizzazioni automatiche non dipendono dal popup.
- Analisi server per fonte/campagna/gruppo/inserzione con paginazione, confronto con il mese precedente, mediana ore alla prima gestione e filtro storico. Export CSV di tutte le pagine, senza recapiti e protetto da formule. I conteggi non dipendono dal limite delle liste frontend. Conversione = stato attuale della richiesta, non storico delle prenotazioni; niente spesa/ROI stimati.
- Import storico CSV in Impostazioni (Admin Studio): modello, mapping, anteprima, date ISO con fuso e validazione server. Massimo 2 MB/2.000 righe per file; lotti atomici da 250. Namespace + ID originale deduplicano le riesportazioni senza sovrascrivere. Solo colonne amministrative mappate; nessun CSV integrale conservato. Gli import non generano escalation retroattive né una prima gestione fittizia. Registro dei lotti e audit. In caso di errore, i lotti precedenti sono conservati e possono essere ripetuti senza doppioni.
- Categorie amministrative persistenti per WhatsApp e altri canali. La classificazione non conta come prima gestione; riservata ad Admin o assegnataria.
- Editor automazioni (Admin/Super Admin): preavviso richiamo da 5 a 1.440 minuti, email per richiamo scaduto attivabile, oggetti e testi in plain text con il solo segnaposto {app_url}. Regole usate dal cron reale, testi salvati nell’outbox al momento dell’accodamento, escalation 48 ore sempre attiva per richieste live. Nessun segnaposto paziente.
- Supporto diagnostico temporaneo: consenso esplicito Admin su singola richiesta e singolo tecnico dello stesso tenant, ticket non contenente dati personali, 5–60 minuti, revoca e audit di ogni consultazione. Espone esclusivamente fonte, stato, date e conteggi; non nome, telefono, email, oggetto, note o messaggi. Non cambia il ruolo né estende le policy delle tabelle paziente. Il server verifica ogni lettura e l’Admin approvatore ancora attivo. Il frontend rimuove la diagnostica a scadenza e controlla revoche ogni 5 secondi.

## Architettura e autorizzazioni

React/Vite/TypeScript → Supabase Auth e Data API con RLS → procedure SQL atomiche e Edge Functions Deno. Le route React restano in `src/App.tsx`. Nessun database operativo nel localStorage.

Tutte le tabelle `desk_*` hanno RLS. `anon` non dispone di accesso alle tabelle. `authenticated` ha soltanto SELECT sulle tabelle previste, con policy; nessuna scrittura diretta o TRUNCATE. Le modifiche passano da procedure che verificano identità, ruolo e tenant. Importatori, lettura dei segreti Vault e worker sono riservati al servizio server. Le chiamate amministrative Edge verificano la sessione tramite Supabase; i worker verificano una credenziale macchina casuale conservata nel Vault. Il service role non viene esposto al browser.

Le modifiche schema sono state applicate attraverso il collegamento database. Le migrazioni della piattaforma non sono scritte manualmente. `tests/core-crm.sql` e `tests/services.sql` sono test con fixture annullate, non migrazioni.

Tenant iniziale `11111111-1111-4111-8111-111111111111`; fuso Europe/Rome; tre sedi da denominare; avvisi dello studio a segreteria@adrianosantorelli.it. Gli input manuali dei richiami usano il fuso del dispositivo, indicato nel modulo; la visualizzazione è Europe/Rome.

Job: `santorelli-promemoria`, `santorelli-email`, `santorelli-wordpress`, `santorelli-connettori` ogni minuto; `santorelli-riconciliazione` ogni tre ore. L’assenza di credenziali non consuma tentativi email. I fallimenti terminali dei connettori generano notifiche tecniche.

## Interventi esterni necessari

### Primo accesso e inviti

In Supabase → Edge Functions → Manage Secrets configurare:

- `DESK_APP_ORIGIN`: origine HTTPS pubblica effettiva.
- `DESK_BOOTSTRAP_EMAIL`: casella individuale del primo amministratore EmmeLab.
- `DESK_BOOTSTRAP_SECRET`: almeno 32 caratteri casuali, esclusivamente server.

Da un client server fidato invocare `desk-admin`, azione `bootstrap`, con l’header `x-bootstrap-secret`. Il bootstrap crea il primo Super Admin una sola volta con lock transazionale. Il destinatario imposta la password dal link Auth; nessuna password predefinita. Rimuovere il segreto di bootstrap dopo il successo. Mai inserire segreti o password in chat.

Allowlist Auth: URL assoluti di `/auth/callback` e `/reset-password` per preview e deployment. I template personalizzati devono rispettare RedirectTo. Configurare SMTP Auth e template italiani e collaudare inviti/reset. L’email Auth è distinta dalle email operative Resend.

### Email operative

Configurare `RESEND_API_KEY`, `DESK_EMAIL_FROM` con dominio verificato, `DESK_APP_ORIGIN`. Per le ricevute creare un webhook Resend verso `https://smbiewvuspweetdjbnwe.supabase.co/functions/v1/desk-email-events` e salvare `RESEND_WEBHOOK_SECRET`. Sottoscrivere almeno delivered, bounced, complained e delivery_delayed. Avviare il test dal pannello email del Super Admin e verificare la casella e la ricevuta firmata: accettazione non significa consegna.

### WordPress

Super Admin → Centro sincronizzazione → origine HTTPS esatta (attenzione a www) → predisposizione connessione. Trasferire ID e chiave mostrata una sola volta al pannello WordPress autorizzato, non alla chat. Scaricare ZIP, installarlo prima su staging, impostare i mapping e verificare la firma dal sito. Poi collaudare ogni modulo con contatti sintetici, duplicati, CRM offline e recupero. Il plugin non è stato installato o eseguito sul sito del cliente da questa consegna; i test del pacchetto non sostituiscono il collaudo PHP/Elementor. I log consegnati sono eliminati dopo 30 giorni; gli eventi falliti restano cifrati fino alla risoluzione. Conservare le chiavi WordPress nei backup.

### Meta e WhatsApp

Occorrono app, autorizzazioni e account reali. Il pannello accetta soltanto ID non segreti. Dopo aver creato la configurazione mostra il nome esatto del segreto token dedicato alla connessione:

`DESK_META_TOKEN_<ID_CONNessione_SENZA_TRATTINI_MAIUSCOLO>` oppure `DESK_WHATSAPP_TOKEN_<ID_SENZA_TRATTINI_MAIUSCOLO>`.

Configurare anche `DESK_META_APP_SECRET` / `DESK_META_VERIFY_TOKEN`, e gli equivalenti `DESK_WHATSAPP_*` per WhatsApp. Il token di verifica webhook deve avere almeno 32 caratteri. Usare token autorizzati e di portata minima, mai nel frontend. La procedura OAuth guidata e il rinnovo dei token non sono ancora implementati: il token server va gestito dall’amministratore autorizzato.

Endpoint: `desk-meta-webhook` e `desk-whatsapp-webhook` nel progetto Supabase. Abilitare le sottoscrizioni ufficiali leadgen della pagina e messages dell’account WhatsApp. Il test API controlla identità e sottoscrizione dell’app; il test Meta verifica i moduli nell’elenco iniziale di massimo 100 moduli della pagina. Per pagine più grandi va estesa la paginazione del controllo. Configurare la versione Graph effettivamente abilitata dall’app (il pannello propone v23.0, non assume automaticamente la versione più recente). Webhook, permessi e recupero storico vanno provati sui servizi reali.

### AlfaDocs

Da AlfaDocs → Impostazioni → Studio → Chiavi, ottenere una chiave autorizzata per l’archivio. Predisporre studio e archivio nel Centro sincronizzazione e impostare il segreto `DESK_ALFADOCS_TOKEN_<ID_CONNessione_SENZA_TRATTINI_MAIUSCOLO>` mostrato dal pannello. Il test verifica `/api/v1/me`. Verificare stati, timezone, cancellazioni, permessi e limiti con il fornitore; niente modifiche o prenotazioni sono inviate al sistema ufficiale.

## Parti di sviluppo ancora aperte

Queste non sono semplici credenziali mancanti e non vanno dichiarate completate:

- OAuth guidato e rinnovo token, invio ufficiale WhatsApp dal CRM, template approvati e gestione completa delle conversazioni/categorie amministrative.
- Ulteriori analisi oltre al confronto mensile e ai gruppi campagna disponibili: costi/ROI solo con dati economici autorizzati, storico reale delle transizioni e trend più estesi. Il CSV usa un mapping esplicito, non presume uno schema Pipelean mai fornito.
- Disponibilità/free-slot ufficiali, eventuale flusso di conferma attiva autorizzato e regole avanzate della lista d’attesa. Il modulo corrente non prenota, non invia conferme e non stabilisce idoneità.
- Eventuale motore di regole arbitrario oltre alle automazioni effettivamente configurabili. L’escalation 48 ore resta intenzionalmente non disattivabile.
- Pannello multi-studio e retention generale dei dati. Il supporto diagnostico limitato è implementato; l’accesso tecnico ad anagrafiche e note non è previsto da questo modulo.
- Sessioni HttpOnly/BFF, paginazione estesa e suite E2E browser con sessioni reali e concorrenza realmente parallela.

## Verifiche e limiti

I test SQL eseguiti con rollback hanno verificato import WP deduplicato, attribuzione, Meta idempotente, continuità WhatsApp senza cambiare origine, coda non assegnata senza prima gestione artificiale, aggiornamento/cancellazione AlfaDocs, lista d’attesa, lease email, ricevuta anticipata, esito obsoleto, popup/rinvio/doppia scheda, validazione configurazioni, unicità dei job e recupero lease. Sono state usate anche query con ruolo PostgreSQL authenticated effettivo per verificare l’assenza di lettura paziente da Super Admin. Questo non sostituisce sessioni REST/JWT reali né una prova realmente parallela.

Controllo catalogo: RLS attiva su tutte le tabelle applicative, nessun accesso anon alle tabelle, nessun privilegio di scrittura/TRUNCATE ai client e nessuna funzione desk pubblicamente eseguibile da anon.

Test automatici frontend: struttura ZIP, integrità PHP/istruzioni nel pacchetto, rifiuto di file errore, presenza delle protezioni del plugin, compatibilità lista d’attesa e ora legale Europe/Rome. La build esegue i test prima della compilazione. Questi controlli non eseguono PHP o un’istanza WordPress.

Prove HTTP negative: WordPress privo di firma rifiutato con 401; ricevute email senza segreto restituiscono 503. Nel controllo successivo gli endpoint desk-connectors, desk-meta-webhook e desk-whatsapp-webhook restituiscono ancora 404: il loro collaudo HTTP non è superato e richiede verifica della distribuzione automatica. WordPress rifiuta POST senza firma con 401; desk-email rifiuta chiamate anonime con 401; email-events restituisce 503 senza segreto e desk-admin 503 senza origine HTTPS. I soli segreti presenti sono quelli preconfigurati Supabase: non sono disponibili credenziali esterne per un collaudo positivo. Le funzioni sono gestite dalla piattaforma, non richiedono deployment CLI da parte dell’utente.

Prima dell’uso reale: test inviti/reset e ruoli live, consegna email e webhook reali, WordPress staging, comportamento con rete interrotta e recupero, monitoraggio errori, privacy/DPA/regione dati, backup/PITR secondo il piano e prova di ripristino con RPO/RTO definiti. Non è stata certificata la conformità GDPR né attivato/verificato il piano di backup da questa iterazione. Non inviare dati clinici a Meta o servizi AI.

Il frontend richiede HTTPS e fallback SPA verso index.html. Il sito pubblico e gli account esterni non sono stati modificati.

## Regressioni dei moduli avanzati

`tests/advanced-modules.sql` conserva i test eseguiti con fixture sintetiche e rollback: import Admin-only e ripetizione senza duplicati; report storico incluso/escluso; classificazione senza prima gestione; applicazione reale del preavviso a 90 minuti e disattivazione email richiamo; escalation live con testo configurato; esclusione dello storico; rifiuto dei segnaposti paziente; supporto senza lettura diretta di anagrafiche/richieste anche con ruolo PostgreSQL authenticated effettivo; revoca immediata lato server e audit della consultazione. Le nuove tabelle hanno RLS attiva, nessun accesso anon e nessuna scrittura client diretta. Nessuna fixture di collaudo è rimasta nel database.

I test frontend aggiunti coprono BOM, delimitatori, virgolette, multilinea, zeri iniziali, colonne scartate, ID duplicati, date e fusi, fonti/stati sconosciuti e modello. Non sostituiscono il collaudo di un export Pipelean reale fornito e autorizzato dallo studio.

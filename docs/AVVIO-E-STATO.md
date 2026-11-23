# Santorelli Desk — avvio tecnico e stato della consegna

## Stato reale

Questa iterazione è un primo nucleo CRM persistente, non la consegna completa delle tre fasi. Il database iniziale non contiene dati paziente e non è stato creato alcun account pubblico o password predefinita.

### Implementato

- React/TypeScript, interfaccia italiana responsive e accesso Supabase Auth.
- Accesso per invito, recupero password e callback `/auth/callback`, `/reset-password`.
- PostgreSQL con RLS, isolamento tenant e ruoli controllati dal server.
- Segretaria: richieste proprie e coda non assegnata; Admin Studio: tutte le richieste del proprio tenant; Super Admin: metadati tecnici, senza lettura di contatti/richieste/attività dei pazienti.
- Contatti separati dalle richieste; creazione manuale assegnata all’autrice, presa in carico con lock di riga, riassegnazione Admin, esiti amministrativi e cronologia immutabile tramite interfaccia.
- Richiami con scadenza obbligatoria futura; non risponde registra il tentativo e mantiene aperta la richiesta.
- Pianificatore PostgreSQL `santorelli-promemoria`, ogni minuto, indipendente dal browser.
- Promemoria in-app prima della scadenza (30 minuti) e alla scadenza; escalation 48 ore dalla ricezione, deduplicata. Apertura, assegnazione e pianificazione richiamo non sono prima gestione.
- Coda persistente delle email operative, con stato esplicito `in_attesa_configurazione`. **Non è presente un worker di invio: nessuna email di promemoria viene spedita.**
- Analisi iniziale mensile per coorte di creazione, richieste, ID contatti unici, prime gestioni e stato appuntamento corrente; CSV senza dati di contatto e con protezione da formule.
- Inviti personale mediante funzione protetta `desk-admin`; richiedono configurazione dei segreti e del servizio email Auth.

### Non implementato / non verificato

- Provider email transazionale operativo, worker, ricevute, retry di consegna e mittente verificato.
- Adattatori Meta, WhatsApp, Elementor e AlfaDocs, webhook, OAuth, sincronizzazioni, popup tre ore, ZIP WordPress e importazione Pipelean CSV.
- Deduplicazione contatti automatica: contatti manuali separati non vengono uniti; il KPI conta gli ID registrati, non deduce identità da nomi o numeri simili.
- Agenda ufficiale, disponibilità, conferme, lista d’attesa, no-show, storico campagne e confronti mensili avanzati.
- Personalizzazione automazioni, modifica sedi e profili, sospensione utenti, supporto temporaneo auditato, retention automatica e pannello multi-studio.
- Sessioni applicative server-side con cookie HttpOnly/BFF. L’implementazione corrente usa sessioni client Supabase; il relativo storage non è il database operativo.
- Suite E2E browser/login, collaudo email, verifica concorrenza con due connessioni realmente parallele e test mobile su dispositivi reali.
- Verifica form Elementor del sito, autorizzazioni live e storico disponibile delle piattaforme esterne.

## Architettura

Frontend Vite/React → Supabase Auth e API PostgreSQL con RLS → funzioni SQL atomiche. Funzione Edge `desk-admin` per privilegi amministrativi. Il runtime delle Edge Functions è Deno, non un server Node/Prisma dedicato: è stata scelta l’infrastruttura Supabase disponibile. Tutte le scritture operative client passano da `desk_command`; le tabelle operative non hanno grant di scrittura per authenticated/anon.

Tabelle: `desk_tenants`, `desk_members`, `desk_sites`, `desk_contacts`, `desk_inquiries`, `desk_tasks`, `desk_activity`, `desk_notifications`, `desk_escalations`, `desk_email_outbox`. Le modifiche schema sono state applicate direttamente tramite il collegamento database; le migrazioni sono gestite dalla piattaforma, non da file manuali in supabase/migrations.

Tenant iniziale: `11111111-1111-4111-8111-111111111111`. Fuso Europe/Rome, tre sedi da denominare, avvisi a segreteria@adrianosantorelli.it. Date dei richiami: input nell’orario locale del dispositivo; visualizzazione esplicita in Europe/Rome. Le scadenze sono memorizzate come timestamptz.

## Bootstrap EmmeLab

Configurare nella gestione segreti Supabase Edge Functions:

- `DESK_APP_ORIGIN`: origine HTTPS pubblica effettiva, senza percorsi arbitrari.
- `DESK_BOOTSTRAP_EMAIL`: casella individuale del primo amministratore EmmeLab.
- `DESK_BOOTSTRAP_SECRET`: segreto casuale di almeno 32 caratteri, esclusivamente server-side.

Non inserire questi segreti nell’interfaccia frontend, nel repository o in chat.

Da un client server fidato invocare con POST `https://smbiewvuspweetdjbnwe.supabase.co/functions/v1/desk-admin`, JSON `{"action":"bootstrap"}`, header `x-bootstrap-secret` con il segreto configurato. La funzione usa i segreti server Supabase preconfigurati. Il profilo iniziale è creato una sola volta con lock transazionale; inviti concorrenti perdenti vengono revocati. Rimuovere il segreto di bootstrap dopo il successo. Il primo account riceve un invito Auth e imposta autonomamente la password. Non esiste un utente Super Admin selezionabile pubblicamente.

Registrare nell’allowlist Supabase Auth gli URL assoluti di `/auth/callback` e `/reset-password` per ogni origine di preview/deployment. I template personalizzati devono rispettare RedirectTo. Configurare SMTP Auth e template in italiano prima degli inviti reali: i template predefiniti del provider non vengono considerati localizzati o collaudati da questa consegna. La funzione restituisce errore se l’origine HTTPS non è configurata.

Dopo l’accesso, il Super Admin può invitare un Admin Studio dalla sezione Impostazioni. Admin e Super Admin possono invitare segretarie; l’Admin non può creare altri Admin. Nessun utente sceglie autonomamente il proprio ruolo. La gestione di un’email già presente richiede intervento tecnico: non sono riassegnati account preesistenti automaticamente.

## Verifiche svolte

Un test SQL con fixture sintetiche annullate ha verificato assegnazione manuale iniziale, isolamento tra segretarie, restrizione del Super Admin, isolamento tra tenant, doppia presa in carico sequenziale, gestione valida, richiamo futuro obbligatorio e deduplicazione escalation/email. Nessuna fixture rimane nel database. `tests/core-crm.sql` contiene una versione ripetibile dei test operativi principali. Il test invoca le medesime funzioni di autorizzazione; non sostituisce un collaudo REST con JWT per ogni ruolo.

## Checklist prima di dati paziente

1. Completare l’invio email reale e testarne consegna, errori, retry e deduplicazione.
2. Collaudare RLS tramite sessioni reali di tutti i ruoli e tenant distinti; eseguire test concorrenti e E2E.
3. Valutare sessioni HttpOnly/BFF, MFA, limiti di tentativi, timeout, CSP e protezioni dell’hosting. I limiti Auth del provider non equivalgono a un rate limiting completo delle funzioni amministrative.
4. Configurare SMTP e template Auth italiani; verificare inviti e reset per l’origine pubblicata.
5. Verificare regione dati, contratti responsabili, basi giuridiche, minimizzazione, retention, registri e valutazione privacy con il consulente dello studio. L’app non certifica la conformità GDPR.
6. Configurare backup automatici, disponibilità PITR secondo il piano Supabase e provare un ripristino isolato; definire RPO/RTO e responsabili. I backup non sono stati attivati/verificati da questa iterazione.
7. Monitorare cron, coda email e errori funzione senza raccogliere contenuti sensibili. Nessun trattamento o contenuto clinico va trasmesso a Meta o servizi AI.
8. Servire la build frontend con HTTPS e fallback SPA verso index.html per le route React. Limitare l’accesso all’ambiente di collaudo. La compilazione non sostituisce il collaudo operativo.

Il sito pubblico è solo un riferimento: nessuna modifica è stata apportata a WordPress o agli account esterni.

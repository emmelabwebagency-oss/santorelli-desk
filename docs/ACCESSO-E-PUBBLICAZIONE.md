# Accesso con codice email e pubblicazione

## Architettura attuale: Resend API, non SMTP

- Il frontend richiede un codice a `desk-login` e verifica quello inserito con `supabase.auth.verifyOtp({ type: 'email' })`.
- Il backend applica l’allowlist delle origini, autorizza solo membri attivi e impone cooldown di 60 secondi e limite globale di 120 richieste/minuto con `desk_login_request`.
- Supabase Auth genera il codice tramite `auth.admin.generateLink({type:'magiclink'})`. Non viene richiesto alcun invio SMTP.
- Il backend consegna soltanto il codice a Resend con API HTTPS. Codici, link, chiavi e sessioni non vengono restituiti al chiamante né registrati nei log.
- `RESEND_API_KEY` resta nei segreti Edge. Mittente: `Santorelli Desk <desk@adrianosantorelli.it>`, dominio verificato su Resend.
- Template Magic Link e SMTP Supabase non sono usati per questi codici e inviti. Rimangono rilevanti soltanto per eventuali operazioni avviate dal pannello Supabase o precedenti flussi di recupero password.
- Le risposte pubbliche non rivelano l’esistenza dell’indirizzo; un errore di generazione/consegna viene registrato solo sul server, senza contenuti sensibili. L’accettazione Resend non è prova della consegna in inbox.
- Il campo OTP accetta da 6 a 10 cifre, secondo la configurazione Supabase. Scadenza e limiti di verifica sono gestiti da Supabase Auth.

## Primo Super Admin

L’unica identità predisposta per il bootstrap è `info@emmelab.it`, su richiesta del titolare. Finché non esiste alcun Super Admin, una richiesta del codice per questa casella può creare l’account Auth e il profilo iniziale. Il ruolo non viene scelto dal browser.

`desk_bootstrap_member` è eseguibile solo da service_role, verifica l’email dell’account e usa un lock transazionale: non può essere usato per altre email o dopo il primo bootstrap. Un profilo già sospeso non viene riattivato automaticamente. Il codice viene inviato solo alla casella autorizzata; il possesso dell’indirizzo è verificato all’accesso tramite Supabase Auth.

Non occorrono `DESK_BOOTSTRAP_SECRET`, inviti dal pannello Supabase o password condivise in chat. La registrazione pubblica va comunque mantenuta disabilitata nelle impostazioni Auth. Le policy richiedono un profilo attivo anche se esistono altri account Auth.

## Gestione utenti dal sito

In Impostazioni sono disponibili inviti, gestione nomi e sedi, assegnazione dei ruoli e sospensione/riattivazione.

- Solo Super Admin assegna tutti i ruoli: segretaria, admin, super_admin.
- Gli Admin possono invitare e gestire la segreteria secondo le restrizioni esistenti, non elevare ruoli.
- `desk-admin` verifica il JWT, il profilo attivo e lo studio prima di creare l’account con `auth.admin.createUser`. Il ruolo è salvato prima dell’invio tramite Resend.
- L’invito contiene l’URL della pagina di accesso: l’utente richiede il proprio codice, senza impostare password.
- Se la notifica fallisce dopo l’abilitazione, il profilo viene conservato e l’interfaccia lo segnala: non ripetere la creazione. L’utente può richiedere il codice dalla pagina di accesso.
- `desk_update_member` controlla Super Admin e isolamento tenant, registra l’audit e impedisce di sospendere o declassare l’ultimo Super Admin attivo.
- Il ruolo Super Admin non concede accesso generale alle richieste dei pazienti.

## Origini e callback

Origine pubblica predefinita: `https://desk.adrianosantorelli.it`. `DESK_APP_ORIGIN` può sostituirla; deve essere un’origine HTTPS fidata.

`DESK_AUTH_ALLOWED_ORIGINS` consente ulteriori origini esatte separate da virgola, senza wildcard o percorsi. HTTP è consentito solo per localhost esplicitamente autorizzati. L’origine di preview non è autorizzata automaticamente.

Nelle Redirect URLs Supabase autorizzare gli URL assoluti `/auth/callback` e `/reset-password` per le origini effettivamente usate. La home senza sessione apre `/accesso`; le route sono in `src/App.tsx`. La richiesta del codice non dipende dal Site URL di fallback. Il precedente recupero password resta separato e richiede il suo servizio email.

## Pubblicazione

Il frontend usa Vercel; dominio principale, DNS e posta restano su Netsons. Non spostare WordPress, MX o nameserver. `vercel.json` contiene il fallback SPA. Le modifiche al frontend devono essere sincronizzate nel repository collegato a Vercel per comparire sul dominio pubblico; la verifica della build locale non certifica un deployment live.

Per cambi DNS futuri usare soltanto i valori effettivamente richiesti da Vercel e Resend. I record del sottodominio `desk` e quelli di autenticazione del mittente sono distinti.

## Collaudo

Verificare richiesta e ricezione codice, codice errato/scaduto, accesso membro attivo, rifiuto membro sospeso, cooldown, isolamento studio e divieto di elevazione ruolo. I test sintetici SQL devono effettuare rollback e non inviare email. Un test reale richiesto dall’utente invia soltanto alla sua casella autorizzata; non leggere o riportare il codice in chat.

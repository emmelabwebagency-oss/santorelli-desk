# Accesso con codice email e pubblicazione

## Flusso implementato

L’indirizzo principale apre `/accesso` quando non esiste una sessione. Il login ordinario non chiede password:

1. La persona inserisce l’email.
2. `desk-login` verifica sul server che esista un account Supabase associato a un membro attivo. Non viene mai creato automaticamente un nuovo account.
3. Solo se autorizzato, Supabase Auth invia il codice monouso.
4. Il browser verifica il codice tramite `verifyOtp` di Supabase. Non vengono generati o verificati codici applicativi fatti in casa.
5. La sessione carica il profilo attivo e mantiene il relativo ruolo e le policy RLS. Una sessione senza profilo attivo non ottiene accesso ai dati.

L’autorizzazione deriva da `desk_members`, non da un elenco inserito nel browser. Sono riusati i profili esistenti: nessuna nuova tabella profili e nessuna scelta pubblica del ruolo. L’aggiunta di personale continua a essere effettuata dal processo amministrativo protetto. Gli inviti nuovi tornano su `/auth/callback`; `/reset-password` resta compatibile con i precedenti link.

Le risposte alle richieste non rivelano se un indirizzo sia registrato. Per indirizzo c’è un intervallo server di 60 secondi; il volume complessivo è limitato a 120 richieste/minuto. Il registro contiene soltanto hash email e timestamp, con rimozione al successivo utilizzo dei dati più vecchi di 24 ore. Non conserva codici, token o email in chiaro. RLS attiva, accesso esclusivamente service_role. I limiti di verifica OTP sono quelli di Supabase Auth; configurarli e collaudarli prima del rilascio.

## Configurazione necessaria in Supabase

### Email con il codice, non soltanto un link

In Authentication → Email Templates → Magic Link impostare un oggetto italiano, ad esempio «Il tuo codice di accesso a Santorelli Desk», e un template con `{{ .Token }}`:

```html
<h2>Accedi a Santorelli Desk</h2>
<p>Inserisci questo codice nella schermata di accesso:</p>
<p style="font-family:Arial,Helvetica,sans-serif;font-size:28px;font-weight:bold;letter-spacing:6px">{{ .Token }}</p>
<p>Il codice è personale e monouso. Non condividerlo.</p>
<p>Se non hai richiesto l’accesso, ignora questa email.</p>
```

Impostare la lunghezza OTP a 6 cifre, coerente con l’interfaccia, e una scadenza breve appropriata (ad esempio 10 minuti). Configurare SMTP con mittente autorizzato; il servizio Auth è distinto da Resend per le notifiche operative. Disabilitare la registrazione pubblica nelle impostazioni Auth. Il frontend usa `shouldCreateUser:false` e richiede il membro attivo sul server, ma le impostazioni pubbliche del provider vanno verificate anche indipendentemente dall’interfaccia.

Queste impostazioni gestite non sono state modificate dai collegamenti disponibili in questa iterazione. Non è stata eseguita una prova di consegna reale. Il codice non compare nell’email se il template continua a contenere soltanto `{{ .ConfirmationURL }}`.

### Origini e callback

Nei segreti Edge:

- `DESK_APP_ORIGIN`: origine pubblica esatta, ad esempio `https://desk.adrianosantorelli.it` dopo il collegamento DNS.
- `DESK_AUTH_ALLOWED_ORIGINS`: origini aggiuntive esatte, separate da virgola, per esempio l’URL Vercel iniziale o l’origine di preview. Niente wildcard e niente percorsi. Un’origine HTTP è accettata solo per localhost/127.0.0.1 esplicitamente autorizzati.

Registrare anche gli URL assoluti `/auth/callback` e `/reset-password` di ciascuna origine nelle Redirect URLs di Supabase Auth. `desk-login` costruisce `emailRedirectTo` soltanto dall’origine browser appartenente all’allowlist server; non usa un callback arbitrario fornito nel corpo o un Site URL di ripiego.

Primo Super Admin previsto: `info@emmelab.it`. Il bootstrap protetto resta necessario: non è stato aggirato creando un ruolo in base all’email nel frontend. Non sono stati creati account reali o inviate email di test da questa iterazione.

## Vercel e Netsons: due collegamenti distinti

**Progetto/codice → Vercel → sottodominio gestito da Netsons.** Non si trasferiscono dominio, email, database o WordPress.

### Collegare il progetto a Vercel

Percorso standard Dyad, verificato nella guida https://www.dyad.sh/docs/getting-started/publishing-your-app:

1. Creare un repository GitHub privato per il progetto.
2. Nella scheda app Dyad premere Connect to GitHub e selezionare il repository, quindi Sync to GitHub.
3. In Vercel aprire Add New → Project / https://vercel.com/new, autorizzare GitHub e importare quel repository. Se non appare, concedere a Vercel l’accesso al repository nelle autorizzazioni dell’integrazione GitHub.
4. Confermare Framework Preset Vite, directory radice del progetto e output `dist`. Lo script di build già presente esegue test e compilazione. `vercel.json` contiene già il fallback SPA.
5. Premere Deploy e verificare prima l’URL `vercel.app`, incluso `/accesso`. La pagina si può vedere anche prima che SMTP e bootstrap siano configurati; non è una prova di login riuscito.

Il collegamento amministrativo Vercel è distinto dall’integrazione GitHub di Vercel. Nel controllo corrente gli strumenti Vercel sono disponibili, ma la lettura progetti restituisce 403 per lo spazio `emmelab`: manca il permesso per quel team nella connessione. Il tentativo di ottenere il link di autorizzazione del team è andato in timeout; non è stato ricevuto un link utilizzabile e non è stato creato alcun deployment. Non occorre trasmettere token o password in chat. Autorizzare l’accesso al team corretto oppure usare il percorso standard di importazione sopra descritto.

### Collegare il sottodominio Netsons

Solo dopo che il deployment Vercel funziona:

1. In Vercel → progetto → Settings → Domains aggiungere `desk.adrianosantorelli.it`.
2. Copiare il target CNAME esatto mostrato per quel progetto. Non sostituirlo con un indirizzo generico o inventato.
3. In Netsons → cPanel → Zone Editor → gestire `adrianosantorelli.it`, sostituire il record A del solo hostname `desk` con il CNAME richiesto da Vercel. Non lasciare record A/AAAA o un secondo CNAME in conflitto sullo stesso hostname.
4. Non modificare il dominio principale, i nameserver generali, i record MX o il sito WordPress. Se Vercel chiede anche una verifica TXT, aggiungere soltanto nome e valore esatti forniti da Vercel.
5. Attendere lo stato Valid Configuration e il certificato HTTPS di Vercel. Il certificato Netsons precedentemente attivato non pubblica automaticamente l’app e non viene trasferito.
6. Configurare le origini/callback Supabase e collaudare email, codice, accessi autorizzati e rifiuto dei profili sospesi sull’URL finale.

Guida Vercel: https://vercel.com/docs/domains/working-with-domains/add-a-domain . Nessun record DNS è stato modificato da questa iterazione.

## Verifiche effettuate

`tests/email-login.sql` verifica, con soli dati sintetici e rollback, email sconosciuta, account senza profilo, membro sospeso, normalizzazione dell’email, cooldown, sospensione immediata lato server e assenza di accesso client al registro/procedura. Non contatta il provider e non invia codici. La consegna email, il template e la verifica OTP end-to-end restano da collaudare con configurazione reale.

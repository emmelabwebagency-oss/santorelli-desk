# Meta Lead Ads e invii WhatsApp — configurazione e collaudo

## Stato effettivo

Sono implementati OAuth Meta Lead Ads e invii WhatsApp amministrativi con modelli ufficiali statici. Sono verificati SQL, grant e RLS con fixture annullate. Non sono disponibili credenziali esterne per certificare autorizzazione, invio e consegna reali. I nuovi endpoint vengono distribuiti dalla piattaforma; non richiedono deployment CLI dell’utente.

I precedenti 404 di worker e webhook sono risolti: worker 401 senza credenziale macchina; webhook 503 senza segreti di firma. Nessuno dei due esiti significa account collegato.

## OAuth Meta Lead Ads

### Configurazione esterna

Nei segreti Supabase Edge Functions:

- `DESK_APP_ORIGIN`: origine HTTPS pubblica dell’app, senza percorso, query, credenziali o frammento.
- `DESK_META_APP_ID`: ID numerico dell’app, uguale a quello nella connessione.
- `DESK_META_APP_SECRET`: segreto dell’app.
- `DESK_META_VERIFY_TOKEN`: almeno 32 caratteri casuali per verificare la sottoscrizione webhook.

Registrare come callback OAuth valido nell’app Meta:

`https://smbiewvuspweetdjbnwe.supabase.co/functions/v1/desk-meta-oauth`

Sono richiesti i permessi per pagine, lead, sottoscrizioni e attribuzione pubblicitaria: `pages_show_list`, `pages_read_engagement`, `pages_manage_metadata`, `pages_manage_ads`, `leads_retrieval`, `ads_management`. Verificare disponibilità per prodotto/tipo di app, review, business verification, accesso avanzato e assegnazione dei lead nel servizio Meta. Un login riuscito non aggira nessuno di questi vincoli. Per pagine/prodotti che richiedono un diverso onboarding Meta, verificare la configurazione con il fornitore prima del rilascio.

### Flusso applicativo

1. Super Admin → Centro sincronizzazione → predisporre pagina, app, versione Graph abilitata e moduli.
2. Premere **Collega Meta**. Una sessione Supabase verificata e il ruolo tecnico attivo sono obbligatori.
3. Il server crea uno stato casuale, conserva soltanto l’hash, scadenza 10 minuti e vincolo a operatore/configurazione. Iniziare una nuova autorizzazione dello stesso operatore invalida la precedente.
4. Meta torna al callback pubblico. Lo stato viene consumato una sola volta. Il callback non dipende da una sessione del browser né da redirect forniti dal client; torna solo all’origine configurata sul server.
5. Il server scambia il codice, ottiene un token utente esteso e cerca il token della sola pagina configurata. Non conserva il token utente. Controlla validità, app e permessi del token pagina. La ricerca ha un limite di 100 pagine API da 100 elementi.
6. Il token pagina è cifrato in Supabase Vault, non nel browser o in una tabella leggibile dal client. La UI vede soltanto date e scadenze. Codice, token e risposte complete Meta non vengono scritti nei log applicativi.
7. OAuth non marca l’API come verificata: eseguire **Test API** e verificare la sottoscrizione leadgen. Poi inviare un lead sintetico autorizzato e controllare la catena webhook → evento → richiesta senza doppioni.

Non esiste un refresh token standard da rinnovare in background per questo flusso Facebook Login. Sono disponibili **Riautorizza pagina**, controlli delle scadenze indicate dal provider e invalidazione della verifica se Graph segnala revoca/scadenza. Una scadenza non indicata non viene inventata e non significa autorizzazione irrevocabile.

**Scollega OAuth** cancella il segreto nel Vault e sospende localmente il connettore. Non elimina la sottoscrizione dell’app presso Meta e non revoca automaticamente autorizzazioni eventualmente condivise da altre risorse; gestirle nel servizio ufficiale. Modificare identità/configurazione del connettore elimina la credenziale OAuth precedente e invalida gli stati aperti. Una semplice sospensione senza cambio configurazione conserva il token, salvo disconnessione esplicita.

Un token manuale `DESK_META_TOKEN_<ID_CONNessione_SENZA_TRATTINI_MAIUSCOLO>` resta un’alternativa server, non viene usato se è presente una credenziale OAuth. Dopo una migrazione, rimuovere i token manuali non più necessari dai segreti server.

## WhatsApp ufficiale

### Prerequisiti

- Account WhatsApp Business e numero autorizzato, con app sottoscritta ai messaggi/stati.
- Token Business/system user con i permessi effettivi `whatsapp_business_management` e `whatsapp_business_messaging`, dedicato alla connessione e salvato nel segreto indicato dal Centro sincronizzazione.
- `DESK_WHATSAPP_APP_SECRET` e `DESK_WHATSAPP_VERIFY_TOKEN` per le verifiche.
- Il test API verifica identità del numero, appartenenza all’account Business configurato e sottoscrizione dell’app; la ricerca dell’appartenenza è limitata a 20 pagine da 100 numeri.
- Modelli creati e approvati nel servizio ufficiale Meta/WhatsApp. Il token pagina Facebook non sostituisce il token WhatsApp. Embedded Signup WhatsApp non è implementato.

### Catalogo e approvazione dello studio

In **Impostazioni → Modelli WhatsApp autorizzati**, Admin o Super Admin può aggiornare il catalogo dal servizio ufficiale. Sono importati soltanto modelli:

- `UTILITY` e `APPROVED`;
- con body testuale statico;
- con eventuali header/footer testuali statici;
- senza variabili, allegati, media, pulsanti o componenti non riconosciuti.

Il catalogo gestisce al massimo 2.000 modelli remoti. Se la paginazione non è completa, non modifica il catalogo locale. I modelli mancanti diventano non disponibili. Un fingerprint del testo/struttura/lingua impedisce di conservare l’approvazione dopo modifiche. Cambiare configurazione del connettore disabilita le approvazioni precedenti.

Solo l’**Admin Studio**, non il Super Admin, può approvare l’uso amministrativo di un modello dopo aver controllato che non riveli informazioni sanitarie e offra un canale di opt-out. Non è un controllo semantico automatico né una certificazione privacy. Aggiornare il catalogo almeno ogni sette giorni. Ogni invio ricontrolla sul provider stato, categoria, struttura e fingerprint.

### Invio esplicito

Nella scheda di una richiesta assegnata: **Invio ufficiale WhatsApp**.

1. L’assegnataria o l’Admin seleziona il modello, vede il testo e il destinatario.
2. Serve un numero internazionale con `+`; non viene presunto un prefisso nazionale.
3. È obbligatorio indicare il codice del consenso documentato e confermare questo singolo invio. Il codice è un riferimento: la prova del consenso deve essere conservata dallo studio nel registro autorizzato. Non mettere dati personali o clinici nel codice.
4. Il database accoda una sola operazione per ID richiesta client. Una ripetizione della stessa operazione non crea un secondo invio. Sono bloccati invii equivalenti recenti per lo stesso numero e nuovi invii in presenza di un esito incerto non risolto.
5. Il cron server `santorelli-whatsapp-invii`, ogni minuto, acquisisce fino a tre operazioni. La funzione verifica la credenziale macchina dal Vault; un JWT del browser non abilita il worker.
6. Prima del POST, il server ricontrolla ruolo attivo, assegnazione, stato richiesta, numero ancora invariato, preferenze del recapito, connessione, modello approvato e versione remota. Non invia oggetto, nome, note o dati clinici della richiesta. Trasmette al provider soltanto destinatario e identificativi del modello statico.
7. Finché un’operazione è in coda si può annullare. Gli invii già in corso possono essere già partiti e non sono annullabili con certezza.

Questa modalità usa sempre modelli approvati, anche dentro la finestra di servizio; non implementa messaggi liberi o calcola una finestra di 24 ore per autorizzarli. Le tariffe e i limiti del provider restano applicabili.

### Esiti e ricevute

- **In coda / in corso**: nessuna consegna confermata.
- **Accettato dal provider**: è arrivato un ID ufficiale, non una prova di consegna.
- **Consegnato / letto / consegna fallita**: derivano dal webhook firmato. Sono gestite anche ricevute arrivate prima della risposta API salvata; gli stati non regrediscono da letto/consegnato a inviato.
- **Non riuscito**: controlli pre-invio non superati o rifiuto HTTP 4xx esplicito.
- **Esito incerto**: timeout, 5xx, risposta non conclusiva o worker interrotto. Non viene ritentato automaticamente. Sono bloccati nuovi invii a quel numero finché un operatore autorizzato non verifica il servizio ufficiale e registra esito/riferimento della verifica. «Invio riscontrato manualmente» resta distinto da una ricevuta del provider; non simula la consegna. Dichiarare «non inviato» consente una nuova operazione esplicita, non la avvia automaticamente.

L’outbox conserva la versione statica del modello confermato, destinatario, autore, riferimento del consenso ed esiti, protetti dalla stessa accessibilità della richiesta. Il Super Admin non può leggere destinatari o outbox paziente. La cronologia non archivia i testi in ingresso. Non vengono chiusi automaticamente richiami né impostata una prima gestione a partire da un invio accettato: registrare l’esito umano effettivo con le azioni operative esistenti.

### Opt-out

**Blocca invii per questo numero** registra il blocco per l’intero recapito nello studio e annulla gli invii ancora in coda. Le parole esatte STOP, ANNULLA o BASTA, ricevute via webhook firmato, sono riconosciute transitoriamente per attivare lo stesso blocco senza archiviare il testo né creare una nuova richiesta da quel messaggio. Altre formulazioni non sono classificate automaticamente: l’operatore deve registrare il blocco manualmente.

Riabilitare richiede un nuovo riferimento di consenso documentato e lascia traccia dell’autore. Un opt-out arrivato mentre il provider sta già elaborando un POST non può richiamare un messaggio partito; impedisce i successivi invii.

## Collaudo ancora necessario

Con soli dati sintetici e destinatari di test autorizzati:

- consentire/rifiutare OAuth, stato scaduto/ripetuto e perdita dei permessi;
- verificare review, pagina, accesso lead e sottoscrizione webhook reali;
- aggiornare catalogo, approvare un modello e sospenderlo/modificarlo presso Meta;
- inviare al numero di test, verificare ID e webhook di consegna/lettura;
- simulare interruzione e verificare che un esito incerto non sia reinviato;
- provare STOP e annullamento coda, sospensione operatore, riassegnazione e numero corretto prima dell’invio;
- verificare sessioni JWT reali per tutti i ruoli, privacy/DPA, backup e monitoraggio.

`tests/oauth-whatsapp.sql` e i test unitari del filtro sono regressioni, non sostituiscono questo collaudo. Non sono state effettuate autorizzazioni o consegne reali in questa iterazione.

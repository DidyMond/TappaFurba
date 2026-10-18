# Attribuzioni e note legali

TappaFurba usa dati, servizi, marchi e font di terzi. Questa pagina elenca cosa viene da dove, con quale licenza e che cosa devi fare se pubblichi una tua istanza.

TappaFurba **non è affiliato, sponsorizzato o approvato** dal Ministero delle Imprese e del Made in Italy (MIMIT), da Mapbox o dai titolari dei marchi dei distributori citati.

## Dati dei prezzi: MIMIT, Osservaprezzi Carburanti (IODL 2.0)

I prezzi e l'anagrafica degli impianti sono **open data del MIMIT**, rilasciati con licenza **[IODL 2.0](https://www.dati.gov.it/iodl/2.0/)** (Italian Open Data License v2.0).

- **Fonte:** [Carburanti: prezzi praticati e anagrafica degli impianti](https://www.mimit.gov.it/it/open-data/elenco-dataset/carburanti-prezzi-praticati-e-anagrafica-degli-impianti) (due file CSV, aggiornati ogni mattina e caricati dall'ingestione).
- **Cosa fa TappaFurba con questi dati:** li scarica, li normalizza (tipi di carburante, prezzi anomali scartati), li combina con il percorso e li ordina. Sono quindi **rielaborati**: le cifre mostrate sono quelle dichiarate dai gestori, ma l'ordinamento, i risparmi e le deviazioni sono calcoli dell'app, non dati ufficiali.
- **Attribuzione (obbligo della licenza):** nell'app compare «MIMIT Osservaprezzi» con la data del file; nelle Impostazioni → «Notifiche & Dati di Sistema» è indicata la fonte. Se pubblichi una tua istanza, mantieni la citazione della fonte e della licenza, e non lasciar intendere che il MIMIT approvi il tuo servizio.
- **Esattezza:** i prezzi sono dichiarati dai gestori e possono essere cambiati nel frattempo. Il file giornaliero fotografa lo stato alle 8 del giorno precedente. L'app mostra sempre la data del prezzo e non garantisce che il prezzo in cassa sia quello indicato.

## Note sulle fonti

Per avere prezzi più freschi del file giornaliero, prima di ogni ricerca l'API interroga per zona il **sito dell'Osservaprezzi** (`carburanti.mise.gov.it`, servizio `ospzApi`, lo stesso che alimenta il sito pubblico del ministero).

- **Non è un'API pubblica documentata.** Non c'è un accordo formale per il suo uso da parte di applicazioni terze: può cambiare o essere limitata senza preavviso, e risponde con HTTP 429 se riceve troppe richieste.
- **Come ci si comporta:** pochissime chiamate (riquadri di 14 km con cache condivisa di 60 minuti, al massimo 3 in parallelo e 40 per ricerca), pausa automatica su 429, interruttore dopo errori ripetuti, e uno **User-Agent identificativo** (`LIVE_PRICES_USER_AGENT`, con un contatto) perché il gestore sappia chi chiama.
- **Se gestisci un'istanza:** imposta un contatto reale nello User-Agent, non alzare i limiti, e valuta di scrivere al ministero (l'indirizzo dichiarato nella descrizione del servizio è `osservaprezzi@mise.gov.it`) per chiedere un accesso ufficiale. Con `LIVE_PRICES_PROVIDER=off` l'app funziona solo con i CSV open data (1–2 giorni di ritardo).

## Loghi delle bandiere dei distributori

I loghi mostrati accanto ai distributori (`apps/web/public/brands`, 355 file) sono **marchi dei rispettivi titolari**. Vengono dal servizio `registry/alllogos` dello stesso Osservaprezzi del MIMIT, scaricati **una tantum** con `pnpm --filter @tappafurba/web fetch:brands` e distribuiti come file statici (a runtime l'app non contatta la fonte). La mappa nome → file è in `apps/web/src/lib/brands.json`, con data e impronta del download.

- **Non sono coperti dalla licenza IODL 2.0**, che riguarda i dati, non i marchi. Sono mostrati in modo **referenziale** (il logo accanto al nome del distributore che porta quel marchio, come fa lo stesso sito del ministero), senza alcuna indicazione di affiliazione.
- **Attribuzione in app** (Impostazioni → «Notifiche & Dati di Sistema»): «Loghi: marchi dei rispettivi titolari, forniti dall'Osservaprezzi Carburanti del MIMIT.»
- Il segnaposto generico del ministero («pompa grigia») non è un marchio e viene escluso: le bandiere senza logo mostrano le iniziali.
- **Se sei il titolare di un marchio** e vuoi che il tuo logo venga rimosso, apri una issue nel repository: i file sono in `apps/web/public/brands/` e basta eliminarli (l'app ripiega sulle iniziali).

## Mappa, geocoding e routing: Mapbox

- **Mappa** (Mapbox GL JS) e stili: © [Mapbox](https://www.mapbox.com/about/maps/). Mapbox GL JS richiede un account e un token e il rispetto dei [Termini di servizio di Mapbox](https://www.mapbox.com/legal/tos): non è software open source.
- **Dati cartografici:** © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), licenza ODbL.
- **Attribuzione sulla mappa:** il logo Mapbox e il pulsante «i» con i crediti (Mapbox, OpenStreetMap) fanno parte della mappa e **non vanno nascosti** ([linee guida](https://docs.mapbox.com/help/dive-deeper/attribution/)). Le anteprime degli stili in `apps/web/public/styles` sono immagini di quegli stili e valgono le stesse attribuzioni.
- **Geocoding** (Geocoding API v6) e **routing** (Directions API) sono chiamati solo dal backend. I termini d'uso vietano di memorizzare i risultati: per questo l'app non salva coordinate né identificativi dei luoghi (lo storico dei tragitti contiene solo i testi digitati), non ha una cache dei percorsi e conserva solo per 15 minuti, in memoria, valori derivati (distanze e durate).
- **Stili:** i quattro stili del selettore (Light, Duotono, Carta Stradale, Monocromo) sono disegnati con Mapbox Studio su un account del progetto. Se pubblichi un'istanza, usa i **tuoi** stili o quelli standard di Mapbox (vedi il README).

## Font

Inter (Rasmus Andersson) e Plus Jakarta Sans (Tokotype), entrambi con licenza [SIL Open Font License 1.1](https://openfontlicense.org/). Sono caricati da Google Fonts: il browser dell'utente contatta `fonts.googleapis.com` e `fonts.gstatic.com`, quindi Google riceve il suo indirizzo IP. Per evitarlo puoi servire i font dal tuo dominio.

## Marchio e immagini del progetto

Il nome «TappaFurba», il marchio grafico («pin-goccia», `assets/logo.svg`) e le icone derivate sono del progetto e **non** rientrano nella licenza Apache-2.0 del codice (vedi `LICENSE` e `NOTICE`). Le icone dell'interfaccia (`apps/web/src/components/icons.tsx`) sono disegnate per il progetto.

## Software di terze parti

L'app usa pacchetti open source (React, Vite, Tailwind CSS, Fastify, Kysely, `pg`, Zod, Workbox e altri) con le rispettive licenze, elencate in `package.json` dei singoli pacchetti. Per l'elenco completo con le licenze: `pnpm licenses list`. PostgreSQL e PostGIS hanno le proprie licenze (PostgreSQL License e GPL v2+).

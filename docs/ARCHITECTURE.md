# Architettura

Questo documento descrive come è fatto TappaFurba: lo stack, la struttura del repository, i flussi di dati principali e le scelte che non si leggono dal codice a colpo d'occhio.

## Panoramica

```
                      ┌─────────────────────────────┐
   Browser (PWA)      │  apps/web  React + Vite     │
   Mapbox GL JS ◄─────┤  mappa, risultati, impostaz.│
                      └──────────────┬──────────────┘
                                     │ HTTPS, JSON
                      ┌──────────────▼──────────────┐        ┌────────────────────────┐
                      │  apps/api  Fastify          │───────►│ Mapbox Directions v5   │
                      │  ricerca, geocoding,        │───────►│ Mapbox Geocoding v6    │
                      │  prezzi live, kill switch   │───────►│ Osservaprezzi (ospzApi)│
                      └──────────────┬──────────────┘        └────────────────────────┘
                                     │ SQL (Kysely)
                      ┌──────────────▼──────────────┐        ┌────────────────────────┐
                      │ PostgreSQL + PostGIS        │◄───────│ ingestione giornaliera │
                      │ stazioni, prezzi, contatori │        │ CSV MIMIT (open data)  │
                      └─────────────────────────────┘        └────────────────────────┘
```

Il frontend è una app a pagina singola statica (HTML, JS, CSS) servita da un web server qualsiasi. Il backend è un servizio Node senza stato proprio, a parte una piccola memoria delle ricerche in corso (vedi sotto); tutto ciò che deve durare sta in PostgreSQL.

## Stack

| Livello | Tecnologie |
|---|---|
| Frontend | React 18, React Router 7, Vite, Tailwind CSS (token dal design system in `DESIGN.md`), Mapbox GL JS 3, `vite-plugin-pwa` (Workbox) |
| Backend | Node ≥ 24, TypeScript, Fastify 5 (`@fastify/cors`, `@fastify/rate-limit`), Zod per la validazione, Kysely + `pg` |
| Database | PostgreSQL 16 con PostGIS 3 |
| Domino | `packages/core`: TypeScript puro, senza I/O, condiviso da frontend e backend |
| Test | Vitest (unitari e di integrazione), Testing Library, Playwright (end-to-end) |
| Strumenti | pnpm workspace (monorepo), `tsx` per eseguire TypeScript in sviluppo e in produzione |

## Struttura delle cartelle

```
apps/
  web/                Frontend
    src/components/     Schermate e componenti (home, results, station, settings)
    src/hooks/          Ricerca, impostazioni, foglio trascinabile, installazione PWA, stato di rete
    src/lib/            Client API, impostazioni persistite, stili mappa, formati, navigazione, loghi
    public/             Icone PWA, favicon, immagine social, loghi delle bandiere (brands/), anteprime degli stili
    scripts/            generate-icons, fetch-brands, verify-pwa-build
  api/                Backend
    src/routes/         /health, /search, /nearby, /geocode, /ingest
    src/search/         SearchService (la ricerca), repository PostGIS, memoria delle ricerche
    src/providers/      Interfacce e implementazioni: routing, geocoding, dati MIMIT, prezzi live
    src/live-prices/    Aggiornamento dei prezzi per riquadro (coda, breaker, deadline)
    src/ingestion/      Ingestione dei CSV MIMIT
    src/usage/          Contatore mensile delle chiamate a pagamento
    src/e2e/            Server di prova per i test end-to-end
    scripts/            diagnose-station
  e2e/                Test Playwright
packages/
  core/               CSV, normalizzazione carburanti, geometria, riquadri, risparmio netto, freschezza, ordinamento
  shared/             Tipi del contratto API (richieste, risposte, enum)
db/schema.sql         Schema del database
assets/logo.svg       Marchio (unica sorgente di icone e favicon)
```

Ogni dipendenza esterna dell'API sta dietro un'interfaccia (`RoutingProvider`, `GeocodingProvider`, `LivePriceProvider`, `FuelDataProvider`, `StationRepository`) con una implementazione reale e una di prova: così i test non toccano mai la rete né il database, e senza chiavi l'API parte comunque in modalità di prova.

## Il modello dati

Lo schema è in [`db/schema.sql`](../db/schema.sql) (idempotente: `pnpm db:migrate` lo applica, e si può rilanciare).

| Tabella | Contenuto |
|---|---|
| `stations` | Anagrafica degli impianti (CSV MIMIT). `geom` (geography, indice GiST) e `tile_id` sono **colonne generate** da `lat`/`lon`: si ricalcolano a ogni upsert, senza logica nell'ingestione |
| `fuel_prices` | Un prezzo per stazione + carburante + modalità (self/servito), con la data di comunicazione del gestore |
| `ingestion_runs` | Una riga per ogni ingestione: stato, conteggi, errore |
| `live_price_tiles` | Riquadri della griglia già aggiornati con i prezzi in tempo reale, con l'ora dell'aggiornamento |
| `api_usage` | Contatori mensili delle chiamate in uscita a Mapbox, Directions e Geocoding (alimentano i kill switch) |

`stations.tile_id` ripete in SQL la funzione `tileForPoint` di `packages/core`; un test di integrazione verifica l'equivalenza su tutte le stazioni e su una griglia fitta di punti, e un test unitario controlla che lo schema contenga l'espressione di `apps/api/src/db/tileId.ts`.

## Flussi di dati

### 1. Ingestione dei dati MIMIT

```
pnpm ingest  (o il timer in produzione; POST /ingest solo se si imposta INGEST_TOKEN)
  └─ MimitFuelDataProvider scarica i due CSV (anagrafica e prezzi) con lo User-Agent di TappaFurba
      └─ packages/core: parseAnagrafica / parsePrezzi
           (separatore |, ore italiane, righe scartate con avviso)
          └─ normalizeFuelType: descrizione libera del gestore → benzina, diesel, gpl, metano, hvo, other, unknown
              └─ dedupePrices: un solo prezzo (il più basso) per stazione + carburante + modalità
                  └─ upsert in stations e fuel_prices; una riga in ingestion_runs
```

Il file MIMIT è pubblicato ogni mattina ma fotografa lo stato **alle 8 del giorno precedente**: da solo ha 1–2 giorni di ritardo. È il motivo dei prezzi in tempo reale (flusso 3). L'ingestione è idempotente e si può rilanciare quando si vuole.

### 2. Ricerca: da A→B alla classifica

`POST /search` con coordinate di partenza e arrivo, carburante, litri, consumo, deviazione massima, valore del tempo, opzioni di percorso e soglia di validità dei prezzi (`SearchService.search`):

1. **Percorso.** `RoutingProvider` (Mapbox Directions) restituisce la geometria; le opzioni «evita autostrade / pedaggi / traghetti» diventano `exclude` della richiesta.
2. **Prezzi in tempo reale.** Il `LivePriceRefresher` porta i prezzi aggiornati dei riquadri attraversati dal percorso (flusso 3), entro un tempo massimo.
3. **Corridoio.** Una query PostGIS (`PostgisStationRepository`) trova le stazioni entro la deviazione massima (da 1 a 15 km) dalla geometria del percorso, con i loro prezzi. Un prezzo conta come **fresco** se l'ultima conferma della fonte è entro la soglia (di fabbrica 72 ore): la *più recente* tra la data comunicata dal gestore e l'ora dell'ultimo aggiornamento del riquadro in tempo reale che contiene la stazione (`GREATEST(communicated_at, live_price_tiles.refreshed_at)`, via `tile_id`).
4. **Prezzo di riferimento.** `computeReferencePrice` calcola la **mediana** (robusta agli outlier) a cascata: stazioni a meno di 0,5 km dal tracciato; se sono meno di 3, tutte quelle del corridoio; se ancora meno di 3, la mediana nazionale. L'utente può sostituirlo con un valore manuale.
5. **Prezzo della stazione.** `selectStationPrice`: «Solo Self» attivo → conta solo il self; altrimenti self se c'è, servito altrimenti (con il flag «solo servito»).
6. **Deviazione stimata.** `estimateProxyDetour` stima km e minuti dalla geometria, senza chiamate esterne: serve a ordinare e a scegliere chi verificare.
7. **Risparmio netto.** `computeNetSavings` (formula nel README) e ordinamento. Si restituiscono al massimo 50 stazioni.
8. **Verifica col routing reale, in background.** La risposta parte subito con le stime. In parallelo le prime 5 stazioni della classifica (più quelle che le sostituiscono in testa, fino a 10 chiamate extra) vengono verificate con Directions reale; il frontend interroga `GET /search/:id` (stato `refinement`) e aggiorna l'elenco. Ogni stazione dichiara se la deviazione è «stimata» o «calcolata».
9. **Stazioni scartate per età.** Il server conta le stazioni escluse **solo** perché il prezzo è troppo vecchio e che per la stima geometrica sarebbero entro la deviazione massima: la UI le segnala con un link alla soglia.

I risultati restano **15 minuti in memoria** (`SearchSessionStore`): servono a `GET /search/:id/stations/:stationId` (dettaglio) e `…/route` (percorso con la sosta, per «Apri nel Navigatore») senza rifare la ricerca. Sono valori derivati (distanze e durate), mai risposte grezze del provider.

#### «Intorno a me»: la stessa ricerca attorno a un punto

`POST /nearby` (`SearchService.searchNearby`) risponde alla domanda «sono qui, dove faccio il pieno?»: punto di partenza (posizione o indirizzo), raggio (da 1 a 10 km, predefinito 5, come il MIMIT) e gli stessi parametri del veicolo. Condivide con `/search` tutto tranne la geometria (`SearchArea`), quindi sessione, ricalcolo in background, dettaglio, percorso con la sosta, prezzi in tempo reale e tetti di spesa sono gli stessi:

- **Area.** Una query PostGIS con un `POINT` al posto del tracciato (`ST_DWithin` entro il raggio, in linea d'aria). Il raggio decide quali stazioni entrano; **non** c'è il limite ai km extra del giro, che in «In viaggio» è lo slider della deviazione.
- **Prezzo di riferimento.** `computeAreaReferencePrice`: mediana delle stazioni nel raggio (livello `area`); sotto le 3 stazioni, quella nazionale. Manca il livello «sul percorso» (entro 500 m), che con un punto sarebbe troppo locale.
- **Costo del tragitto.** Il giro completo origine → stazione → origine: stima geometrica `2 × distanza × 1,25` e, per le prime 5, Directions reale. Le richieste «via stazione» usano `continue_straight=false`: Directions di default non ammette l'inversione ai waypoint intermedi e, arrivato alla stazione, farebbe girare attorno a un isolato (misurato su un caso reale: 4,59 km invece di 3,84 km, contro i 3,9 di Google Maps). «In viaggio» non cambia: lì dalla stazione si prosegue verso B. Nell'elenco si mostra la distanza di sola andata (metà del giro); il giro intero sta in fondo alla scheda e nel dettaglio.
- **Nessun percorso A→B.** Niente chiamata di routing in fase 1: la risposta ha `nearby` (punto e raggio) al posto di `route`, e `lateralDistanceKm` è la distanza dal punto. `alongRouteKm` vale 0.
- **Nessuna stazione conviene.** Il giro può costare più dello sconto rispetto al prezzo medio della zona: se nessuna stazione fa risparmiare, la UI lo dice sopra l'elenco, che resta ordinato.

### 3. Prezzi in tempo reale

Il sito dell'Osservaprezzi si interroga per zona (un punto e un raggio fino a 10 km). Il territorio è diviso in **riquadri fissi di 14 km** (`packages/core/src/geo/tiles.ts`): il cerchio da 10 km centrato su un riquadro lo contiene per intero. Così:

- la cache è **per riquadro, non per ricerca**: ricerche e utenti diversi condividono gli aggiornamenti (`live_price_tiles`, TTL di 60 minuti, sopravvive ai riavvii);
- un percorso lungo richiede poche chiamate (tetto di 40 riquadri per ricerca, il resto usa il file giornaliero);
- il client è prudente: 3 chiamate in parallelo, scadenza di 10 secondi per ricerca, coda limitata, interruttore dopo errori consecutivi e pausa automatica su HTTP 429.

La risposta di `/search` dichiara lo stato (`live`, `partial`, `unavailable`, `disabled`) e la UI lo mostra. Se la fonte non risponde, la ricerca funziona con il solo file giornaliero. `LIVE_PRICES_PROVIDER=off` la disattiva del tutto. Per le avvertenze su questa fonte vedi [ATTRIBUTION](ATTRIBUTION.md#note-sulle-fonti).

### 4. Geocoding e mappa

- **Suggerimenti d'indirizzo:** `GET /geocode/autocomplete` e `/geocode/reverse` passano dal backend (il token Mapbox del server non arriva mai al browser) verso la **Geocoding API v6** di Mapbox (non la Search Box API, che ha un piano gratuito molto più piccolo). Il testo digitato non viene mai scritto nei log. Senza token si usa `FixtureGeocodingProvider`.
- **Mappa:** nel browser, Mapbox GL JS con un token **pubblico** ristretto per URL. Il chunk della mappa si scarica solo nei Risultati. Senza token la mappa non compare e l'elenco funziona uguale.
- **Termini d'uso Mapbox:** i risultati di geocoding e di Directions **non si memorizzano**. Per questo lo storico dei tragitti sul dispositivo contiene solo i testi digitati (mai coordinate o identificativi), le coordinate si ritrovano con una nuova richiesta di geocoding a ogni apertura, e il routing non ha alcuna cache: `InFlightRoutingProvider` condivide una sola chiamata tra richieste identiche *contemporanee* e la dimentica appena risponde.

### 5. Protezione della spesa

Mapbox non ha un tetto di spesa nativo, quindi l'API si protegge da sola:

- **Limiti per IP** su `/search` e `/nearby` (20 al minuto ciascuno, con contatori separati), `/geocode` (120), dettaglio e polling.
- **Kill switch** (`BudgetedRoutingProvider` + `DirectionsBudget`, contatore in `api_usage`): oltre `DIRECTIONS_SOFT_LIMIT` (80.000/mese) si smette di verificare col routing reale e restano le stime; oltre `DIRECTIONS_HARD_LIMIT` (98.000) `/search` e `/nearby` rispondono 503. Il tetto del piano gratuito è 100.000 chiamate al mese.
- **Tetto del geocoding** (`BudgetedGeocodingProvider`, servizio `mapbox-geocoding` in `api_usage`): autocomplete e reverse si contano insieme, su tutti gli IP. Oltre `GEOCODING_HARD_LIMIT` (95.000/mese; piano gratuito 100.000) l'API non chiama più Mapbox e risponde 503 `BUDGET_EXHAUSTED`. Serve perché il rate limit per IP conta le richieste dei client, non il totale, e le due rotte hanno contatori separati: un solo IP può far partire fino al doppio del limite al minuto, e con più IP il consumo cresce senza tetto. Le richieste respinte non si contano.

### 6. Frontend

- **Stato:** `SettingsProvider` (impostazioni in `localStorage`, versionate e validate campo per campo), `useSearch` (ricerca, polling del `refinement`, cache dei dettagli), storico dei tragitti (solo testi). Nessuna libreria di stato globale.
- **Schermate:** Home (barra e foglio «Pianifica viaggio»), Risultati (mappa + foglio a tre posizioni su telefono, pannello affiancato su schermi larghi), Dettaglio, Impostazioni. Sotto `md` il foglio dei Risultati si trascina fra *ridotto*, *chiuso* ed *espanso*.
- **Design system:** i token (colori, tipografia, raggi) sono nel front-matter di `DESIGN.md` e portati 1:1 in `tailwind.config.ts`; test automatici verificano contrasti (WCAG AA) e tipografia.
- **PWA:** il service worker pre-cacha la shell (HTML, JS, CSS, icone, font). Le richieste all'API usano `NetworkOnly`; i loghi delle bandiere (`/brands/*.png`, file statici dello stesso dominio) e i font si salvano a runtime con `CacheFirst`. Il chunk della mappa non è nel precache. `pnpm --filter @tappafurba/web verify:pwa` controlla tutto questo sulla build.
- **Accessibilità e mobile:** aree di tocco da 44 px, campi di testo a 16 px sui dispositivi touch (niente zoom automatico di iOS), landmark `main` su ogni schermata, rispetto delle safe-area.

## Decisioni di progetto da conoscere

- **Una sola fonte di verità per lo schema:** `db/schema.sql`. Una modifica si scrive lì in forma idempotente (`CREATE … IF NOT EXISTS`, `ALTER TABLE … ADD COLUMN IF NOT EXISTS`); non ci sono migrazioni incrementali.
- **`packages/core` è puro:** niente rete, database o `Date.now()` nascosti (l'ora si passa). È la parte più testata.
- **TypeScript eseguito con `tsx`, anche in produzione.** I pacchetti del workspace espongono i sorgenti TypeScript (`main: src/index.ts`), quindi l'API non si compila in JavaScript: parte con `tsx src/server.ts` (`pnpm --filter @tappafurba/api start`).- **`POST /ingest` è disattivato di default** (404). Con `INGEST_TOKEN` (almeno 32 caratteri) accetta solo `Authorization: Bearer …`, con confronto a tempo costante, 3 tentativi al minuto per IP (contano anche i rifiuti) e una sola esecuzione alla volta; un errore non restituisce mai il messaggio al client. In produzione l'ingestione si lancia da riga di comando o da un timer, e il reverse proxy non deve esporre l'endpoint.
- **Segreti e log.** I token Mapbox viaggiano come parametro `access_token`: i provider non mettono mai l'URL negli errori, e in più ogni messaggio, errore (con la sua `cause`) e campo che arriva ai log passa da `src/redact.ts`, che oscura `access_token=…` e qualunque stringa `pk.`/`sk.`/`tk.`. Il token del server deve essere **segreto** (`sk.`): in produzione l'API rifiuta di avviarsi con un `pk.`.
- **Rate limit per IP e proxy.** `TRUST_PROXY` è il **numero** di proxy fidati (`1` con nginx): con `true` un client può scegliersi l'IP con `X-Forwarded-For` e aggirare i limiti (un test lo dimostra). Le rotte `HEAD` automatiche sono disattivate perché ognuna avrebbe un contatore separato e raddoppierebbe il limite.
- **Nessun segreto nel repository.** I token Mapbox e `DATABASE_URL` stanno in file `.env` ignorati da git; le variabili `VITE_*` finiscono nel bundle del browser e non devono contenere segreti.

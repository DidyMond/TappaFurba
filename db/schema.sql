-- Schema di TappaFurba: PostgreSQL 16 + PostGIS 3. Unica fonte di verità dello stato del database.
--
-- Idempotente: si può rilanciare su un database già inizializzato senza effetti (nessun dato viene toccato).
-- Si applica con `pnpm db:migrate` oppure, a mano:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 --single-transaction -f db/schema.sql
-- Una modifica allo schema si scrive qui in forma idempotente (CREATE ... IF NOT EXISTS, ALTER TABLE ... ADD COLUMN IF NOT EXISTS).

CREATE EXTENSION IF NOT EXISTS postgis;

-- Anagrafica degli impianti (file CSV MIMIT, caricata dall'ingestione).
CREATE TABLE IF NOT EXISTS stations (
  id integer PRIMARY KEY,
  gestore text NOT NULL,
  bandiera text NOT NULL,
  tipo_impianto text NOT NULL,
  nome_impianto text NOT NULL,
  indirizzo text NOT NULL,
  comune text NOT NULL,
  provincia text NOT NULL,
  lat double precision NOT NULL,
  lon double precision NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tipo_impianto_check CHECK (tipo_impianto IN ('stradale', 'autostradale')),
  -- Colonna geospaziale generata: si ricalcola da lat/lon a ogni upsert, senza logica applicativa.
  geom geography(Point, 4326) GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint(lon, lat), 4326)::geography) STORED,
  -- Riquadro della griglia dei prezzi in tempo reale che contiene la stazione. Ripete `tileForPoint` di packages/core
  -- (lato di 14 km; passo in latitudine 14 / 111,32; passo in longitudine per riga 14 / (111,32 · cos(latitudine centrale
  -- della riga))) con la stessa aritmetica a doppia precisione: un test di integrazione confronta le due su tutte le
  -- stazioni e su una griglia fitta di punti. Se cambia TILE_SIDE_KM o la formula in core, va ricreata la colonna.
  tile_id text GENERATED ALWAYS AS (
    ((floor(lat / (14::float8 / 111.32::float8)))::int::text || ':' || (floor(lon / (14::float8 / (111.32::float8 * cos(radians((floor(lat / (14::float8 / 111.32::float8)) + 0.5) * (14::float8 / 111.32::float8)))))))::int::text)
  ) STORED
);

CREATE INDEX IF NOT EXISTS stations_geom_idx ON stations USING GIST (geom);
CREATE INDEX IF NOT EXISTS stations_tile_id_idx ON stations (tile_id);

-- Prezzi comunicati dai gestori (file CSV MIMIT). Una sola riga per stazione + carburante + modalità (self/servito).
CREATE TABLE IF NOT EXISTS fuel_prices (
  id serial PRIMARY KEY,
  station_id integer NOT NULL REFERENCES stations (id) ON DELETE CASCADE,
  fuel_type text NOT NULL,
  raw_desc_carburante text NOT NULL,
  is_self boolean NOT NULL,
  price double precision NOT NULL,
  communicated_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fuel_type_check CHECK (fuel_type IN ('benzina', 'diesel', 'gpl', 'metano', 'hvo', 'other', 'unknown'))
);

CREATE UNIQUE INDEX IF NOT EXISTS fuel_prices_station_fuel_mode_idx ON fuel_prices (station_id, fuel_type, is_self);

-- Una riga per ogni esecuzione dell'ingestione (stato, conteggi, eventuale errore).
CREATE TABLE IF NOT EXISTS ingestion_runs (
  id serial PRIMARY KEY,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  stations_upserted integer NOT NULL DEFAULT 0,
  prices_upserted integer NOT NULL DEFAULT 0,
  warnings_count integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'running',
  error_message text
);

-- Contatore mensile delle chiamate a servizi esterni a pagamento (Mapbox Directions): alimenta il kill switch che
-- disabilita il routing reale quando ci si avvicina ai limiti del piano gratuito. `period` è 'YYYY-MM' (UTC).
CREATE TABLE IF NOT EXISTS api_usage (
  service text NOT NULL,
  period text NOT NULL,
  count bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT api_usage_pk PRIMARY KEY (service, period)
);

-- Riquadri geografici già aggiornati con i prezzi in tempo reale: evita di richiamare la fonte ufficiale per la stessa
-- zona a ogni ricerca (cache condivisa tra utenti, sopravvive ai riavvii).
CREATE TABLE IF NOT EXISTS live_price_tiles (
  tile_id text PRIMARY KEY,
  refreshed_at timestamptz NOT NULL DEFAULT now(),
  stations_seen integer NOT NULL DEFAULT 0
);

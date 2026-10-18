import type { Generated } from "kysely";

export interface StationsTable {
  /** idImpianto MIMIT: chiave esterna reale, non generata da noi. */
  id: number;
  gestore: string;
  bandiera: string;
  tipo_impianto: "stradale" | "autostradale";
  nome_impianto: string;
  indirizzo: string;
  comune: string;
  provincia: string;
  lat: number;
  lon: number;
  /** Riquadro della griglia dei prezzi in tempo reale che contiene la stazione: colonna generata da lat/lon (migrazione 0004). */
  tile_id: Generated<string>;
  updated_at: Generated<Date>;
}

export interface FuelPricesTable {
  id: Generated<number>;
  station_id: number;
  fuel_type: "benzina" | "diesel" | "gpl" | "metano" | "hvo" | "other" | "unknown";
  raw_desc_carburante: string;
  is_self: boolean;
  price: number;
  communicated_at: Date;
  updated_at: Generated<Date>;
}

export interface IngestionRunsTable {
  id: Generated<number>;
  started_at: Generated<Date>;
  finished_at: Date | null;
  stations_upserted: Generated<number>;
  prices_upserted: Generated<number>;
  warnings_count: Generated<number>;
  status: "running" | "success" | "failed";
  error_message: string | null;
}

export interface ApiUsageTable {
  service: string;
  /** 'YYYY-MM' (UTC). */
  period: string;
  /** bigint: node-postgres lo restituisce come stringa. */
  count: Generated<string>;
  updated_at: Generated<Date>;
}

export interface LivePriceTilesTable {
  tile_id: string;
  refreshed_at: Generated<Date>;
  stations_seen: Generated<number>;
}

export interface Database {
  stations: StationsTable;
  fuel_prices: FuelPricesTable;
  ingestion_runs: IngestionRunsTable;
  api_usage: ApiUsageTable;
  live_price_tiles: LivePriceTilesTable;
}

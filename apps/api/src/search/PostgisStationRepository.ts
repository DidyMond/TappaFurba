import type { NationalPrice } from "@tappafurba/core";
import type { SearchFuelType, StationPriceEntry } from "@tappafurba/shared";
import { sql, type Kysely } from "kysely";
import type { Database } from "../db/types";
import type { CorridorPriceRow, CorridorQuery, StaleStation, StationRepository } from "./StationRepository";

interface RawCorridorRow {
  station_id: number;
  nome_impianto: string;
  bandiera: string;
  gestore: string;
  indirizzo: string;
  comune: string;
  provincia: string;
  tipo_impianto: "stradale" | "autostradale";
  lat: number;
  lon: number;
  is_self: boolean;
  price: number;
  communicated_at: Date;
}

/**
 * Freschezza = ULTIMA CONFERMA DELLA FONTE (stessa regola di `isPriceFresh` in core): il più recente
 * tra la data di comunicazione del prezzo e l'ultimo aggiornamento del riquadro in tempo reale che contiene la stazione
 * (`live_price_tiles.refreshed_at`, via `stations.tile_id`). `GREATEST` ignora i NULL: senza riquadro vale la sola data di
 * comunicazione. Il prezzo mostrato e la sua data di comunicazione restano quelli veri.
 */
function confirmedAt(price: string, tile: string) {
  return sql.raw(`GREATEST(${price}.communicated_at, ${tile}.refreshed_at)`);
}

export class PostgisStationRepository implements StationRepository {
  constructor(private readonly db: Kysely<Database>) {}

  /**
   * Corridoio = tutte le stazioni entro `radiusMeters` dal tracciato.
   * `ST_DWithin` su geography è l'equivalente esatto di "dentro il buffer" di
   * `ST_Buffer(tracciato, raggio)` e sfrutta l'indice GiST su stations.geom,
   * senza materializzare il poligono del buffer (costoso su tracciati lunghi).
   * `use_spheroid = false`: calcolo sferico, più veloce e ampiamente
   * sufficiente alla scala di km del corridoio.
   */
  async findCorridorPrices(query: CorridorQuery): Promise<CorridorPriceRow[]> {
    const result = await sql<RawCorridorRow>`
      SELECT
        s.id AS station_id,
        s.nome_impianto, s.bandiera, s.gestore, s.indirizzo, s.comune, s.provincia,
        s.tipo_impianto, s.lat, s.lon,
        p.is_self, p.price, p.communicated_at
      FROM stations s
      JOIN fuel_prices p ON p.station_id = s.id
      LEFT JOIN live_price_tiles t ON t.tile_id = s.tile_id
      WHERE p.fuel_type = ${query.fuelType}
        AND ${confirmedAt("p", "t")} >= now() - make_interval(hours => ${query.maxAgeHours}::int)
        AND ST_DWithin(s.geom, ST_GeogFromText(${query.routeWkt}), ${query.radiusMeters}::float8, false)
    `.execute(this.db);

    return result.rows.map((row) => ({
      stationId: row.station_id,
      nomeImpianto: row.nome_impianto,
      bandiera: row.bandiera,
      gestore: row.gestore,
      indirizzo: row.indirizzo,
      comune: row.comune,
      provincia: row.provincia,
      tipoImpianto: row.tipo_impianto,
      lat: row.lat,
      lon: row.lon,
      isSelf: row.is_self,
      price: row.price,
      communicatedAt: row.communicated_at.toISOString(),
    }));
  }

  /**
   * Stazioni nel raggio con almeno un prezzo del carburante (e, con «solo Self», un prezzo Self) ma NESSUNO entro la
   * soglia di freschezza: sono esattamente quelle che `findCorridorPrices` scarta per l'età del prezzo.
   */
  async findStaleStations(query: CorridorQuery & { onlySelf: boolean }): Promise<StaleStation[]> {
    const selfOnly = query.onlySelf ? sql`AND is_self` : sql``;
    const result = await sql<{ station_id: number; lat: number; lon: number }>`
      SELECT s.id AS station_id, s.lat, s.lon
      FROM stations s
      LEFT JOIN live_price_tiles t ON t.tile_id = s.tile_id
      WHERE ST_DWithin(s.geom, ST_GeogFromText(${query.routeWkt}), ${query.radiusMeters}::float8, false)
        AND EXISTS (
          SELECT 1 FROM fuel_prices p WHERE p.station_id = s.id AND p.fuel_type = ${query.fuelType} ${selfOnly}
        )
        AND NOT EXISTS (
          SELECT 1 FROM fuel_prices p
          WHERE p.station_id = s.id AND p.fuel_type = ${query.fuelType} ${selfOnly}
            AND ${confirmedAt("p", "t")} >= now() - make_interval(hours => ${query.maxAgeHours}::int)
        )
    `.execute(this.db);
    return result.rows.map((row) => ({ stationId: row.station_id, lat: row.lat, lon: row.lon }));
  }

  /**
   * Mediana nazionale con la stessa regola di scelta prezzo della ricerca:
   * "solo Self" → i prezzi Self; altrimenti Self se presente, altrimenti Servito.
   */
  async getNationalPrice(query: {
    fuelType: SearchFuelType;
    onlySelf: boolean;
    maxAgeHours: number;
  }): Promise<NationalPrice | null> {
    const selfOnlyClause = query.onlySelf ? sql`AND p.is_self` : sql``;

    const result = await sql<{ median: number | null; sample_size: number }>`
      SELECT
        percentile_cont(0.5) WITHIN GROUP (ORDER BY price) AS median,
        count(*)::int AS sample_size
      FROM (
        SELECT DISTINCT ON (p.station_id) p.price
        FROM fuel_prices p
        JOIN stations s ON s.id = p.station_id
        LEFT JOIN live_price_tiles t ON t.tile_id = s.tile_id
        WHERE p.fuel_type = ${query.fuelType}
          AND ${confirmedAt("p", "t")} >= now() - make_interval(hours => ${query.maxAgeHours}::int)
          ${selfOnlyClause}
        ORDER BY p.station_id, p.is_self DESC
      ) chosen
    `.execute(this.db);

    const row = result.rows[0];
    if (!row || row.median === null || row.sample_size === 0) {
      return null;
    }
    return { median: row.median, sampleSize: row.sample_size };
  }

  async getStationPrices(stationId: number, maxAgeHours: number): Promise<StationPriceEntry[]> {
    const result = await sql<{ fuel_type: SearchFuelType; is_self: boolean; price: number; communicated_at: Date }>`
      SELECT p.fuel_type, p.is_self, p.price, p.communicated_at
      FROM fuel_prices p
      JOIN stations s ON s.id = p.station_id
      LEFT JOIN live_price_tiles t ON t.tile_id = s.tile_id
      WHERE p.station_id = ${stationId}
        AND p.fuel_type IN ('benzina', 'diesel', 'gpl', 'metano')
        AND ${confirmedAt("p", "t")} >= now() - make_interval(hours => ${maxAgeHours}::int)
      ORDER BY p.fuel_type, p.is_self DESC
    `.execute(this.db);

    return result.rows.map((row) => ({
      fuelType: row.fuel_type,
      isSelf: row.is_self,
      price: row.price,
      communicatedAt: row.communicated_at.toISOString(),
    }));
  }

  async getLastIngestionAt(): Promise<Date | null> {
    const row = await this.db
      .selectFrom("ingestion_runs")
      .select("finished_at")
      .where("status", "=", "success")
      .where("finished_at", "is not", null)
      .orderBy("finished_at", "desc")
      .limit(1)
      .executeTakeFirst();
    return row?.finished_at ?? null;
  }
}

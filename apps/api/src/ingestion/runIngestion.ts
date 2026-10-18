import { sql } from "kysely";
import type { Station, FuelPrice } from "@tappafurba/shared";
import { parseAnagraficaCsv, parsePrezziCsv, dedupeToLowestPricePerStationFuelMode } from "@tappafurba/core";
import { db } from "../db";
import type { FuelDataProvider } from "../providers/fuel-data/FuelDataProvider";

// Postgres ha un limite di ~65535 parametri per query: con ~24k stazioni e
// ~93k prezzi un singolo INSERT multi-riga lo supererebbe. Si inserisce a lotti.
const CHUNK_SIZE = 500;

export interface IngestionSummary {
  stationsUpserted: number;
  pricesUpserted: number;
  warningsCount: number;
  durationMs: number;
}

export async function runIngestion(provider: FuelDataProvider): Promise<IngestionSummary> {
  const startedAt = Date.now();

  const run = await db
    .insertInto("ingestion_runs")
    .values({ status: "running" })
    .returning("id")
    .executeTakeFirstOrThrow();

  try {
    const [anagraficaCsv, prezziCsv] = await Promise.all([
      provider.fetchAnagraficaCsv(),
      provider.fetchPrezziCsv(),
    ]);

    const anagrafica = parseAnagraficaCsv(anagraficaCsv);
    const prezzi = parsePrezziCsv(prezziCsv);
    const dedupedPrices = dedupeToLowestPricePerStationFuelMode(prezzi.prices);

    // I prezzi fanno riferimento a stazioni (FK station_id -> stations.id):
    // un idImpianto presente nel file prezzi ma assente (o scartato per
    // coordinate invalide) in anagrafica produce un prezzo "orfano", scartato
    // qui e conteggiato nei warning invece di far fallire l'intera ingestione.
    const validStationIds = new Set(anagrafica.stations.map((station) => station.id));
    const validPrices = dedupedPrices.filter((price) => validStationIds.has(price.stationId));
    const orphanedPricesCount = dedupedPrices.length - validPrices.length;

    await upsertStations(anagrafica.stations);
    await upsertPrices(validPrices);

    const warningsCount = anagrafica.warnings.length + prezzi.warnings.length + orphanedPricesCount;

    await db
      .updateTable("ingestion_runs")
      .set({
        finished_at: sql`now()`,
        stations_upserted: anagrafica.stations.length,
        prices_upserted: validPrices.length,
        warnings_count: warningsCount,
        status: "success",
      })
      .where("id", "=", run.id)
      .execute();

    return {
      stationsUpserted: anagrafica.stations.length,
      pricesUpserted: validPrices.length,
      warningsCount,
      durationMs: Date.now() - startedAt,
    };
  } catch (error) {
    await db
      .updateTable("ingestion_runs")
      .set({
        finished_at: sql`now()`,
        status: "failed",
        error_message: error instanceof Error ? error.message : String(error),
      })
      .where("id", "=", run.id)
      .execute();
    throw error;
  }
}

async function upsertStations(stations: Station[]): Promise<void> {
  for (const chunk of toChunks(stations, CHUNK_SIZE)) {
    await db
      .insertInto("stations")
      .values(
        chunk.map((station) => ({
          id: station.id,
          gestore: station.gestore,
          bandiera: station.bandiera,
          tipo_impianto: station.tipoImpianto,
          nome_impianto: station.nomeImpianto,
          indirizzo: station.indirizzo,
          comune: station.comune,
          provincia: station.provincia,
          lat: station.lat,
          lon: station.lon,
        })),
      )
      .onConflict((oc) =>
        oc.column("id").doUpdateSet((eb) => ({
          gestore: eb.ref("excluded.gestore"),
          bandiera: eb.ref("excluded.bandiera"),
          tipo_impianto: eb.ref("excluded.tipo_impianto"),
          nome_impianto: eb.ref("excluded.nome_impianto"),
          indirizzo: eb.ref("excluded.indirizzo"),
          comune: eb.ref("excluded.comune"),
          provincia: eb.ref("excluded.provincia"),
          lat: eb.ref("excluded.lat"),
          lon: eb.ref("excluded.lon"),
          updated_at: sql`now()`,
        })),
      )
      .execute();
  }
}

export async function upsertPrices(prices: FuelPrice[]): Promise<void> {
  for (const chunk of toChunks(prices, CHUNK_SIZE)) {
    await db
      .insertInto("fuel_prices")
      .values(
        chunk.map((price) => ({
          station_id: price.stationId,
          fuel_type: price.fuelType,
          raw_desc_carburante: price.rawDescCarburante,
          is_self: price.isSelf,
          price: price.price,
          communicated_at: new Date(price.communicatedAt),
        })),
      )
      .onConflict((oc) =>
        oc
          .columns(["station_id", "fuel_type", "is_self"])
          .doUpdateSet((eb) => ({
            raw_desc_carburante: eb.ref("excluded.raw_desc_carburante"),
            price: eb.ref("excluded.price"),
            communicated_at: eb.ref("excluded.communicated_at"),
            updated_at: sql`now()`,
          }))
          // Il file giornaliero è indietro di 1-2 giorni: non deve sostituire prezzi live più recenti.
          .where((eb) => eb("fuel_prices.communicated_at", "<=", eb.ref("excluded.communicated_at"))),
      )
      .execute();
  }
}

function toChunks<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

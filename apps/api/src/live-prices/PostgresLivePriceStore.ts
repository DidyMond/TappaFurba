import { sql, type Kysely } from "kysely";
import { liveStationToFuelPrices, type LiveStationInput } from "@tappafurba/core";
import type { Database } from "../db/types";
import type { LivePriceStore } from "./LivePriceStore";

const CHUNK_SIZE = 500;

export class PostgresLivePriceStore implements LivePriceStore {
  constructor(private readonly db: Kysely<Database>) {}

  async getFreshTiles(tileIds: readonly string[], maxAgeMs: number): Promise<Map<string, Date>> {
    if (tileIds.length === 0) return new Map();
    const rows = await this.db
      .selectFrom("live_price_tiles")
      .select(["tile_id", "refreshed_at"])
      .where("tile_id", "in", [...tileIds])
      .where(sql<boolean>`refreshed_at >= now() - make_interval(secs => ${Math.round(maxAgeMs / 1000)}::int)`)
      .execute();
    return new Map(rows.map((row) => [row.tile_id, row.refreshed_at]));
  }

  async applyTile(tileId: string, stations: readonly LiveStationInput[]): Promise<{ stationsUpdated: number }> {
    return this.db.transaction().execute(async (trx) => {
      let stationsUpdated = 0;

      if (stations.length > 0) {
        const known = await trx
          .selectFrom("stations")
          .select("id")
          .where("id", "in", stations.map((station) => station.stationId))
          .execute();
        const knownIds = new Set(known.map((row) => row.id));

        const prices = stations
          .filter((station) => knownIds.has(station.stationId))
          .flatMap((station) => liveStationToFuelPrices(station));
        stationsUpdated = new Set(prices.map((price) => price.stationId)).size;

        for (let i = 0; i < prices.length; i += CHUNK_SIZE) {
          await trx
            .insertInto("fuel_prices")
            .values(
              prices.slice(i, i + CHUNK_SIZE).map((price) => ({
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
                // Mai sovrascrivere un prezzo più recente con uno più vecchio.
                .where((eb) => eb("fuel_prices.communicated_at", "<=", eb.ref("excluded.communicated_at"))),
            )
            .execute();
        }
      }

      await trx
        .insertInto("live_price_tiles")
        .values({ tile_id: tileId, stations_seen: stations.length })
        .onConflict((oc) =>
          oc.column("tile_id").doUpdateSet({ refreshed_at: sql`now()`, stations_seen: stations.length }),
        )
        .execute();

      return { stationsUpdated };
    });
  }
}

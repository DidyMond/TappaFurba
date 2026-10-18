import { Kysely, PostgresDialect } from "kysely";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "../../src/db/types";
import { upsertPrices } from "../../src/ingestion/runIngestion";
import { PostgresLivePriceStore } from "../../src/live-prices/PostgresLivePriceStore";

/**
 * Richiede `docker compose up -d` e `pnpm db:migrate` (si lancia con `pnpm test:db`).
 * Stazione e riquadro sintetici, in mare aperto, per non toccare i dati reali.
 */
const enabled = process.env.RUN_DB_TESTS === "1";

describe.skipIf(!enabled)("PostgresLivePriceStore", () => {
  const STATION = 999_999_101;
  const UNKNOWN_STATION = 999_999_102;
  const TILE = "test:tile:1";
  let db: Kysely<Database>;
  let store: PostgresLivePriceStore;

  const readPrices = () =>
    db.selectFrom("fuel_prices").selectAll().where("station_id", "=", STATION).orderBy("fuel_type").orderBy("is_self").execute();

  beforeAll(async () => {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("DATABASE_URL non impostata (vedi apps/api/.env)");
    db = new Kysely<Database>({ dialect: new PostgresDialect({ pool: new pg.Pool({ connectionString }) }) });
    store = new PostgresLivePriceStore(db);

    await db.deleteFrom("stations").where("id", "in", [STATION, UNKNOWN_STATION]).execute();
    await db.deleteFrom("live_price_tiles").where("tile_id", "like", "test:%").execute();
    await db
      .insertInto("stations")
      .values({
        id: STATION,
        gestore: "TEST",
        bandiera: "Test",
        tipo_impianto: "stradale",
        nome_impianto: "Live di prova",
        indirizzo: "Mare aperto",
        comune: "Nessuno",
        provincia: "XX",
        lat: 41.0,
        lon: 3.0,
      })
      .execute();
    // Prezzo "del file giornaliero" di ieri.
    await db
      .insertInto("fuel_prices")
      .values({
        station_id: STATION,
        fuel_type: "benzina",
        raw_desc_carburante: "Benzina",
        is_self: true,
        price: 2.129,
        communicated_at: new Date("2026-09-24T14:34:29Z"),
      })
      .execute();
  });

  afterAll(async () => {
    await db.deleteFrom("stations").where("id", "in", [STATION, UNKNOWN_STATION]).execute();
    await db.deleteFrom("live_price_tiles").where("tile_id", "like", "test:%").execute();
    await db.destroy();
  });

  it("un prezzo live più recente sostituisce quello del file giornaliero e ignora le stazioni sconosciute", async () => {
    const result = await store.applyTile(TILE, [
      {
        stationId: STATION,
        communicatedAt: "2026-09-28T11:11:43+02:00",
        fuels: [
          { name: "Benzina", price: 1.99, isSelf: true },
          { name: "Benzina", price: 2.2, isSelf: false },
          { name: "Gasolio", price: 2.19, isSelf: true },
        ],
      },
      { stationId: UNKNOWN_STATION, communicatedAt: "2026-09-28T11:11:43+02:00", fuels: [{ name: "Benzina", price: 1.5, isSelf: true }] },
    ]);

    expect(result.stationsUpdated).toBe(1);
    const prices = await readPrices();
    expect(prices.map((p) => `${p.fuel_type}/${p.is_self ? "self" : "servito"}=${p.price}`)).toEqual([
      "benzina/servito=2.2",
      "benzina/self=1.99",
      "diesel/self=2.19",
    ]);
    expect(prices.find((p) => p.fuel_type === "benzina" && p.is_self)?.communicated_at.toISOString()).toBe("2026-09-28T09:11:43.000Z");
    expect(await db.selectFrom("stations").select("id").where("id", "=", UNKNOWN_STATION).execute()).toHaveLength(0);
  });

  it("un prezzo live più VECCHIO di quello presente non lo sovrascrive", async () => {
    await store.applyTile(TILE, [
      {
        stationId: STATION,
        communicatedAt: "2026-09-20T08:00:00Z",
        fuels: [{ name: "Benzina", price: 2.5, isSelf: true }],
      },
    ]);
    const self = (await readPrices()).find((p) => p.fuel_type === "benzina" && p.is_self);
    expect(self?.price).toBe(1.99);
  });

  it("l'ingestione del file giornaliero (più vecchio) non sovrascrive il prezzo live", async () => {
    await upsertPrices([
      { stationId: STATION, fuelType: "benzina", rawDescCarburante: "Benzina", isSelf: true, price: 2.129, communicatedAt: "2026-09-24T14:34:29.000Z" },
    ]);
    const self = (await readPrices()).find((p) => p.fuel_type === "benzina" && p.is_self);
    expect(self?.price).toBe(1.99);

    // Un prezzo del file PIÙ recente, invece, è legittimo e sostituisce.
    await upsertPrices([
      { stationId: STATION, fuelType: "benzina", rawDescCarburante: "Benzina", isSelf: true, price: 1.95, communicatedAt: "2026-09-29T06:00:00.000Z" },
    ]);
    expect((await readPrices()).find((p) => p.fuel_type === "benzina" && p.is_self)?.price).toBe(1.95);
  });

  it("segna il riquadro come aggiornato e getFreshTiles rispetta il TTL", async () => {
    const fresh = await store.getFreshTiles([TILE, "test:mai-visto"], 30 * 60_000);
    expect([...fresh.keys()]).toEqual([TILE]);

    await db.updateTable("live_price_tiles").set({ refreshed_at: new Date(Date.now() - 45 * 60_000) }).where("tile_id", "=", TILE).execute();
    expect((await store.getFreshTiles([TILE], 30 * 60_000)).size).toBe(0);
    expect((await store.getFreshTiles([TILE], 60 * 60_000)).size).toBe(1);
  });

  it("getFreshTiles con lista vuota non interroga il DB", async () => {
    expect((await store.getFreshTiles([], 1000)).size).toBe(0);
  });
});

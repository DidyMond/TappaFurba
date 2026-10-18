import { tileForPoint } from "@tappafurba/core";
import { Kysely, PostgresDialect, sql } from "kysely";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "../../src/db/types";
import { tileIdExpression } from "../../src/db/tileId";
import { PostgisStationRepository } from "../../src/search/PostgisStationRepository";

/**
 * Freschezza = ultima conferma della fonte, sul database vero.
 * Richiede `docker compose up -d` e `pnpm db:migrate` (si lancia con `pnpm test:db`).
 * Stazioni e riquadri sintetici, in mare aperto, per non toccare i dati reali.
 */
const enabled = process.env.RUN_DB_TESTS === "1";

describe.skipIf(!enabled)("freschezza dei prezzi — riquadro aggiornato dal vivo", () => {
  // Due stazioni in mare aperto, in riquadri diversi (~85 km di longitudine tra l'una e l'altra), stesso prezzo vecchio di 120 h.
  const A = { id: 999_999_201, lon: 3.2, lat: 41.2 };
  const B = { id: 999_999_202, lon: 4.2, lat: 41.2 };
  const ROUTE = "LINESTRING(3.0 41.2, 4.5 41.2)";
  const QUERY = { routeWkt: ROUTE, radiusMeters: 5_000, fuelType: "benzina" as const, maxAgeHours: 72 };
  const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000);

  let db: Kysely<Database>;
  let repo: PostgisStationRepository;

  const tileA = () => tileForPoint(A.lon, A.lat).id;
  const setTile = async (tileId: string, refreshedAt: Date | null) => {
    await db.deleteFrom("live_price_tiles").where("tile_id", "=", tileId).execute();
    if (refreshedAt) await db.insertInto("live_price_tiles").values({ tile_id: tileId, refreshed_at: refreshedAt, stations_seen: 1 }).execute();
  };
  const setPrice = async (stationId: number, communicatedAt: Date) => {
    await db.updateTable("fuel_prices").set({ communicated_at: communicatedAt }).where("station_id", "=", stationId).execute();
  };
  const corridorIds = async () => (await repo.findCorridorPrices(QUERY)).map((row) => row.stationId).sort();
  const staleIds = async () => (await repo.findStaleStations({ ...QUERY, onlySelf: false })).map((s) => s.stationId).sort();
  const national = async () => (await repo.getNationalPrice({ fuelType: "benzina", onlySelf: false, maxAgeHours: 72 }))?.sampleSize ?? 0;

  beforeAll(async () => {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("DATABASE_URL non impostata (vedi apps/api/.env)");
    db = new Kysely<Database>({ dialect: new PostgresDialect({ pool: new pg.Pool({ connectionString }) }) });
    repo = new PostgisStationRepository(db);

    await db.deleteFrom("stations").where("id", "in", [A.id, B.id]).execute();
    for (const s of [A, B]) {
      await db
        .insertInto("stations")
        .values({ id: s.id, gestore: "TEST", bandiera: "Test", tipo_impianto: "stradale", nome_impianto: `Freschezza ${s.id}`, indirizzo: "Mare aperto", comune: "Nessuno", provincia: "XX", lat: s.lat, lon: s.lon })
        .execute();
      await db
        .insertInto("fuel_prices")
        .values({ station_id: s.id, fuel_type: "benzina", raw_desc_carburante: "Benzina", is_self: true, price: 1.999, communicated_at: hoursAgo(120) })
        .execute();
    }
    await setTile(tileA(), null);
    await setTile(tileForPoint(B.lon, B.lat).id, null);
  });

  afterAll(async () => {
    await setTile(tileA(), null);
    await setTile(tileForPoint(B.lon, B.lat).id, null);
    await db.deleteFrom("stations").where("id", "in", [A.id, B.id]).execute();
    await db.destroy();
  });

  it("stations.tile_id (colonna generata in SQL) coincide con tileForPoint di @tappafurba/core su TUTTE le stazioni del database", async () => {
    const rows = await db.selectFrom("stations").select(["id", "lon", "lat", "tile_id"]).execute();
    expect(rows.length).toBeGreaterThan(1000);
    const different = rows.filter((row) => tileForPoint(row.lon, row.lat).id !== row.tile_id);
    expect(different.map((row) => row.id)).toEqual([]);
  });

  it("…e su una griglia fitta di punti, anche vicino ai bordi dei riquadri", async () => {
    // La stessa espressione della colonna generata (esportata dalla migrazione), applicata a punti sintetici: confronto con TypeScript.
    const points: Array<[number, number]> = [];
    for (let lat = 36.5; lat <= 47.2; lat += 0.173) for (let lon = 6.4; lon <= 18.8; lon += 0.211) points.push([lon, lat]);
    // Punti esattamente sui bordi della griglia (l'ultimo a destra e a sinistra di ogni riga): sono i più delicati.
    const edge = 14 / 111.32;
    for (let row = 290; row < 400; row += 7) points.push([9.0, row * edge], [9.0, row * edge - 1e-9], [9.0, row * edge + 1e-9]);
    const lonValues = sql.join(points.map(([lon, lat]) => sql`(${lon}::float8, ${lat}::float8)`));
    const result = await sql<{ lon: number; lat: number; tile_id: string }>`
      SELECT lon, lat, ${sql.raw(tileIdExpression("lat", "lon"))} AS tile_id
      FROM (VALUES ${lonValues}) AS v(lon, lat)
    `.execute(db);
    expect(result.rows.length).toBe(points.length);
    const different = result.rows.filter((row) => tileForPoint(row.lon, row.lat).id !== row.tile_id);
    expect(different).toEqual([]);
  });

  it("prezzo VECCHIO in un riquadro appena aggiornato → compare nel corridoio; lo stesso prezzo in un riquadro non aggiornato → non compare", async () => {
    await setTile(tileA(), hoursAgo(0.1)); // aggiornato 6 minuti fa
    expect(await corridorIds()).toEqual([A.id]);
    expect(await staleIds()).toEqual([B.id]); // B è escluso SOLO per età; A non più
  });

  it("un riquadro aggiornato PRIMA della soglia non aiuta (conta come non aggiornato)", async () => {
    await setTile(tileA(), hoursAgo(100));
    expect(await corridorIds()).toEqual([]);
    expect(await staleIds()).toEqual([A.id, B.id]);
  });

  it("senza riquadro (mai interrogato, o fonte spenta) vale la sola data di comunicazione", async () => {
    await setTile(tileA(), null);
    expect(await corridorIds()).toEqual([]);
    await setPrice(A.id, hoursAgo(10)); // comunicato di recente: fresco anche senza riquadro
    expect(await corridorIds()).toEqual([A.id]);
    expect(await staleIds()).toEqual([B.id]);
    await setPrice(A.id, hoursAgo(120));
  });

  it("la soglia scelta dall'utente («Cambia soglia») vale anche per la conferma del riquadro", async () => {
    await setTile(tileA(), hoursAgo(30));
    expect(await corridorIds()).toEqual([A.id]); // 30 h ≤ 72 h
    const strict = await repo.findCorridorPrices({ ...QUERY, maxAgeHours: 24 });
    expect(strict.map((row) => row.stationId)).toEqual([]); // 30 h > 24 h: non confermato entro 24 h
  });

  it("la data di comunicazione resta quella vera: il riquadro conferma il prezzo ma non la sposta", async () => {
    await setTile(tileA(), hoursAgo(0.1));
    const [row] = (await repo.findCorridorPrices(QUERY)).filter((r) => r.stationId === A.id);
    expect(row).toBeDefined();
    expect(new Date(row!.communicatedAt).getTime()).toBeLessThan(hoursAgo(100).getTime());
    expect(row!.price).toBe(1.999);
  });

  it("la mediana nazionale usa la stessa regola: una stazione confermata dal riquadro entra nel campione, una no", async () => {
    await setTile(tileA(), null);
    const without = await national();
    await setTile(tileA(), hoursAgo(0.1));
    expect(await national()).toBe(without + 1);
  });

  it("il dettaglio stazione mostra i prezzi confermati dal riquadro (con la loro data di comunicazione) e non quelli non confermati", async () => {
    await setTile(tileA(), hoursAgo(0.1));
    const confirmed = await repo.getStationPrices(A.id, 72);
    expect(confirmed).toHaveLength(1);
    expect(new Date(confirmed[0]!.communicatedAt).getTime()).toBeLessThan(hoursAgo(100).getTime());
    expect(await repo.getStationPrices(B.id, 72)).toEqual([]);
    await setTile(tileA(), null);
    expect(await repo.getStationPrices(A.id, 72)).toEqual([]);
  });
});

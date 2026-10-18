import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { tileIdExpression } from "../src/db/tileId";

const schema = readFileSync(fileURLToPath(new URL("../../../db/schema.sql", import.meta.url)), "utf8");

// Nessun database: guardia contro la deriva tra `db/schema.sql` e il codice che lo ripete.
describe("db/schema.sql", () => {
  it("la colonna generata tile_id usa la stessa espressione di tileIdExpression()", () => {
    expect(schema).toContain(tileIdExpression());
  });

  it("è idempotente: ogni creazione usa IF NOT EXISTS", () => {
    const creations = schema.match(/^CREATE (?:EXTENSION|TABLE|INDEX|UNIQUE INDEX)[^\n]*/gm) ?? [];
    expect(creations.length).toBeGreaterThanOrEqual(9);
    for (const line of creations) expect(line).toMatch(/IF NOT EXISTS/);
  });

  it("definisce le tabelle usate dall'API", () => {
    for (const table of ["stations", "fuel_prices", "ingestion_runs", "api_usage", "live_price_tiles"]) {
      expect(schema).toContain(`CREATE TABLE IF NOT EXISTS ${table} (`);
    }
  });
});

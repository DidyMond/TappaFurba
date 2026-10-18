import { describe, expect, it, vi } from "vitest";

// `src/env` legge process.env all'importazione: senza DATABASE_URL (la CI non ha un .env) fallirebbe prima dei test.
vi.hoisted(() => {
  process.env.DATABASE_URL ??= "postgresql://u:p@localhost:5433/db";
});
import { parseEnv } from "../src/env";

const base = { DATABASE_URL: "postgresql://u:p@localhost:5433/db" };
const SK = "sk." + "a".repeat(40);

describe("validazione dell'ambiente", () => {
  it("accetta la configurazione minima con i default sicuri: nessun proxy fidato, /ingest disattivato", () => {
    const env = parseEnv(base);
    expect(env.TRUST_PROXY).toBe(false);
    expect(env.INGEST_TOKEN).toBeUndefined();
    expect(env.DIRECTIONS_SOFT_LIMIT).toBeLessThanOrEqual(env.DIRECTIONS_HARD_LIMIT);
  });

  it("TRUST_PROXY: false, true o il numero di proxy; altro è rifiutato", () => {
    expect(parseEnv({ ...base, TRUST_PROXY: "false" }).TRUST_PROXY).toBe(false);
    expect(parseEnv({ ...base, TRUST_PROXY: "true" }).TRUST_PROXY).toBe(true);
    expect(parseEnv({ ...base, TRUST_PROXY: "1" }).TRUST_PROXY).toBe(1);
    expect(parseEnv({ ...base, TRUST_PROXY: "" }).TRUST_PROXY).toBe(false);
    for (const bad of ["si", "-1", "1.5", "127.0.0.1"]) {
      expect(() => parseEnv({ ...base, TRUST_PROXY: bad })).toThrow();
    }
  });

  it("DIRECTIONS_SOFT_LIMIT oltre DIRECTIONS_HARD_LIMIT è rifiutato (il kill switch non scatterebbe mai)", () => {
    expect(() => parseEnv({ ...base, DIRECTIONS_SOFT_LIMIT: "90000", DIRECTIONS_HARD_LIMIT: "80000" })).toThrow(/SOFT_LIMIT/);
    expect(parseEnv({ ...base, DIRECTIONS_SOFT_LIMIT: "5", DIRECTIONS_HARD_LIMIT: "5" }).DIRECTIONS_HARD_LIMIT).toBe(5);
  });

  it("MAPBOX_SERVER_TOKEN: un token pubblico (pk.) come token del server è rifiutato in produzione e segnalato altrove", () => {
    const pk = "pk." + "a".repeat(40);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(parseEnv({ ...base, MAPBOX_SERVER_TOKEN: SK, NODE_ENV: "production" }).MAPBOX_SERVER_TOKEN).toBe(SK);
    expect(warn).not.toHaveBeenCalled();
    expect(parseEnv({ ...base, MAPBOX_SERVER_TOKEN: "" }).MAPBOX_SERVER_TOKEN).toBeUndefined();
    expect(() => parseEnv({ ...base, MAPBOX_SERVER_TOKEN: pk, NODE_ENV: "production" })).toThrow(/PUBBLICO/);
    expect(parseEnv({ ...base, MAPBOX_SERVER_TOKEN: pk }).MAPBOX_SERVER_TOKEN).toBe(pk); // sviluppo: parte, con un avviso
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).not.toContain(pk); // l'avviso non stampa mai il token
    warn.mockRestore();
  });

  it("GEOCODING_HARD_LIMIT: default sotto il piano gratuito (100.000), intero positivo", () => {
    expect(parseEnv(base).GEOCODING_HARD_LIMIT).toBe(95_000);
    expect(parseEnv({ ...base, GEOCODING_HARD_LIMIT: "50000" }).GEOCODING_HARD_LIMIT).toBe(50_000);
    for (const bad of ["0", "-5", "1.5", "molti"]) expect(() => parseEnv({ ...base, GEOCODING_HARD_LIMIT: bad })).toThrow();
  });

  it("INGEST_TOKEN: almeno 32 caratteri; vuoto vale non impostato", () => {
    expect(parseEnv({ ...base, INGEST_TOKEN: "x".repeat(32) }).INGEST_TOKEN).toHaveLength(32);
    expect(parseEnv({ ...base, INGEST_TOKEN: "" }).INGEST_TOKEN).toBeUndefined();
    expect(() => parseEnv({ ...base, INGEST_TOKEN: "corto" })).toThrow(/32/);
  });
});

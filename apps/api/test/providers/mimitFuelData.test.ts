import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const UA = "TappaFurba-test/0.0";
const ANAGRAFICA = "https://esempio.test/anagrafica.csv";
const PREZZI = "https://esempio.test/prezzi.csv";

// `env` si legge da process.env all'import: si fissano i valori e si importa il provider dopo, così il test non dipende dal .env di chi lo lancia.
async function loadProvider() {
  vi.resetModules();
  vi.stubEnv("DATABASE_URL", "postgresql://utente:password@localhost:5433/prova");
  vi.stubEnv("LIVE_PRICES_USER_AGENT", UA);
  vi.stubEnv("MIMIT_ANAGRAFICA_URL", ANAGRAFICA);
  vi.stubEnv("MIMIT_PREZZI_URL", PREZZI);
  const { MimitFuelDataProvider } = await import("../../src/providers/fuel-data/MimitFuelDataProvider");
  return new MimitFuelDataProvider();
}

beforeEach(() => vi.resetModules());
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("MimitFuelDataProvider", () => {
  it("scarica anagrafica e prezzi con lo User-Agent identificativo", async () => {
    const fetchMock = vi.fn(async () => new Response("csv", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const provider = await loadProvider();
    expect(await provider.fetchAnagraficaCsv()).toBe("csv");
    expect(await provider.fetchPrezziCsv()).toBe("csv");
    const calls = fetchMock.mock.calls as unknown as [string, RequestInit][];
    expect(calls.map(([url]) => url)).toEqual([ANAGRAFICA, PREZZI]);
    for (const [, init] of calls) expect((init.headers as Record<string, string>)["User-Agent"]).toBe(UA);
  });

  it("un errore HTTP si segnala con l'etichetta del file", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 503 })));
    const provider = await loadProvider();
    await expect(provider.fetchPrezziCsv()).rejects.toThrow(/prezzi.*503/);
  });
});

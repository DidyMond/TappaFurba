import type { LiveStationInput } from "@tappafurba/core";
import type { LonLat } from "@tappafurba/shared";
import { describe, expect, it } from "vitest";
import { ProviderError, RateLimitedProviderError } from "../../src/errors";
import { LivePriceRefresher, type LivePriceRefresherOptions } from "../../src/live-prices/LivePriceRefresher";
import type { LivePriceStore } from "../../src/live-prices/LivePriceStore";
import type { LivePriceProvider } from "../../src/providers/live-prices/LivePriceProvider";

/** Percorso est-ovest di ~78 km a lat 45: qualche riquadro con corridoio ±2 km. */
const ROUTE: Array<[number, number]> = [
  [9.0, 45.0],
  [10.0, 45.0],
];

class MemoryStore implements LivePriceStore {
  readonly refreshed = new Map<string, number>();
  readonly applied: string[] = [];
  constructor(private readonly clock: () => number) {}

  async getFreshTiles(ids: readonly string[], maxAgeMs: number) {
    const out = new Map<string, Date>();
    for (const id of ids) {
      const at = this.refreshed.get(id);
      if (at !== undefined && this.clock() - at <= maxAgeMs) out.set(id, new Date(at));
    }
    return out;
  }

  async applyTile(tileId: string, stations: readonly LiveStationInput[]) {
    this.refreshed.set(tileId, this.clock());
    this.applied.push(tileId);
    return { stationsUpdated: stations.length };
  }
}

class StubProvider implements LivePriceProvider {
  calls: LonLat[] = [];
  maxParallel = 0;
  private parallel = 0;
  constructor(private readonly behaviour: (center: LonLat) => Promise<LiveStationInput[]> = async () => []) {}

  async fetchZone(center: LonLat) {
    this.calls.push(center);
    this.parallel += 1;
    this.maxParallel = Math.max(this.maxParallel, this.parallel);
    try {
      return await this.behaviour(center);
    } finally {
      this.parallel -= 1;
    }
  }
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function build(provider: LivePriceProvider, overrides: Partial<LivePriceRefresherOptions> = {}) {
  let clock = 1_000_000_000_000;
  const now = () => clock;
  const store = new MemoryStore(now);
  const refresher = new LivePriceRefresher({
    provider,
    store,
    ttlMs: 30 * 60_000,
    maxTilesPerSearch: 40,
    deadlineMs: 2_000,
    concurrency: 4,
    now,
    ...overrides,
  });
  return { refresher, store, advance: (ms: number) => (clock += ms) };
}

describe("LivePriceRefresher", () => {
  it("riquadri non in cache → una chiamata ciascuno, stato 'live'", async () => {
    const provider = new StubProvider();
    const { refresher, store } = build(provider);

    const info = await refresher.ensureFresh(ROUTE, 2);

    expect(info.status).toBe("live");
    expect(info.tilesTotal).toBeGreaterThan(3);
    expect(info.tilesLive).toBe(info.tilesTotal);
    expect(provider.calls).toHaveLength(info.tilesTotal);
    expect(store.applied).toHaveLength(info.tilesTotal);
    expect(info.oldestLiveAgeMinutes).toBe(0);
  });

  it("seconda ricerca entro il TTL → nessuna nuova chiamata alla fonte (cache condivisa)", async () => {
    const provider = new StubProvider();
    const { refresher, advance } = build(provider);
    await refresher.ensureFresh(ROUTE, 2);
    const firstCalls = provider.calls.length;

    advance(10 * 60_000);
    const info = await refresher.ensureFresh(ROUTE, 2);

    expect(provider.calls).toHaveLength(firstCalls);
    expect(info.status).toBe("live");
    expect(info.oldestLiveAgeMinutes).toBe(10);
  });

  it("dopo il TTL i riquadri vengono richiesti di nuovo", async () => {
    const provider = new StubProvider();
    const { refresher, advance } = build(provider);
    const first = await refresher.ensureFresh(ROUTE, 2);
    advance(31 * 60_000);
    await refresher.ensureFresh(ROUTE, 2);
    expect(provider.calls).toHaveLength(first.tilesTotal * 2);
  });

  it("rispetta il tetto di riquadri per ricerca → 'partial'", async () => {
    const provider = new StubProvider();
    const { refresher } = build(provider, { maxTilesPerSearch: 3 });
    const info = await refresher.ensureFresh(ROUTE, 2);
    expect(provider.calls).toHaveLength(3);
    expect(info.status).toBe("partial");
    expect(info.tilesLive).toBe(3);
  });

  it("fonte giù → 'unavailable' senza lanciare: la ricerca prosegue con i prezzi già presenti", async () => {
    const provider = new StubProvider(async () => {
      throw new ProviderError("giù");
    });
    const { refresher } = build(provider, { breakerThreshold: 100 });
    const info = await refresher.ensureFresh(ROUTE, 2);
    expect(info.status).toBe("unavailable");
    expect(info.tilesLive).toBe(0);
    expect(info.oldestLiveAgeMinutes).toBeNull();
  });

  it("errori solo su alcuni riquadri → 'partial'", async () => {
    let n = 0;
    const provider = new StubProvider(async () => {
      n += 1;
      if (n % 2 === 0) throw new ProviderError("errore");
      return [];
    });
    const { refresher } = build(provider, { breakerThreshold: 100 });
    const info = await refresher.ensureFresh(ROUTE, 2);
    expect(info.status).toBe("partial");
    expect(info.tilesLive).toBeGreaterThan(0);
    expect(info.tilesLive).toBeLessThan(info.tilesTotal);
  });

  it("circuit breaker: dopo N errori consecutivi non chiama più la fonte fino al raffreddamento", async () => {
    const provider = new StubProvider(async () => {
      throw new ProviderError("giù");
    });
    const { refresher, advance } = build(provider, { breakerThreshold: 3, breakerCooldownMs: 60_000, concurrency: 1 });

    await refresher.ensureFresh(ROUTE, 2);
    const callsAfterFirst = provider.calls.length;
    expect(callsAfterFirst).toBeLessThanOrEqual(3);

    await refresher.ensureFresh(ROUTE, 2); // breaker aperto
    expect(provider.calls).toHaveLength(callsAfterFirst);

    advance(61_000); // raffreddato: riprova
    await refresher.ensureFresh(ROUTE, 2);
    expect(provider.calls.length).toBeGreaterThan(callsAfterFirst);
  });

  it("HTTP 429: pausa immediata (una sola chiamata), poi riprende dopo il Retry-After", async () => {
    let limited = true;
    const provider = new StubProvider(async () => {
      if (limited) throw new RateLimitedProviderError("429", 45_000);
      return [];
    });
    const { refresher, advance } = build(provider, { concurrency: 1 });

    const first = await refresher.ensureFresh(ROUTE, 2);
    expect(first.status).toBe("unavailable");
    expect(provider.calls).toHaveLength(1); // le altre in coda non partono

    advance(20_000);
    await refresher.ensureFresh(ROUTE, 2);
    expect(provider.calls).toHaveLength(1); // ancora in pausa

    limited = false;
    advance(30_000); // superati i 45 s
    const later = await refresher.ensureFresh(ROUTE, 2);
    expect(later.status).toBe("live");
  });

  it("HTTP 429 senza Retry-After usa la pausa predefinita", async () => {
    const provider = new StubProvider(async () => {
      throw new RateLimitedProviderError("429");
    });
    const { refresher, advance } = build(provider, { concurrency: 1, rateLimitCooldownMs: 60_000 });
    await refresher.ensureFresh(ROUTE, 2);
    advance(59_000);
    await refresher.ensureFresh(ROUTE, 2);
    expect(provider.calls).toHaveLength(1);
    advance(2_000);
    await refresher.ensureFresh(ROUTE, 2);
    expect(provider.calls.length).toBeGreaterThan(1);
  });

  it("scadenza: risponde con quello che ha e le chiamate lente proseguono in background", async () => {
    const provider = new StubProvider(async () => {
      await delay(150);
      return [];
    });
    const { refresher, store } = build(provider, { deadlineMs: 30, concurrency: 8 });

    const started = Date.now();
    const info = await refresher.ensureFresh(ROUTE, 2);

    expect(Date.now() - started).toBeLessThan(120);
    expect(info.status).toBe("unavailable"); // nulla completato entro 30 ms
    await delay(300);
    expect(store.applied.length).toBeGreaterThan(0); // la cache si è comunque scaldata

    const next = await refresher.ensureFresh(ROUTE, 2);
    expect(next.status).toBe("live");
  });

  it("non supera mai la concorrenza configurata", async () => {
    const provider = new StubProvider(async () => {
      await delay(15);
      return [];
    });
    const { refresher } = build(provider, { concurrency: 2 });
    await refresher.ensureFresh(ROUTE, 2);
    expect(provider.maxParallel).toBeLessThanOrEqual(2);
    expect(provider.maxParallel).toBeGreaterThan(0);
  });

  it("ricerche simultanee sulla stessa zona condividono le richieste (una per riquadro)", async () => {
    const provider = new StubProvider(async () => {
      await delay(20);
      return [];
    });
    const { refresher } = build(provider);
    const [a, b] = await Promise.all([refresher.ensureFresh(ROUTE, 2), refresher.ensureFresh(ROUTE, 2)]);
    expect(provider.calls).toHaveLength(a.tilesTotal);
    expect(a.status).toBe("live");
    expect(b.status).toBe("live");
  });

  it("cache non leggibile → 'unavailable', mai un'eccezione", async () => {
    const provider = new StubProvider();
    const { refresher, store } = build(provider);
    store.getFreshTiles = async () => {
      throw new Error("db giù");
    };
    const info = await refresher.ensureFresh(ROUTE, 2);
    expect(info.status).toBe("unavailable");
    expect(provider.calls).toHaveLength(0);
  });

  it("percorso vuoto → nulla da fare", async () => {
    const provider = new StubProvider();
    const { refresher } = build(provider);
    expect(await refresher.ensureFresh([], 2)).toMatchObject({ tilesTotal: 0 });
    expect(provider.calls).toHaveLength(0);
  });
});

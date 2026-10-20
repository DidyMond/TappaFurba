import { PROXY_CIRCUITY_FACTOR, tileForPoint } from "@tappafurba/core";
import type { NearbyRequest, SearchRequest, StationPriceEntry } from "@tappafurba/shared";
import { describe, expect, it } from "vitest";
import { AppError, BudgetExhaustedError, ProviderError } from "../../src/errors";
import type { BudgetGate, BudgetStatus } from "../../src/providers/routing/DirectionsBudget";
import { MockRoutingProvider } from "../../src/providers/routing/MockRoutingProvider";
import type { RouteOptions, RouteResult, RoutingProvider } from "../../src/providers/routing/RoutingProvider";
import { RESULT_LIMIT, REFINE_EXTRA_CALLS_CAP, REFINE_TOP_N, SearchService } from "../../src/search/SearchService";
import { type SearchSession, SearchSessionStore } from "../../src/search/SearchSessionStore";
import { InMemoryStationRepository, row } from "../helpers/inMemoryStationRepository";

/**
 * Scenario: tratta est-ovest a latitudine 45.0 da lon 9.0 a lon 10.0 (~78 km).
 * 1° di latitudine ≈ 111.19 km, quindi 0.001° ≈ 0.11 km di distanza laterale.
 */
const ORIGIN = { lon: 9.0, lat: 45.0 };
const DESTINATION = { lon: 10.0, lat: 45.0 };

const request: SearchRequest = {
  origin: ORIGIN,
  destination: DESTINATION,
  fuelType: "benzina",
  liters: 45,
  maxDetourKm: 5,
  consumptionKmPerLiter: 15,
  valueOfTimePerMinute: 0.15,
  onlySelf: true,
  maxPriceAgeHours: 72,
  avoidMotorway: false,
  avoidTolls: false,
  avoidFerries: false,
};

// Tre stazioni sul percorso (≤ 0.5 km) → livello 1 di P_avg: mediana = 1.82
const onRoute = () => [
  row({ stationId: 1, lon: 9.2, lat: 45.001, price: 1.8 }),
  row({ stationId: 2, lon: 9.4, lat: 45.002, price: 1.82 }),
  row({ stationId: 3, lon: 9.6, lat: 45.003, price: 1.84 }),
];

function buildService(
  rows = onRoute(),
  options: {
    national?: { median: number; sampleSize: number } | null;
    routing?: RoutingProvider;
    budget?: BudgetStatus;
    stationPrices?: Record<number, StationPriceEntry[]>;
  } = {},
) {
  const routing = options.routing ?? new MockRoutingProvider();
  const budgetStatus: BudgetGate = { status: async () => options.budget ?? "ok" };
  const repository = new InMemoryStationRepository(rows, options.national ?? null, undefined, options.stationPrices);
  const service = new SearchService({ routing, repository, budget: budgetStatus, sessions: new SearchSessionStore() });
  return { service, repository, routing };
}

/** Routing con comportamento scriptato per le richieste "via stazione" (3 waypoint). */
class ScriptedRouting implements RoutingProvider {
  readonly inner = new MockRoutingProvider();
  viaCalls = 0;
  constructor(private readonly onVia: (viaStation: { lon: number; lat: number }) => Promise<RouteResult | null>) {}

  /** Opzioni ricevute da ogni richiesta (diretto e vie), per le asserzioni. */
  readonly receivedOptions: RouteOptions[] = [];

  async getRoute(waypoints: Parameters<RoutingProvider["getRoute"]>[0], options?: RouteOptions) {
    this.receivedOptions.push({ ...options });
    if (waypoints.length === 3) {
      this.viaCalls += 1;
      return this.onVia(waypoints[1]!);
    }
    return this.inner.getRoute(waypoints, options);
  }
}

describe("SearchService.search — ranking e prezzo di riferimento", () => {
  it("usa la mediana delle stazioni sul percorso come prezzo di riferimento (livello 1)", async () => {
    const { service } = buildService();
    const response = await service.search(request);

    expect(response.referencePrice).toEqual({ value: 1.82, level: "on_route", sampleSize: 3 });
    expect(response.costPerKm).toBeCloseTo(1.82 / 15, 4);
  });

  it("ordina per risparmio netto decrescente e calcola S_net con la formula del PRD", async () => {
    const { service } = buildService([
      ...onRoute(),
      row({ stationId: 5, lon: 9.5, lat: 45.012, price: 1.7 }), // ~1.33 km laterale, molto più economica
    ]);
    const { results } = await service.search(request);

    expect(results[0]!.station.id).toBe(5);
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1]!.netSavings).toBeGreaterThanOrEqual(results[i]!.netSavings);
    }

    const best = results[0]!;
    // (1.82 − 1.70) × 45 L = 5.40 € lordi, meno costo carburante e tempo della deviazione stimata
    expect(best.grossSavings).toBeCloseTo(5.4, 2);
    expect(best.detourCost).toBeGreaterThan(0);
    expect(best.netSavings).toBeCloseTo(best.grossSavings - best.detourCost, 1);
    expect(best.detourSource).toBe("proxy");
  });

  it("una stazione più cara del riferimento ha risparmio netto negativo ma resta in elenco", async () => {
    const { service } = buildService([...onRoute(), row({ stationId: 6, lon: 9.5, lat: 45.001, price: 2.1 })]);
    const { results } = await service.search(request);
    const expensive = results.find((r) => r.station.id === 6);
    expect(expensive?.netSavings).toBeLessThan(0);
  });

  it("esclude le stazioni la cui deviazione stimata supera la deviazione massima", async () => {
    // 0.02° ≈ 2.22 km laterali → deviazione proxy ≈ 5.56 km
    const rows = [...onRoute(), row({ stationId: 4, lon: 9.5, lat: 45.02, price: 1.6 })];

    const at5 = await buildService(rows).service.search({ ...request, maxDetourKm: 5 });
    expect(at5.results.map((r) => r.station.id)).not.toContain(4);

    const at6 = await buildService(rows).service.search({ ...request, maxDetourKm: 6 });
    expect(at6.results.map((r) => r.station.id)).toContain(4);
  });

  it("il raggio del corridoio segue lo slider della deviazione (con minimo 1 km e massimo 15 km)", async () => {
    const { service, repository } = buildService();
    await service.search({ ...request, maxDetourKm: 5 });
    expect(repository.lastQuery?.radiusMeters).toBe(5000);

    await service.search({ ...request, maxDetourKm: 1 });
    expect(repository.lastQuery?.radiusMeters).toBe(1000);

    await service.search({ ...request, maxDetourKm: 10 });
    expect(repository.lastQuery?.radiusMeters).toBe(10000);
  });

  it("passa al repository il tracciato in WKT, il carburante e la soglia di freschezza", async () => {
    const { service, repository } = buildService();
    await service.search({ ...request, fuelType: "diesel", maxPriceAgeHours: 24 });
    expect(repository.lastQuery?.routeWkt).toMatch(/^LINESTRING\(9\.000000 45\.000000, .*10\.000000 45\.000000\)$/);
    expect(repository.lastQuery?.fuelType).toBe("diesel");
    expect(repository.lastQuery?.maxAgeHours).toBe(24);
  });

  it("restituisce metadati: percorso, candidati valutati e data dell'ultima ingestione", async () => {
    const { service } = buildService();
    const response = await service.search(request);
    expect(response.route.distanceKm).toBeGreaterThan(75);
    expect(response.route.durationMinutes).toBeGreaterThan(0);
    // Il tracciato per la mappa parte dall'origine e arriva alla destinazione, con coordinate a 5 decimali.
    const { geometry } = response.route;
    expect(geometry.length).toBeGreaterThanOrEqual(2);
    expect(geometry[0]).toEqual([9, 45]);
    expect(geometry[geometry.length - 1]).toEqual([10, 45]);
    for (const [lon, lat] of geometry) {
      expect(Number(lon.toFixed(5))).toBe(lon);
      expect(Number(lat.toFixed(5))).toBe(lat);
    }
    expect(response.candidatesEvaluated).toBe(3);
    expect(response.pricesUpdatedAt).toBe("2026-09-28T07:00:00.000Z");
    expect(response.searchId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("pricesUpdatedAt è null se non esiste alcuna ingestione riuscita", async () => {
    const repository = new InMemoryStationRepository(onRoute(), null, null);
    const service = new SearchService({
      routing: new MockRoutingProvider(),
      repository,
      budget: { status: async () => "ok" },
      sessions: new SearchSessionStore(),
    });
    expect((await service.search(request)).pricesUpdatedAt).toBeNull();
  });

  it("arrotonda i valori in uscita (prezzi a 3 decimali, importi a 2)", async () => {
    const { service } = buildService([...onRoute(), row({ stationId: 5, lon: 9.5, lat: 45.012, price: 1.7 })]);
    const { results } = await service.search(request);
    for (const result of results) {
      expect(Math.round(result.netSavings * 100) / 100).toBe(result.netSavings);
      expect(Math.round(result.price * 1000) / 1000).toBe(result.price);
    }
  });

  it("limita la risposta alle migliori RESULT_LIMIT stazioni ma dichiara quante ne ha valutate", async () => {
    const many = Array.from({ length: RESULT_LIMIT + 30 }, (_, i) =>
      row({ stationId: 100 + i, lon: 9.1 + i * 0.01, lat: 45.001, price: 1.7 + i * 0.001 }),
    );
    const { service } = buildService(many);
    const response = await service.search({ ...request, maxDetourKm: 5 });
    expect(response.candidatesEvaluated).toBe(RESULT_LIMIT + 30);
    expect(response.results).toHaveLength(RESULT_LIMIT);
  });
});

describe("SearchService.search — stazioni escluse solo per età del prezzo", () => {
  // Il repository fittizio non filtra per età: le stazioni «stantie» sono quelle che findStaleStations restituisce.
  const staleAt = (stationId: number, lon: number, lat: number) => ({ stationId, lon, lat });
  const build = (stale: { stationId: number; lon: number; lat: number }[], overrides: Partial<SearchRequest> = {}) => {
    const repository = new InMemoryStationRepository(onRoute(), null, undefined, undefined, stale);
    const service = new SearchService({ routing: new MockRoutingProvider(), repository, budget: { status: async () => "ok" }, sessions: new SearchSessionStore() });
    return { repository, run: () => service.search({ ...request, ...overrides }) };
  };

  it("senza stazioni stantie il conteggio è 0 e riporta la soglia usata", async () => {
    const { run } = build([]);
    expect((await run()).staleStations).toEqual({ count: 0, maxAgeHours: 72 });
  });

  it("conta le stazioni scartate per età che, con la stima geometrica, starebbero entro la deviazione massima", async () => {
    // deviazione proxy = 2 × laterale × 1,25: con soglia 5 km la laterale massima è 2 km (0.018° ≈ 2.0 km)
    const { run, repository } = build([
      staleAt(10, 9.3, 45.005), // ~0.56 km → proxy 1,4 km: conta
      staleAt(11, 9.5, 45.015), // ~1.67 km → proxy 4,2 km: conta
      staleAt(12, 9.7, 45.03), //  ~3.3 km → proxy 8,3 km > 5: NON conta (sarebbe scartata comunque)
    ]);
    const response = await run();
    expect(response.staleStations).toEqual({ count: 2, maxAgeHours: 72 });
    // il repository riceve carburante, soglia e «Solo Self» della ricerca
    expect(repository.lastStaleQuery).toMatchObject({ fuelType: "benzina", maxAgeHours: 72, onlySelf: true });
  });

  it("segue la soglia di validità e la deviazione massima della richiesta", async () => {
    const { run, repository } = build([staleAt(10, 9.5, 45.015)], { maxPriceAgeHours: 120, maxDetourKm: 3 });
    const response = await run();
    expect(response.staleStations).toEqual({ count: 0, maxAgeHours: 120 }); // proxy 4,2 km > 3
    expect(repository.lastStaleQuery?.maxAgeHours).toBe(120);
  });

  it("non cambia i risultati: le stazioni stantie non entrano nell'elenco né nel conteggio dei candidati", async () => {
    const { run } = build([staleAt(10, 9.3, 45.005)]);
    const response = await run();
    expect(response.results.map((r) => r.station.id).sort()).toEqual([1, 2, 3]);
    expect(response.candidatesEvaluated).toBe(3);
  });
});

describe("SearchService.search — freschezza = ultima conferma della fonte", () => {
  const NOW = new Date("2026-10-09T12:00:00.000Z");
  const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();
  const tileOf = (lon: number, lat: number) => tileForPoint(lon, lat).id;

  // S1: prezzo comunicato 5 giorni fa; S2: stesso prezzo vecchio; S3: comunicato 30 ore fa; S4 e S5: comunicati 10 ore fa.
  // Nei test S1 sta in un riquadro appena aggiornato (confermato) e S2 no; S3, S4 e S5 sono freschi per la sola comunicazione
  // (S3 fino a 30 ore, S4 e S5 fino a 10).
  const rows = () => [
    row({ stationId: 1, lon: 9.2, lat: 45.001, price: 1.8, communicatedAt: hoursAgo(120) }),
    row({ stationId: 2, lon: 9.4, lat: 45.002, price: 1.82, communicatedAt: hoursAgo(120) }),
    row({ stationId: 3, lon: 9.6, lat: 45.003, price: 1.84, communicatedAt: hoursAgo(30) }),
    row({ stationId: 4, lon: 9.7, lat: 45.004, price: 1.86, communicatedAt: hoursAgo(10) }),
    row({ stationId: 5, lon: 9.8, lat: 45.005, price: 1.88, communicatedAt: hoursAgo(10) }),
  ];
  const NATIONAL = { median: 1.9, sampleSize: 50 };
  const build = (tileRefreshedAt: Record<string, string>) => {
    const repository = new InMemoryStationRepository(rows(), NATIONAL);
    repository.freshness = { now: NOW, tileRefreshedAt };
    const service = new SearchService({ routing: new MockRoutingProvider(), repository, budget: { status: async () => "ok" }, sessions: new SearchSessionStore() });
    return { run: (overrides: Partial<SearchRequest> = {}) => service.search({ ...request, ...overrides }) };
  };
  const ids = (response: { results: Array<{ station: { id: number } }> }) => response.results.map((r) => r.station.id).sort();
  const S1_TILE = () => ({ [tileOf(9.2, 45.001)]: hoursAgo(0.2) });

  it("i riquadri delle prime due stazioni sono distinti (il test misura quello che dice)", () => {
    expect(tileOf(9.2, 45.001)).not.toBe(tileOf(9.4, 45.002));
  });

  it("stazione con prezzo vecchio in un riquadro appena aggiornato → compare; stesso prezzo in un riquadro non aggiornato → non compare", async () => {
    const response = await build(S1_TILE()).run();
    expect(ids(response)).toEqual([1, 3, 4, 5]);
    expect(ids(response)).not.toContain(2);
  });

  it("la stazione non confermata conta nell'avviso «N stazioni non mostrate»; quella confermata no", async () => {
    expect((await build(S1_TILE()).run()).staleStations).toEqual({ count: 1, maxAgeHours: 72 });
  });

  it("senza riquadri aggiornati (fonte spenta o mai interrogata) torna la sola data di comunicazione", async () => {
    const response = await build({}).run();
    expect(ids(response)).toEqual([3, 4, 5]);
    expect(response.staleStations.count).toBe(2); // S1 e S2
  });

  it("un riquadro aggiornato prima della soglia non aiuta", async () => {
    const response = await build({ [tileOf(9.2, 45.001)]: hoursAgo(100) }).run();
    expect(ids(response)).toEqual([3, 4, 5]);
  });

  it("si compone con il prezzo di riferimento: la mediana usa anche le stazioni confermate", async () => {
    const withTile = await build(S1_TILE()).run();
    expect(withTile.referencePrice).toMatchObject({ level: "on_route", sampleSize: 4, value: 1.85 }); // 1,80 1,84 1,86 1,88
    const without = await build({}).run();
    expect(without.referencePrice).toMatchObject({ level: "on_route", sampleSize: 3, value: 1.86 }); // 1,84 1,86 1,88
  });

  it("si compone con «Cambia soglia»: la conferma del riquadro vale entro la soglia scelta dall'utente", async () => {
    const { run } = build({ [tileOf(9.2, 45.001)]: hoursAgo(30) });
    expect(ids(await run({ maxPriceAgeHours: 72 }))).toEqual([1, 3, 4, 5]);
    // soglia di 24 ore: il riquadro è stato aggiornato 30 ore fa e S3 è stata comunicata 30 ore fa → restano solo S4 e S5
    const strict = await run({ maxPriceAgeHours: 24 });
    expect(ids(strict)).toEqual([4, 5]);
    expect(strict.staleStations).toEqual({ count: 3, maxAgeHours: 24 }); // S1, S2 e S3
  });

  it("la data di comunicazione resta un fatto: nel risultato il prezzo mostra la sua data, non quella del riquadro", async () => {
    const confirmed = (await build(S1_TILE()).run()).results.find((r) => r.station.id === 1)!;
    expect(confirmed.priceUpdatedAt).toBe(hoursAgo(120));
  });
});

describe("SearchService.search — cascata P_avg", () => {
  it("con meno di 3 stazioni sul percorso ricade sul corridoio (livello 2)", async () => {
    const rows = [
      row({ stationId: 1, lon: 9.2, lat: 45.001, price: 1.8 }), // on-route
      row({ stationId: 2, lon: 9.4, lat: 45.002, price: 1.82 }), // on-route
      row({ stationId: 3, lon: 9.6, lat: 45.01, price: 1.9 }), // ~1.1 km: solo corridoio
    ];
    const { referencePrice } = await buildService(rows).service.search(request);
    expect(referencePrice.level).toBe("corridor");
    expect(referencePrice.sampleSize).toBe(3);
    expect(referencePrice.value).toBe(1.82);
  });

  it("con meno di 3 stazioni nel corridoio ricade sulla mediana nazionale (livello 3)", async () => {
    const rows = [row({ stationId: 1, lon: 9.2, lat: 45.001, price: 1.8 })];
    const { referencePrice } = await buildService(rows, { national: { median: 1.95, sampleSize: 30000 } }).service.search(request);
    expect(referencePrice).toEqual({ value: 1.95, level: "national", sampleSize: 30000 });
  });

  it("carburante raro senza stazioni nel corridoio: usa comunque la mediana nazionale", async () => {
    const { referencePrice, results } = await buildService([], { national: { median: 1.79, sampleSize: 1578 } }).service.search({
      ...request,
      fuelType: "metano",
    });
    expect(referencePrice.level).toBe("national");
    expect(results).toEqual([]);
  });

  it("senza dati sufficienti a nessun livello → errore NO_PRICE_DATA", async () => {
    const promise = buildService([], { national: null }).service.search(request);
    await expect(promise).rejects.toBeInstanceOf(AppError);
    await expect(promise).rejects.toMatchObject({ code: "NO_PRICE_DATA", httpStatus: 422 });
  });

  it("una stazione lontana e molto cara non altera il riferimento on-route", async () => {
    const withOutlier = [...onRoute(), row({ stationId: 9, lon: 9.5, lat: 45.03, price: 2.6 })];
    const a = await buildService(onRoute()).service.search({ ...request, maxDetourKm: 5 });
    const b = await buildService(withOutlier).service.search({ ...request, maxDetourKm: 5 });
    expect(b.referencePrice.value).toBe(a.referencePrice.value);
  });
});

describe("SearchService.search — Self / Servito", () => {
  const withServitoOnly = () => [
    ...onRoute(),
    row({ stationId: 7, lon: 9.7, lat: 45.001, price: 1.75, isSelf: false }), // solo Servito
  ];

  it("'Solo Self' attivo (default): la stazione solo-Servito è esclusa", async () => {
    const { results, candidatesEvaluated } = await buildService(withServitoOnly()).service.search({ ...request, onlySelf: true });
    expect(results.map((r) => r.station.id)).not.toContain(7);
    expect(candidatesEvaluated).toBe(3);
  });

  it("'Solo Self' disattivato: la stazione solo-Servito compare con il flag servitoOnly", async () => {
    const { results } = await buildService(withServitoOnly()).service.search({ ...request, onlySelf: false });
    const servito = results.find((r) => r.station.id === 7);
    expect(servito).toBeDefined();
    expect(servito?.servitoOnly).toBe(true);
    expect(servito?.isSelf).toBe(false);
    expect(servito?.price).toBe(1.75);
  });

  it("una stazione con entrambi i prezzi usa sempre il Self, mai una media", async () => {
    const rows = [
      row({ stationId: 8, lon: 9.5, lat: 45.001, price: 1.7, isSelf: true }),
      row({ stationId: 8, lon: 9.5, lat: 45.001, price: 1.9, isSelf: false }),
      ...onRoute(),
    ];
    const { results } = await buildService(rows).service.search({ ...request, onlySelf: false });
    const both = results.find((r) => r.station.id === 8);
    expect(both).toMatchObject({ price: 1.7, isSelf: true, servitoOnly: false });
  });

  it("il prezzo di riferimento usa lo stesso criterio di scelta prezzo per stazione", async () => {
    // Tre stazioni: due Self (1.80, 1.82) e una solo-Servito (2.00)
    const rows = [
      row({ stationId: 1, lon: 9.2, lat: 45.001, price: 1.8 }),
      row({ stationId: 2, lon: 9.4, lat: 45.002, price: 1.82 }),
      row({ stationId: 3, lon: 9.6, lat: 45.003, price: 2.0, isSelf: false }),
    ];
    const selfOnly = await buildService(rows, { national: { median: 1.9, sampleSize: 1000 } }).service.search({ ...request, onlySelf: true });
    expect(selfOnly.referencePrice.level).toBe("national"); // solo 2 campioni Self → cascata
    const mixed = await buildService(rows).service.search({ ...request, onlySelf: false });
    expect(mixed.referencePrice).toMatchObject({ level: "on_route", value: 1.82, sampleSize: 3 });
  });
});

describe("SearchService.search — errori", () => {
  it("nessun percorso tra origine e destinazione → NO_ROUTE", async () => {
    const routing: RoutingProvider = { getRoute: async () => null };
    const promise = buildService(onRoute(), { routing }).service.search(request);
    await expect(promise).rejects.toMatchObject({ code: "NO_ROUTE", httpStatus: 422 });
  });

  it("un errore del provider di routing si propaga invariato", async () => {
    const routing: RoutingProvider = { getRoute: async () => { throw new BudgetExhaustedError(); } };
    await expect(buildService(onRoute(), { routing }).service.search(request)).rejects.toBeInstanceOf(BudgetExhaustedError);
  });
});

describe("SearchService — ricalcolo in background con routing reale (top-N)", () => {
  const stations = () => [
    ...onRoute(),
    row({ stationId: 5, lon: 9.5, lat: 45.012, price: 1.7 }),
  ];

  it("la risposta immediata è provvisoria: stato pending e deviazioni 'proxy'", async () => {
    const { service } = buildService(stations());
    const response = await service.search(request);
    expect(response.refinement).toEqual({ status: "pending" });
    expect(response.results.every((r) => r.detourSource === "proxy")).toBe(true);
    await service.waitForRefinement(response.searchId);
  });

  it("a ricalcolo concluso le prime stazioni hanno deviazione verificata dal routing", async () => {
    const { service, routing } = buildService(stations());
    const { searchId } = await service.search(request);
    await service.waitForRefinement(searchId);

    const refined = service.getRefinement(searchId)!;
    expect(refined.refinement).toEqual({ status: "done" });
    expect(refined.results.filter((r) => r.detourSource === "routing")).toHaveLength(4); // tutte e 4 (< REFINE_TOP_N)
    // 1 chiamata per il percorso A→B + 1 per ciascuna stazione verificata (A→stazione→B)
    expect((routing as MockRoutingProvider).calls.filter((c) => c.length === 2)).toHaveLength(1);
    expect((routing as MockRoutingProvider).calls.filter((c) => c.length === 3)).toHaveLength(4);
  });

  it("verifica al massimo REFINE_TOP_N stazioni, anche se i risultati sono di più", async () => {
    const many = Array.from({ length: 12 }, (_, i) =>
      row({ stationId: 200 + i, lon: 9.1 + i * 0.05, lat: 45.001, price: 1.6 + i * 0.01 }),
    );
    const { service, routing } = buildService(many);
    const { searchId } = await service.search(request);
    await service.waitForRefinement(searchId);

    expect((routing as MockRoutingProvider).calls.filter((c) => c.length === 3)).toHaveLength(REFINE_TOP_N);
    const refined = service.getRefinement(searchId)!;
    expect(refined.results.filter((r) => r.detourSource === "routing")).toHaveLength(REFINE_TOP_N);
  });

  it("verifica le stazioni migliori secondo il ranking proxy e passa i waypoint A → stazione → B", async () => {
    const { service, routing } = buildService(stations());
    const first = await service.search(request);
    await service.waitForRefinement(first.searchId);

    const viaCalls = (routing as MockRoutingProvider).calls.filter((c) => c.length === 3);
    for (const call of viaCalls) {
      expect(call[0]).toEqual(ORIGIN);
      expect(call[2]).toEqual(DESTINATION);
    }
    expect(viaCalls.map((c) => c[1]!.lon)).toContain(9.5); // la stazione n. 5, in testa al ranking
  });

  it("la deviazione verificata ricalcola risparmio netto e può riordinare la classifica", async () => {
    // Il routing reale dice che la stazione economica (id 5) richiede 4.4 km di deviazione.
    const direct = await new MockRoutingProvider().getRoute([ORIGIN, DESTINATION]);
    const routing = new ScriptedRouting(async (station) =>
      station.lon === 9.5
        ? { distanceKm: direct!.distanceKm + 4.4, durationMinutes: direct!.durationMinutes + 7, geometry: [] }
        : { distanceKm: direct!.distanceKm + 0.1, durationMinutes: direct!.durationMinutes + 0.2, geometry: [] },
    );
    const { service } = buildService(stations(), { routing });
    const first = await service.search(request);
    const proxyNet = first.results.find((r) => r.station.id === 5)!.netSavings;
    await service.waitForRefinement(first.searchId);

    const refined = service.getRefinement(first.searchId)!.results.find((r) => r.station.id === 5)!;
    expect(refined.detourSource).toBe("routing");
    expect(refined.detourKm).toBeCloseTo(4.4, 2);
    expect(refined.detourMinutes).toBeCloseTo(7, 1);
    expect(refined.netSavings).not.toBe(proxyNet);
    // (1.82 − 1.70) × 45 = 5.40 − 4.4 km × 0.1213 − 7 min × 0.15 = 5.40 − 0.534 − 1.05
    expect(refined.netSavings).toBeCloseTo(5.4 - 4.4 * (1.82 / 15) - 7 * 0.15, 1);
  });

  it("una stazione la cui deviazione REALE supera il massimo viene esclusa dall'elenco", async () => {
    const direct = await new MockRoutingProvider().getRoute([ORIGIN, DESTINATION]);
    const routing = new ScriptedRouting(async (station) =>
      station.lon === 9.5
        ? { distanceKm: direct!.distanceKm + 7.5, durationMinutes: direct!.durationMinutes + 11, geometry: [] } // > 5 km
        : { distanceKm: direct!.distanceKm + 0.1, durationMinutes: direct!.durationMinutes + 0.1, geometry: [] },
    );
    const { service } = buildService(stations(), { routing });
    const first = await service.search(request);
    expect(first.results.map((r) => r.station.id)).toContain(5); // il proxy la considerava valida

    await service.waitForRefinement(first.searchId);
    const refined = service.getRefinement(first.searchId)!;
    expect(refined.results.map((r) => r.station.id)).not.toContain(5);
    expect(refined.results).toHaveLength(3);
  });

  it("se il routing di una stazione restituisce null, quella stazione mantiene la stima proxy", async () => {
    const direct = await new MockRoutingProvider().getRoute([ORIGIN, DESTINATION]);
    const scripted = new ScriptedRouting(async (station) =>
      station.lon === 9.5
        ? null
        : { distanceKm: direct!.distanceKm + 0.1, durationMinutes: direct!.durationMinutes + 0.1, geometry: [] },
    );
    const { service } = buildService(stations(), { routing: scripted });
    const first = await service.search(request);
    await service.waitForRefinement(first.searchId);

    const refined = service.getRefinement(first.searchId)!;
    expect(refined.refinement.status).toBe("done");
    expect(refined.results.find((r) => r.station.id === 5)?.detourSource).toBe("proxy");
    expect(refined.results.find((r) => r.station.id === 1)?.detourSource).toBe("routing");
  });

  it("se il routing fallisce per tutte le stazioni: stato failed, risultati proxy invariati", async () => {
    const routing = new ScriptedRouting(async () => {
      throw new Error("timeout");
    });
    const { service } = buildService(stations(), { routing });
    const first = await service.search(request);
    await service.waitForRefinement(first.searchId);

    const refined = service.getRefinement(first.searchId)!;
    expect(refined.refinement).toEqual({ status: "failed", reason: "routing_error" });
    expect(refined.results).toEqual(first.results);
    expect(refined.results.every((r) => r.detourSource === "proxy")).toBe(true);
  });

  it("KILL SWITCH — oltre la soglia soft nessuna chiamata di verifica: solo proxy, stato skipped", async () => {
    const { service, routing } = buildService(stations(), { budget: "soft_limit" });
    const response = await service.search(request);

    expect(response.refinement).toEqual({ status: "skipped", reason: "budget_soft_limit" });
    await service.waitForRefinement(response.searchId);
    expect((routing as MockRoutingProvider).calls).toHaveLength(1); // solo A→B
    expect(response.results.every((r) => r.detourSource === "proxy")).toBe(true);
    expect(service.getRefinement(response.searchId)!.refinement.status).toBe("skipped");
  });

  it("KILL SWITCH — quota esaurita durante il ricalcolo: skipped/budget_hard_limit, risultati proxy conservati", async () => {
    const routing = new ScriptedRouting(async () => {
      throw new BudgetExhaustedError();
    });
    const { service } = buildService(stations(), { routing });
    const first = await service.search(request);
    await service.waitForRefinement(first.searchId);

    const refined = service.getRefinement(first.searchId)!;
    expect(refined.refinement).toEqual({ status: "skipped", reason: "budget_hard_limit" });
    expect(refined.results).toEqual(first.results);
  });

  it("nessun risultato → nessun ricalcolo (stato done)", async () => {
    const { service } = buildService([], { national: { median: 1.8, sampleSize: 5000 } });
    const response = await service.search(request);
    expect(response.results).toEqual([]);
    expect(response.refinement).toEqual({ status: "done" });
  });

  it("getRefinement con id sconosciuto → null", () => {
    expect(buildService().service.getRefinement("00000000-0000-4000-8000-000000000000")).toBeNull();
  });

  it("non riverifica più volte la stessa combinazione: una ricerca = una sola serie di chiamate", async () => {
    const { service, routing } = buildService(stations());
    const first = await service.search(request);
    await service.waitForRefinement(first.searchId);
    service.getRefinement(first.searchId);
    service.getRefinement(first.searchId); // le letture ripetute non innescano nuove chiamate
    expect((routing as MockRoutingProvider).calls.filter((c) => c.length === 3)).toHaveLength(4);
  });
});

describe("SearchSessionStore", () => {
  const session = (id: string, createdAt: number): SearchSession => ({
    id,
    mode: "route",
    request,
    origin: ORIGIN,
    destination: DESTINATION,
    detourLimitKm: request.maxDetourKm,
    route: { distanceKm: 1, durationMinutes: 1 },
    referencePrice: { value: 1, level: "on_route", sampleSize: 3 },
    costPerKm: 0.1,
    results: [],
    refinement: { status: "done" },
    createdAt,
  });

  it("le sessioni scadono dopo il TTL", () => {
    let now = 0;
    const store = new SearchSessionStore({ ttlMs: 1000, now: () => now });
    store.set(session("a", 0));
    now = 999;
    expect(store.get("a")).toBeDefined();
    now = 1001;
    expect(store.get("a")).toBeUndefined();
  });

  it("scarta le sessioni più vecchie oltre il numero massimo", () => {
    const store = new SearchSessionStore({ maxEntries: 2, now: () => 0 });
    store.set(session("a", 0));
    store.set(session("b", 0));
    store.set(session("c", 0));
    expect(store.size).toBe(2);
    expect(store.get("a")).toBeUndefined();
    expect(store.get("c")).toBeDefined();
  });
});

describe("SearchService — prezzi in tempo reale", () => {
  const liveInfo = { status: "live", tilesTotal: 6, tilesLive: 6, oldestLiveAgeMinutes: 4 } as const;

  it("senza fonte live la risposta dichiara 'disabled' e la ricerca funziona con i prezzi del file", async () => {
    const { service } = buildService();
    const response = await service.search(request);
    expect(response.livePrices).toEqual({ status: "disabled", tilesTotal: 0, tilesLive: 0, oldestLiveAgeMinutes: null });
    expect(response.results.length).toBeGreaterThan(0);
  });

  it("aggiorna i prezzi PRIMA di leggere il corridoio e passa tracciato e raggio corretti", async () => {
    const rows = onRoute();
    const repository = new InMemoryStationRepository(rows);
    const calls: Array<{ points: number; bufferKm: number }> = [];
    const service = new SearchService({
      routing: new MockRoutingProvider(),
      repository,
      budget: { status: async () => "ok" },
      sessions: new SearchSessionStore(),
      livePrices: {
        async ensureFresh(route, bufferKm) {
          calls.push({ points: route.length, bufferKm });
          // Simula il refresh: una stazione ribassa il prezzo. La ricerca deve vederlo.
          rows[0] = { ...rows[0]!, price: 1.5 };
          return liveInfo;
        },
      },
    });

    const response = await service.search({ ...request, maxDetourKm: 4 });

    expect(calls).toEqual([{ points: 2, bufferKm: 4 }]);
    expect(response.livePrices).toEqual(liveInfo);
    const cheapest = response.results.find((r) => r.station.id === rows[0]!.stationId);
    expect(cheapest?.price).toBe(1.5);
  });

  it("propaga lo stato 'partial'/'unavailable' senza far fallire la ricerca", async () => {
    for (const status of ["partial", "unavailable"] as const) {
      const service = new SearchService({
        routing: new MockRoutingProvider(),
        repository: new InMemoryStationRepository(onRoute()),
        budget: { status: async () => "ok" },
        sessions: new SearchSessionStore(),
        livePrices: { ensureFresh: async () => ({ status, tilesTotal: 6, tilesLive: status === "partial" ? 2 : 0, oldestLiveAgeMinutes: null }) },
      });
      const response = await service.search(request);
      expect(response.livePrices.status).toBe(status);
      expect(response.results.length).toBeGreaterThan(0);
    }
  });
});

describe("SearchService — deviazione verificata coerente (regressione stazione 1858 Bregnano)", () => {
  const stations = () => [...onRoute(), row({ stationId: 5, lon: 9.5, lat: 45.012, price: 1.7 })];

  it("se A→S→B è più corto in km ma più lento del diretto, la deviazione non è «+0,0 km» e i minuti restano coerenti", async () => {
    const direct = await new MockRoutingProvider().getRoute([ORIGIN, DESTINATION]);
    // Come nel caso reale: il diretto è il percorso più veloce ma non il più corto (−2,5 km, +2,9 min passando dalla stazione).
    const routing = new ScriptedRouting(async () => ({
      distanceKm: direct!.distanceKm - 2.5,
      durationMinutes: direct!.durationMinutes + 2.9,
      geometry: [],
    }));
    const { service } = buildService(stations(), { routing });
    const first = await service.search(request);
    await service.waitForRefinement(first.searchId);

    const refined = service.getRefinement(first.searchId)!.results.find((r) => r.station.id === 5)!;
    expect(refined.detourSource).toBe("routing");
    expect(refined.lateralDistanceKm).toBeGreaterThan(1); // 0.012° ≈ 1.33 km
    expect(refined.detourKm).toBeGreaterThan(0);
    expect(refined.detourKm).toBeCloseTo(2 * refined.lateralDistanceKm, 1); // minimo fisico: andata e ritorno in linea retta
    expect(refined.detourMinutes).toBeCloseTo(2.9, 1);
  });

  it("nessuna stazione verificata con distanza laterale > 0 ha deviazione 0,0 km", async () => {
    const direct = await new MockRoutingProvider().getRoute([ORIGIN, DESTINATION]);
    const routing = new ScriptedRouting(async () => ({
      distanceKm: direct!.distanceKm - 1,
      durationMinutes: direct!.durationMinutes + 1,
      geometry: [],
    }));
    const { service } = buildService(stations(), { routing });
    const first = await service.search(request);
    await service.waitForRefinement(first.searchId);
    const refined = service.getRefinement(first.searchId)!;
    for (const result of refined.results.filter((r) => r.detourSource === "routing")) {
      expect(result.lateralDistanceKm).toBeGreaterThan(0);
      expect(result.detourKm).toBeGreaterThan(0);
    }
  });
});

/** Strada che serpeggia da (9,45) a (10,45): vertici ogni ~78 m, ampiezza ~33 m, onda di ~2 km (come una strada reale, non una retta). */
const WINDING: Array<[number, number]> = Array.from({ length: 1001 }, (_, i) => [9 + i * 0.001, 45 + 0.0003 * Math.sin(i / 4)] as [number, number]);

/** Routing che restituisce sempre la stessa geometria completa (come Directions con overview=full). */
class WindingRouting implements RoutingProvider {
  async getRoute(waypoints: Parameters<RoutingProvider["getRoute"]>[0]): Promise<RouteResult> {
    const geometry = waypoints.length === 3 ? [WINDING[0]!, [waypoints[1]!.lon, waypoints[1]!.lat] as [number, number], WINDING[WINDING.length - 1]!] : WINDING;
    return { distanceKm: 78.6, durationMinutes: 60, geometry };
  }
}

/** Distanza massima, in metri, dei vertici di `full` dalla polilinea `line` (planare, con le lon scalate a 45°). */
function maxDistanceMeters(full: ReadonlyArray<readonly [number, number]>, line: ReadonlyArray<readonly [number, number]>) {
  const k = Math.cos((45 * Math.PI) / 180);
  const toXY = ([lon, lat]: readonly [number, number]) => [lon * k * 111_195, lat * 111_195] as const;
  const segs = line.slice(1).map((p, i) => [toXY(line[i]!), toXY(p)] as const);
  let worst = 0;
  for (const p of full) {
    const [x, y] = toXY(p);
    let best = Infinity;
    for (const [[ax, ay], [bx, by]] of segs) {
      const dx = bx - ax;
      const dy = by - ay;
      const u = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1)));
      best = Math.min(best, Math.hypot(x - (ax + u * dx), y - (ay + u * dy)));
    }
    worst = Math.max(worst, best);
  }
  return worst;
}

describe("SearchService.search — il tracciato mostrato in mappa segue la strada", () => {
  it("la geometria della risposta sta a ~1 m dal tracciato completo di Directions (non a decine di metri come quella dei calcoli)", async () => {
    const { service } = buildService(onRoute(), { routing: new WindingRouting() });
    const { route } = await service.search(request);
    expect(route.geometry.length).toBeGreaterThan(100); // non la versione a ~50 m (che ne avrebbe una manciata)
    expect(route.geometry.length).toBeLessThan(WINDING.length);
    expect(maxDistanceMeters(WINDING, route.geometry)).toBeLessThan(2.5); // ~1 m di tolleranza + arrotondamento a 5 decimali
  });

  it("il corridoio per le stazioni resta calcolato sul tracciato semplificato a ~50 m (stesse prestazioni di prima)", async () => {
    const { service, repository } = buildService(onRoute(), { routing: new WindingRouting() });
    await service.search(request);
    const points = (repository.lastQuery?.routeWkt ?? "").split(",").length;
    expect(points).toBeGreaterThan(2);
    expect(points).toBeLessThan(80);
  });
});

describe("SearchService.getStationRoute — percorso con sosta", () => {
  const stations = () => [...onRoute(), row({ stationId: 5, lon: 9.5, lat: 45.012, price: 1.7 })];

  it("restituisce geometria A→stazione→B e deviazione coerente; passa dalla stazione", async () => {
    const { service } = buildService(stations());
    const { searchId } = await service.search(request);
    await service.waitForRefinement(searchId);

    const route = await service.getStationRoute(searchId, 5);
    expect(route.stationId).toBe(5);
    expect(route.geometry.length).toBeGreaterThan(2);
    expect(route.geometry[0]).toEqual([ORIGIN.lon, ORIGIN.lat]);
    expect(route.geometry[route.geometry.length - 1]).toEqual([DESTINATION.lon, DESTINATION.lat]);
    // passa dalla stazione (lon 9.5, lat 45.012)
    expect(route.geometry.some(([lon, lat]) => Math.abs(lon - 9.5) < 1e-4 && Math.abs(lat - 45.012) < 1e-4)).toBe(true);
    expect(route.detourKm).toBeGreaterThan(0);
    expect(route.distanceKm).toBeGreaterThan(0);
  });

  it("il tracciato di una stazione già verificata costa UNA nuova richiesta Directions: nessun risultato di Directions viene riusato (Mapbox §2.10.1)", async () => {
    const mock = new MockRoutingProvider();
    const { InFlightRoutingProvider } = await import("../../src/providers/routing/InFlightRoutingProvider");
    const { service } = buildService(stations(), { routing: new InFlightRoutingProvider(mock) });
    const { searchId } = await service.search(request);
    await service.waitForRefinement(searchId);
    const before = mock.calls.length;
    await service.getStationRoute(searchId, 5);
    expect(mock.calls.length).toBe(before + 1);
    await service.getStationRoute(searchId, 5); // e ogni nuova apertura ne costa un'altra
    expect(mock.calls.length).toBe(before + 2);
  });

  it("kill switch / quota esaurita: l'errore si propaga e non si inventa nessun tracciato", async () => {
    const routing = new ScriptedRouting(async () => {
      throw new BudgetExhaustedError();
    });
    const { service } = buildService(stations(), { routing });
    const { searchId } = await service.search(request);
    await service.waitForRefinement(searchId);
    await expect(service.getStationRoute(searchId, 5)).rejects.toBeInstanceOf(BudgetExhaustedError);
  });

  it("nessun percorso passando dalla stazione → NO_ROUTE", async () => {
    const routing = new ScriptedRouting(async () => null);
    const { service } = buildService(stations(), { routing });
    const { searchId } = await service.search(request);
    await service.waitForRefinement(searchId);
    await expect(service.getStationRoute(searchId, 5)).rejects.toMatchObject({ code: "NO_ROUTE", httpStatus: 422 });
  });

  it("ricerca sconosciuta → SEARCH_NOT_FOUND; stazione non tra i risultati → NOT_FOUND", async () => {
    const { service } = buildService(stations());
    await expect(service.getStationRoute("00000000-0000-4000-8000-000000000000", 5)).rejects.toMatchObject({
      code: "SEARCH_NOT_FOUND",
      httpStatus: 404,
    });
    const { searchId } = await service.search(request);
    await service.waitForRefinement(searchId);
    await expect(service.getStationRoute(searchId, 999999)).rejects.toMatchObject({ code: "NOT_FOUND", httpStatus: 404 });
    await expect(service.getStationRoute(searchId, 5)).resolves.toBeDefined();
  });
});

describe("SearchService — verifica finché la testa ha 5 stazioni confermate (tetto 10 chiamate extra)", () => {
  // 30 stazioni sul percorso, tutte alla stessa distanza laterale: il ranking proxy segue il prezzo (le prime sono le più economiche; scarti di 0,02 €/L tengono stabile l'ordine dopo la verifica).
  const many = () =>
    Array.from({ length: 30 }, (_, i) => row({ stationId: 300 + i, lon: 9.1 + i * 0.02, lat: 45.001, price: 1.6 + i * 0.02 }));
  const rankOf = (lon: number) => Math.round((lon - 9.1) / 0.02);
  const viaCalls = (routing: ScriptedRouting) => routing.viaCalls;

  async function scripted(excludedWhen: (rank: number) => boolean) {
    const direct = await new MockRoutingProvider().getRoute([ORIGIN, DESTINATION]);
    return new ScriptedRouting(async (station) =>
      excludedWhen(rankOf(station.lon))
        ? { distanceKm: direct!.distanceKm + 7, durationMinutes: direct!.durationMinutes + 10, geometry: [] } // oltre i 5 km: esclusa
        : { distanceKm: direct!.distanceKm + 0.3, durationMinutes: direct!.durationMinutes + 0.5, geometry: [] },
    );
  }

  it("se le prime 5 vengono escluse dal routing reale, verifica le 5 che entrano in testa (10 chiamate in tutto)", async () => {
    const routing = await scripted((rank) => rank < 5);
    const { service } = buildService(many(), { routing });
    const first = await service.search(request);
    await service.waitForRefinement(first.searchId);

    const refined = service.getRefinement(first.searchId)!;
    expect(refined.refinement).toEqual({ status: "done" });
    expect(viaCalls(routing)).toBe(2 * REFINE_TOP_N);
    const head = refined.results.slice(0, REFINE_TOP_N);
    expect(head.map((r) => r.station.id)).toEqual([305, 306, 307, 308, 309]);
    expect(head.every((r) => r.detourSource === "routing")).toBe(true);
  });

  it("non verifica oltre il necessario: se la testa è già confermata dopo il primo giro, niente chiamate extra", async () => {
    const routing = await scripted(() => false);
    const { service } = buildService(many(), { routing });
    const first = await service.search(request);
    await service.waitForRefinement(first.searchId);
    expect(viaCalls(routing)).toBe(REFINE_TOP_N);
  });

  it("TETTO — al massimo REFINE_EXTRA_CALLS_CAP chiamate extra: oltre restano le stime (badge), stato done", async () => {
    const routing = await scripted(() => true); // ogni verifica esclude la stazione: la testa non si stabilizza mai
    const { service } = buildService(many(), { routing });
    const first = await service.search(request);
    await service.waitForRefinement(first.searchId);

    const refined = service.getRefinement(first.searchId)!;
    expect(viaCalls(routing)).toBe(REFINE_TOP_N + REFINE_EXTRA_CALLS_CAP);
    expect(refined.refinement).toEqual({ status: "done" });
    // Le prime 15 sono state escluse; la testa dell'elenco è fatta di stime proxy, non di verifiche.
    expect(refined.results).toHaveLength(15);
    expect(refined.results.slice(0, REFINE_TOP_N).every((r) => r.detourSource === "proxy")).toBe(true);
    expect(refined.results.slice(0, REFINE_TOP_N).map((r) => r.station.id)).toEqual([315, 316, 317, 318, 319]);
  });

  it("il tetto vale anche con giri parziali (meno di 5 stazioni da verificare nell'ultimo giro)", async () => {
    // Escluse le prime 13: 5 (primo giro) + 5 + 3 → il terzo giro verifica 5 ma il tetto ne concede solo 5 (10 − 5).
    const routing = await scripted((rank) => rank < 13);
    const { service } = buildService(many(), { routing });
    const first = await service.search(request);
    await service.waitForRefinement(first.searchId);
    expect(viaCalls(routing)).toBeLessThanOrEqual(REFINE_TOP_N + REFINE_EXTRA_CALLS_CAP);
  });

  it("una stazione non verificabile (routing null) non viene riprovata né blocca il ciclo", async () => {
    const direct = await new MockRoutingProvider().getRoute([ORIGIN, DESTINATION]);
    const routing = new ScriptedRouting(async (station) =>
      rankOf(station.lon) === 2
        ? null
        : { distanceKm: direct!.distanceKm + 0.3, durationMinutes: direct!.durationMinutes + 0.5, geometry: [] },
    );
    const { service } = buildService(many(), { routing });
    const first = await service.search(request);
    await service.waitForRefinement(first.searchId);
    expect(viaCalls(routing)).toBe(REFINE_TOP_N); // la n. 2 resta stimata, le altre 4 bastano a chiudere il giro
    const refined = service.getRefinement(first.searchId)!;
    expect(refined.results.find((r) => r.station.id === 302)?.detourSource).toBe("proxy");
  });

  it("quota esaurita a metà: si ferma e non ritenta", async () => {
    const direct = await new MockRoutingProvider().getRoute([ORIGIN, DESTINATION]);
    let calls = 0;
    const routing = new ScriptedRouting(async (station) => {
      calls += 1;
      if (calls > REFINE_TOP_N) throw new BudgetExhaustedError();
      return rankOf(station.lon) < 5
        ? { distanceKm: direct!.distanceKm + 7, durationMinutes: direct!.durationMinutes + 10, geometry: [] }
        : { distanceKm: direct!.distanceKm + 0.3, durationMinutes: direct!.durationMinutes + 0.5, geometry: [] };
    });
    const { service } = buildService(many(), { routing });
    const first = await service.search(request);
    await service.waitForRefinement(first.searchId);
    expect(calls).toBe(2 * REFINE_TOP_N); // il secondo giro parte, tutte le sue chiamate falliscono, poi il ciclo si chiude
    expect(service.getRefinement(first.searchId)!.refinement.status).toBe("done");
  });
});

describe("SearchService.getStationDetail — dettaglio stazione (Screen 3)", () => {
  const stations = () => [...onRoute(), row({ stationId: 5, lon: 9.5, lat: 45.012, price: 1.7 })];
  const prices: StationPriceEntry[] = [
    { fuelType: "diesel", isSelf: false, price: 1.9, communicatedAt: "2026-09-29T08:00:00.000Z" },
    { fuelType: "metano", isSelf: false, price: 1.3, communicatedAt: "2026-09-29T08:00:00.000Z" },
    { fuelType: "benzina", isSelf: false, price: 1.8, communicatedAt: "2026-09-29T08:00:00.000Z" },
    { fuelType: "benzina", isSelf: true, price: 1.7, communicatedAt: "2026-09-29T09:00:00.000Z" },
    { fuelType: "diesel", isSelf: true, price: 1.65, communicatedAt: "2026-09-29T09:00:00.000Z" },
  ];

  /** Senza verifica in background (soglia soft del budget): i risultati restano stime proxy finché non si apre il dettaglio. */
  const unverified = (options: Parameters<typeof buildService>[1] = {}) =>
    buildService(stations(), { budget: "soft_limit", stationPrices: { 5: prices }, ...options });

  it("calcola la deviazione on-demand con UNA chiamata di routing A→stazione→B e la dichiara «routing»", async () => {
    const { service, routing } = unverified();
    const search = await service.search(request);
    expect(search.results.find((r) => r.station.id === 5)!.detourSource).toBe("proxy");

    const detail = await service.getStationDetail(search.searchId, 5);
    const via = (routing as MockRoutingProvider).calls.filter((c) => c.length === 3);
    expect(via).toHaveLength(1);
    expect(via[0]![0]).toEqual(ORIGIN);
    expect(via[0]![1]).toEqual({ lon: 9.5, lat: 45.012 });
    expect(via[0]![2]).toEqual(DESTINATION);
    expect(detail.detour.source).toBe("routing");
    expect(detail.detour.km).toBeGreaterThan(0);
  });

  it("riusa la verifica già fatta dal ricalcolo in background: nessuna chiamata di routing in più", async () => {
    const { service, routing } = buildService(stations(), { stationPrices: { 5: prices } });
    const search = await service.search(request);
    await service.waitForRefinement(search.searchId);
    const before = (routing as MockRoutingProvider).calls.length;

    const detail = await service.getStationDetail(search.searchId, 5);
    expect((routing as MockRoutingProvider).calls.length).toBe(before);
    expect(detail.detour.source).toBe("routing");
    const refined = service.getRefinement(search.searchId)!.results.find((r) => r.station.id === 5)!;
    expect(detail.detour.km).toBeCloseTo(refined.detourKm, 2);
  });

  it("fornisce tutti i prezzi disponibili (carburante × modalità) in ordine stabile, con il filtro di freschezza della ricerca", async () => {
    const { service, repository } = unverified();
    const search = await service.search({ ...request, maxPriceAgeHours: 48 });
    const detail = await service.getStationDetail(search.searchId, 5);

    expect(detail.prices.map((p) => `${p.fuelType}:${p.isSelf ? "self" : "servito"}`)).toEqual([
      "benzina:self",
      "benzina:servito",
      "diesel:self",
      "diesel:servito",
      "metano:servito",
    ]);
    expect(repository.lastStationPricesQuery).toEqual({ stationId: 5, maxAgeHours: 48 });
  });

  it("riporta la combinazione scelta in ricerca, i litri e il prezzo di riferimento", async () => {
    const { service } = unverified();
    const search = await service.search(request);
    const detail = await service.getStationDetail(search.searchId, 5);

    expect(detail.selected).toMatchObject({ fuelType: "benzina", isSelf: true, servitoOnly: false, price: 1.7 });
    expect(detail.liters).toBe(45);
    expect(detail.referencePrice).toEqual(search.referencePrice);
    expect(detail.station.id).toBe(5);
    expect(detail.station.indirizzo).toBe("Via Test 1");
  });

  it("calcola il differenziale vs riferimento (€/L e %) e un risparmio netto coerente con la formula", async () => {
    const { service } = unverified();
    const search = await service.search(request);
    const detail = await service.getStationDetail(search.searchId, 5);
    const reference = search.referencePrice.value;

    expect(detail.impact.priceDifferencePerLiter).toBeCloseTo(1.7 - reference, 3);
    expect(detail.impact.priceDifferencePerLiter).toBeLessThan(0);
    expect(detail.impact.priceDifferencePercent).toBeCloseTo(((1.7 - reference) / reference) * 100, 1);
    expect(detail.impact.grossSavings).toBeCloseTo((reference - 1.7) * 45, 2);
    expect(detail.impact.netSavings).toBeCloseTo(detail.impact.grossSavings - detail.impact.detourCost, 1);
    const fuel = detail.detour.km * (reference / 15);
    const time = detail.detour.minutes * 0.15;
    expect(detail.impact.detourCost).toBeCloseTo(fuel + time, 1);
  });

  it("FALLBACK — routing in errore: stima proxy dichiarata «proxy», mai spacciata per verificata", async () => {
    const routing = new ScriptedRouting(async () => {
      throw new ProviderError("Il servizio dei percorsi non è raggiungibile: riprova tra poco.");
    });
    const { service } = unverified({ routing });
    const search = await service.search(request);
    const proxy = search.results.find((r) => r.station.id === 5)!;

    const detail = await service.getStationDetail(search.searchId, 5);
    expect(detail.detour.source).toBe("proxy");
    expect(detail.detour.km).toBeCloseTo(proxy.detourKm, 2);
    expect(detail.detour.minutes).toBeCloseTo(proxy.detourMinutes, 1);
    expect(detail.prices.length).toBeGreaterThan(0); // il resto del dettaglio resta disponibile
  });

  it("FALLBACK — kill switch (quota esaurita) e nessun percorso: ancora «proxy», senza errore", async () => {
    for (const onVia of [
      async () => {
        throw new BudgetExhaustedError();
      },
      async () => null,
    ]) {
      const { service } = unverified({ routing: new ScriptedRouting(onVia) });
      const search = await service.search(request);
      const detail = await service.getStationDetail(search.searchId, 5);
      expect(detail.detour.source).toBe("proxy");
    }
  });

  it("tetto di deviazione: una stazione verificata oltre il massimo si mostra comunque, con i dati reali", async () => {
    const direct = await new MockRoutingProvider().getRoute([ORIGIN, DESTINATION]);
    const routing = new ScriptedRouting(async () => ({
      distanceKm: direct!.distanceKm + 7.5,
      durationMinutes: direct!.durationMinutes + 11,
      geometry: [],
    }));
    const { service } = unverified({ routing });
    const search = await service.search(request);
    const detail = await service.getStationDetail(search.searchId, 5);
    expect(detail.detour.source).toBe("routing");
    expect(detail.detour.km).toBeCloseTo(7.5, 1);
  });

  it("ricerca sconosciuta → SEARCH_NOT_FOUND; stazione fuori dai risultati → NOT_FOUND", async () => {
    const { service } = unverified();
    await expect(service.getStationDetail("00000000-0000-4000-8000-000000000000", 5)).rejects.toMatchObject({
      code: "SEARCH_NOT_FOUND",
      httpStatus: 404,
    });
    const search = await service.search(request);
    await expect(service.getStationDetail(search.searchId, 999999)).rejects.toMatchObject({ code: "NOT_FOUND", httpStatus: 404 });
  });
});

describe("SearchService — «Evita autostrada» (avoidMotorway)", () => {
  const stations = () => [...onRoute(), row({ stationId: 5, lon: 9.5, lat: 45.012, price: 1.7 })];
  const avoid = { ...request, avoidMotorway: true };

  it("passa exclude=motorway al percorso diretto e a tutte le verifiche (stesso tipo di percorso)", async () => {
    const { service, routing } = buildService(stations());
    const { searchId } = await service.search(avoid);
    await service.waitForRefinement(searchId);

    const mock = routing as MockRoutingProvider;
    expect(mock.calls.length).toBeGreaterThan(1);
    expect(mock.callOptions).toHaveLength(mock.calls.length);
    expect(mock.callOptions.every((o) => o.avoidMotorway === true)).toBe(true); // diretto (2 waypoint) e vie (3 waypoint)
    expect(mock.calls.some((c) => c.length === 2)).toBe(true);
    expect(mock.calls.some((c) => c.length === 3)).toBe(true);
  });

  it("senza avoidMotorway nessuna richiesta esclude l'autostrada", async () => {
    const { service, routing } = buildService(stations());
    const { searchId } = await service.search(request);
    await service.waitForRefinement(searchId);
    expect((routing as MockRoutingProvider).callOptions.every((o) => !o.avoidMotorway)).toBe(true);
  });

  it("anche il percorso con sosta e il dettaglio stazione usano lo stesso tipo di percorso della ricerca", async () => {
    const { service, routing } = buildService(stations(), { budget: "soft_limit" });
    const { searchId } = await service.search(avoid);
    const mock = routing as MockRoutingProvider;
    mock.calls.length = 0;
    mock.callOptions.length = 0;

    await service.getStationRoute(searchId, 5);
    await service.getStationDetail(searchId, 5);
    expect(mock.calls.filter((c) => c.length === 3)).toHaveLength(2);
    expect(mock.callOptions.every((o) => o.avoidMotorway === true)).toBe(true);
  });

  it("conserva il flag nello stato della ricerca (sessione) e la deviazione resta quella calcolata contro il diretto dello stesso tipo", async () => {
    const direct = await new MockRoutingProvider().getRoute([ORIGIN, DESTINATION]);
    const routing = new ScriptedRouting(async () => ({ distanceKm: direct!.distanceKm + 3, durationMinutes: direct!.durationMinutes + 4, geometry: [] }));
    const { service } = buildService(stations(), { routing });
    const { searchId } = await service.search(avoid);
    await service.waitForRefinement(searchId);
    expect(routing.receivedOptions.length).toBeGreaterThan(1);
    expect(routing.receivedOptions.every((o) => o.avoidMotorway === true)).toBe(true);
    const refined = service.getRefinement(searchId)!.results.find((r) => r.station.id === 5)!;
    expect(refined.detourKm).toBeCloseTo(3, 1); // via − diretto, entrambi senza autostrada
  });
});

describe("SearchService — insieme di esclusioni (autostrada, pedaggi, traghetti)", () => {
  const stations = () => [...onRoute(), row({ stationId: 5, lon: 9.5, lat: 45.012, price: 1.7 })];

  it("pedaggi e traghetti arrivano a diretto, verifiche, percorso con sosta e dettaglio: tutti con lo stesso insieme", async () => {
    const { service, routing } = buildService(stations());
    const mock = routing as MockRoutingProvider;
    const { searchId } = await service.search({ ...request, avoidTolls: true, avoidFerries: true });
    await service.waitForRefinement(searchId);
    await service.getStationRoute(searchId, 5);
    await service.getStationDetail(searchId, 5);
    expect(mock.callOptions.length).toBeGreaterThan(3);
    for (const options of mock.callOptions) expect(options).toEqual({ avoidMotorway: false, avoidTolls: true, avoidFerries: true });
  });

  it("la baseline della deviazione è sempre il diretto con lo stesso insieme (ogni combinazione, un'unica chiave per ricerca)", async () => {
    for (const set of [{ avoidTolls: true }, { avoidMotorway: true, avoidTolls: true }, { avoidFerries: true }]) {
      const { service, routing } = buildService(stations());
      const mock = routing as MockRoutingProvider;
      const { searchId } = await service.search({ ...request, ...set });
      await service.waitForRefinement(searchId);
      const distinct = new Set(mock.callOptions.map((o) => JSON.stringify(o)));
      expect(distinct.size, JSON.stringify(set)).toBe(1); // diretto e vie: stesso insieme
      expect(mock.calls.some((c) => c.length === 2)).toBe(true);
      expect(mock.calls.some((c) => c.length === 3)).toBe(true);
    }
  });

  it("senza esclusioni nessuna chiamata ne porta una", async () => {
    const { service, routing } = buildService(stations());
    const { searchId } = await service.search(request);
    await service.waitForRefinement(searchId);
    for (const options of (routing as MockRoutingProvider).callOptions) expect(options).toEqual({ avoidMotorway: false, avoidTolls: false, avoidFerries: false });
  });
});

describe("SearchService — prezzo di riferimento manuale (referencePriceOverride)", () => {
  const stations = () => [...onRoute(), row({ stationId: 5, lon: 9.5, lat: 45.012, price: 1.7 })];

  it("sostituisce del tutto la cascata: valore e livello «manual», nessun blending", async () => {
    const { service } = buildService(stations());
    const response = await service.search({ ...request, referencePriceOverride: 2.5 });
    expect(response.referencePrice).toEqual({ value: 2.5, level: "manual", sampleSize: 0 });
    const station5 = response.results.find((r) => r.station.id === 5)!;
    expect(station5.grossSavings).toBeCloseTo((2.5 - 1.7) * 45, 2);
    await service.waitForRefinement(response.searchId);
  });

  it("il costo al km usa il riferimento manuale (C_km = P_avg / consumo)", async () => {
    const { service } = buildService(stations());
    const response = await service.search({ ...request, referencePriceOverride: 3 });
    expect(response.costPerKm).toBeCloseTo(3 / 15, 4);
    await service.waitForRefinement(response.searchId);
  });

  it("senza override resta la cascata automatica", async () => {
    const { service } = buildService(stations());
    const response = await service.search(request);
    expect(response.referencePrice.level).not.toBe("manual");
    await service.waitForRefinement(response.searchId);
  });

  it("con il riferimento manuale non serve avere abbastanza prezzi per calcolare la media: nessun NO_PRICE_DATA", async () => {
    const { service } = buildService([], { national: null });
    await expect(service.search(request)).rejects.toMatchObject({ code: "NO_PRICE_DATA" }); // automatico: errore
    const response = await service.search({ ...request, referencePriceOverride: 2 });
    expect(response.referencePrice.level).toBe("manual");
    expect(response.results).toEqual([]);
  });

  it("il dettaglio stazione usa il riferimento manuale per il differenziale", async () => {
    const { service } = buildService(stations(), { budget: "soft_limit" });
    const { searchId } = await service.search({ ...request, referencePriceOverride: 2.5 });
    const detail = await service.getStationDetail(searchId, 5);
    expect(detail.referencePrice.level).toBe("manual");
    expect(detail.impact.priceDifferencePerLiter).toBeCloseTo(1.7 - 2.5, 3);
    expect(detail.impact.priceDifferencePercent).toBeCloseTo(((1.7 - 2.5) / 2.5) * 100, 1);
  });
});

/**
 * «Intorno a me»: scenario attorno a ORIGIN (9,0 / 45,0). 0,01° di latitudine ≈ 1,11 km in linea d'aria, quindi le
 * stazioni sono a ~1,1 / 2,2 / 3,3 / 3,9 km (nel raggio di 5 km) e una a ~6,7 km (fuori).
 */
describe("SearchService.searchNearby — «Intorno a me»", () => {
  const nearbyRequest: NearbyRequest = {
    origin: ORIGIN,
    radiusKm: 5,
    fuelType: "benzina",
    liters: 45,
    consumptionKmPerLiter: 15,
    valueOfTimePerMinute: 0.15,
    onlySelf: true,
    maxPriceAgeHours: 72,
    avoidMotorway: false,
    avoidTolls: false,
    avoidFerries: false,
  };

  const around = () => [
    row({ stationId: 11, lon: 9.0, lat: 45.01, price: 1.8 }), // ~1,1 km
    row({ stationId: 12, lon: 9.0, lat: 45.02, price: 1.82 }), // ~2,2 km
    row({ stationId: 13, lon: 9.0, lat: 45.03, price: 1.84 }), // ~3,3 km
    row({ stationId: 14, lon: 9.0, lat: 45.035, price: 1.7 }), // ~3,9 km, la più economica
    row({ stationId: 15, lon: 9.0, lat: 45.06, price: 1.5 }), // ~6,7 km: fuori dal raggio
  ];

  it("cerca attorno al punto con un POINT WKT e il raggio in metri, senza chiamare il routing in fase 1", async () => {
    const { service, repository, routing } = buildService(around());
    const response = await service.searchNearby(nearbyRequest);

    expect(repository.lastQuery?.routeWkt).toBe("POINT(9.000000 45.000000)");
    expect(repository.lastQuery?.radiusMeters).toBe(5000);
    expect(response.nearby).toEqual({ origin: ORIGIN, radiusKm: 5 });
    expect("route" in response).toBe(false);
    // Nessun percorso A→B: la risposta è immediata e il routing parte solo con la verifica in background.
    expect(response.refinement.status).toBe("pending");
    expect((routing as MockRoutingProvider).calls.filter((c) => c.length === 2)).toHaveLength(0);
  });

  it("esclude le stazioni oltre il raggio e non applica alcun limite ai km extra del giro", async () => {
    const { service } = buildService(around());
    const { results, candidatesEvaluated } = await service.searchNearby(nearbyRequest);

    expect(candidatesEvaluated).toBe(4);
    expect(results.map((r) => r.station.id).sort()).toEqual([11, 12, 13, 14]);
    // La stazione a ~3,9 km ha un giro stimato di ~9,7 km: «In viaggio» con 5 km di deviazione la scarterebbe, qui il raggio decide.
    const far = results.find((r) => r.station.id === 14)!;
    expect(far.detourKm).toBeGreaterThan(5);
  });

  it("il prezzo di riferimento è la mediana delle stazioni nel raggio (livello «area»), non quello delle più vicine", async () => {
    const { service } = buildService(around());
    const { referencePrice } = await service.searchNearby(nearbyRequest);
    // 1,70 / 1,80 / 1,82 / 1,84 → mediana 1,81. Con il livello «sul percorso» sarebbe stata la mediana delle sole stazioni entro 500 m (nessuna).
    expect(referencePrice).toEqual({ value: 1.81, level: "area", sampleSize: 4 });
  });

  it("misura distanza in linea d'aria e giro stimato (2 × distanza × 1,25), senza posizione lungo un percorso", async () => {
    const { service } = buildService(around());
    const { results } = await service.searchNearby(nearbyRequest);
    const first = results.find((r) => r.station.id === 11)!;

    expect(first.lateralDistanceKm).toBeCloseTo(1.11, 1);
    expect(first.alongRouteKm).toBe(0);
    expect(first.detourSource).toBe("proxy");
    expect(first.detourKm).toBeCloseTo(2 * 1.11 * 1.25, 1);
  });

  it("classifica per risparmio netto sul pieno: (riferimento − prezzo) × litri − costo del giro", async () => {
    const { service } = buildService(around());
    const { results } = await service.searchNearby(nearbyRequest);

    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1]!.netSavings).toBeGreaterThanOrEqual(results[i]!.netSavings);
    }
    const best = results[0]!;
    expect(best.station.id).toBe(14);
    expect(best.grossSavings).toBeCloseTo((1.81 - 1.7) * 45, 2);
    expect(best.netSavings).toBeCloseTo(best.grossSavings - best.detourCost, 1);
  });

  it("la verifica in background misura il giro origine → stazione → origine con il routing reale", async () => {
    const { service, routing } = buildService(around());
    const { searchId } = await service.searchNearby(nearbyRequest);
    await service.waitForRefinement(searchId);

    const calls = (routing as MockRoutingProvider).calls;
    expect(calls.length).toBeGreaterThan(0);
    for (const waypoints of calls) {
      expect(waypoints).toHaveLength(3);
      expect(waypoints[0]).toEqual(ORIGIN);
      expect(waypoints[2]).toEqual(ORIGIN);
    }
    const refined = service.getRefinement(searchId)!;
    expect(refined.refinement.status).toBe("done");
    for (const result of refined.results.filter((r) => r.detourSource === "routing")) {
      // Il giro reale non può essere più corto di andata e ritorno in linea retta.
      expect(result.detourKm).toBeGreaterThanOrEqual(2 * result.lateralDistanceKm - 0.01);
    }
  });

  it("senza budget (limite raggiunto) la classifica resta sulle stime e il routing non viene chiamato", async () => {
    const { service, routing } = buildService(around(), { budget: "hard_limit" });
    const response = await service.searchNearby(nearbyRequest);

    expect(response.refinement).toEqual({ status: "skipped", reason: "budget_hard_limit" });
    expect((routing as MockRoutingProvider).calls).toHaveLength(0);
    expect(response.results.every((r) => r.detourSource === "proxy")).toBe(true);
  });

  it("con meno di 3 stazioni nel raggio ripiega sul prezzo nazionale", async () => {
    const { service } = buildService(around().slice(0, 2), { national: { median: 1.9, sampleSize: 20000 } });
    const { referencePrice } = await service.searchNearby(nearbyRequest);
    expect(referencePrice).toEqual({ value: 1.9, level: "national", sampleSize: 20000 });
  });

  it("422 NO_PRICE_DATA se non ci sono né stazioni in zona né dato nazionale", async () => {
    const { service } = buildService([]);
    await expect(service.searchNearby(nearbyRequest)).rejects.toMatchObject({ code: "NO_PRICE_DATA", httpStatus: 422 });
  });

  it("il prezzo di riferimento manuale sostituisce la cascata", async () => {
    const { service } = buildService(around());
    const { referencePrice } = await service.searchNearby({ ...nearbyRequest, referencePriceOverride: 2.0 });
    expect(referencePrice).toEqual({ value: 2.0, level: "manual", sampleSize: 0 });
  });

  it("tiene il raggio tra 1 e 10 km anche se il chiamante ne passa uno diverso", async () => {
    const wide = buildService(around());
    expect((await wide.service.searchNearby({ ...nearbyRequest, radiusKm: 50 })).nearby.radiusKm).toBe(10);
    expect(wide.repository.lastQuery?.radiusMeters).toBe(10_000);

    const narrow = buildService(around(), { national: { median: 1.9, sampleSize: 20000 } });
    expect((await narrow.service.searchNearby({ ...nearbyRequest, radiusKm: 0.2 })).nearby.radiusKm).toBe(1);
    expect(narrow.repository.lastQuery?.radiusMeters).toBe(1000);
  });

  it("le stazioni con prezzo non aggiornato sono conteggiate a parte, come in «In viaggio»", async () => {
    const stale = [{ stationId: 99, lon: 9.0, lat: 45.015 }];
    const repository = new InMemoryStationRepository(around(), null, undefined, undefined, stale);
    const service = new SearchService({ routing: new MockRoutingProvider(), repository, budget: { status: async () => "ok" }, sessions: new SearchSessionStore() });
    const response = await service.searchNearby(nearbyRequest);
    expect(response.staleStations).toEqual({ count: 1, maxAgeHours: 72 });
  });

  describe("dettaglio e percorso della stazione", () => {
    it("il dettaglio dice «nearby», conta il giro completo e non ha una posizione sul percorso", async () => {
      const { service } = buildService(around(), { stationPrices: { 14: [{ fuelType: "benzina", isSelf: true, price: 1.7, communicatedAt: "2026-09-27T10:00:00.000Z" }] } });
      const { searchId } = await service.searchNearby(nearbyRequest);
      await service.waitForRefinement(searchId);

      const detail = await service.getStationDetail(searchId, 14);
      expect(detail.mode).toBe("nearby");
      expect(detail.alongRouteKm).toBe(0);
      expect(detail.lateralDistanceKm).toBeCloseTo(3.89, 1);
      expect(detail.detour.source).toBe("routing");
      expect(detail.detour.km).toBeGreaterThanOrEqual(2 * detail.lateralDistanceKm - 0.01);
      expect(detail.impact.grossSavings).toBeCloseTo((1.81 - 1.7) * 45, 2);
    });

    it("il percorso della stazione parte e torna al punto di partenza", async () => {
      const { service } = buildService(around());
      const { searchId } = await service.searchNearby(nearbyRequest);
      await service.waitForRefinement(searchId);

      const route = await service.getStationRoute(searchId, 11);
      expect(route.geometry[0]).toEqual([9, 45]);
      expect(route.geometry[route.geometry.length - 1]).toEqual([9, 45]);
      expect(route.detourKm).toBeGreaterThan(0);
    });

    it("«In viaggio» continua a dichiarare mode «route» nel dettaglio", async () => {
      const { service } = buildService(onRoute());
      const { searchId } = await service.search(request);
      expect((await service.getStationDetail(searchId, 1)).mode).toBe("route");
    });
  });
});

describe("SearchService — inversione di marcia alla stazione", () => {
  const nearbyRequest: NearbyRequest = {
    origin: ORIGIN,
    radiusKm: 5,
    fuelType: "benzina",
    liters: 45,
    consumptionKmPerLiter: 15,
    valueOfTimePerMinute: 0.15,
    onlySelf: true,
    maxPriceAgeHours: 72,
    avoidMotorway: false,
    avoidTolls: false,
    avoidFerries: false,
  };
  const around = () => [
    row({ stationId: 31, lon: 9.0, lat: 45.01, price: 1.8 }),
    row({ stationId: 32, lon: 9.0, lat: 45.02, price: 1.82 }),
    row({ stationId: 33, lon: 9.0, lat: 45.03, price: 1.84 }),
  ];

  it("«Intorno a me»: le verifiche in background, il dettaglio e il percorso della stazione ammettono l'inversione (giro andata e ritorno)", async () => {
    const { service, routing } = buildService(around());
    const { searchId } = await service.searchNearby(nearbyRequest);
    await service.waitForRefinement(searchId);
    const mock = routing as MockRoutingProvider;
    expect(mock.calls.length).toBeGreaterThan(0);
    expect(mock.callOptions.every((o) => o.continueStraight === false)).toBe(true);

    const before = mock.calls.length;
    await service.getStationDetail(searchId, 33); // stazione non ancora verificata o già verificata: se chiama il routing, con inversione
    await service.getStationRoute(searchId, 31);
    expect(mock.calls.length).toBeGreaterThan(before); // il percorso della stazione chiama sempre il routing
    expect(mock.callOptions.every((o) => o.continueStraight === false)).toBe(true);
  });

  it("«In viaggio» non cambia: nessuna richiesta chiede l'inversione (il passaggio dalla stazione prosegue verso B)", async () => {
    const { service, routing } = buildService();
    const { searchId } = await service.search(request);
    await service.waitForRefinement(searchId);
    await service.getStationRoute(searchId, 1);
    const mock = routing as MockRoutingProvider;
    expect(mock.calls.length).toBeGreaterThan(0);
    expect(mock.callOptions.some((o) => o.continueStraight !== undefined)).toBe(false);
  });
});

/**
 * Il proxy del giro di «Intorno a me» è un fattore unico fisso (2 × distanza × PROXY_CIRCUITY_FACTOR): non deriva da nessun
 * percorso, quindi non può ereditarne la tortuosità. Questi test provano la sola stima della fase 1: girano con il budget al
 * limite, quindi la verifica col routing non parte. Dopo la verifica in background il giro è quello reale del provider e la
 * classifica può cambiare: è voluto (vedi i test su `searchNearby` che seguono la verifica).
 */
describe("SearchService.searchNearby — il proxy del giro è un fattore unico, indipendente da qualsiasi percorso", () => {
  const nearbyRequest: NearbyRequest = {
    origin: ORIGIN,
    radiusKm: 5,
    fuelType: "benzina",
    liters: 45,
    consumptionKmPerLiter: 15,
    valueOfTimePerMinute: 0.15,
    onlySelf: true,
    maxPriceAgeHours: 72,
    avoidMotorway: false,
    avoidTolls: false,
    avoidFerries: false,
  };
  // Stazioni a ~1,1 / ~2,2 / ~3,3 km e una al limite del raggio (~4,99 km).
  const stations = () => [
    row({ stationId: 41, lon: 9.0, lat: 45.01, price: 1.8 }),
    row({ stationId: 42, lon: 9.0, lat: 45.02, price: 1.82 }),
    row({ stationId: 43, lon: 9.0, lat: 45.03, price: 1.84 }),
    row({ stationId: 44, lon: 9.0, lat: 45.0449, price: 1.7 }),
  ];
  const proxyOnly = (routing: MockRoutingProvider) => buildService(stations(), { routing, budget: "hard_limit" }).service.searchNearby(nearbyRequest);

  it("al limite del raggio (5 km) il giro stimato è ~12,5 km: 2 × distanza × 1,25, non il ~13,5 che darebbe un fattore 1,35", async () => {
    const { results } = await proxyOnly(new MockRoutingProvider());
    const edge = results.find((r) => r.station.id === 44)!;
    expect(edge.detourSource).toBe("proxy");
    expect(edge.lateralDistanceKm).toBeCloseTo(4.99, 2);
    expect(edge.detourKm).toBeCloseTo(2 * edge.lateralDistanceKm * PROXY_CIRCUITY_FACTOR, 1); // la risposta arrotonda a 2 decimali
    expect(edge.detourKm).toBeLessThanOrEqual(2 * 5 * PROXY_CIRCUITY_FACTOR + 0.01);
    expect(edge.detourKm).toBeLessThan(13);
  });

  it("ogni stazione ha lo stesso rapporto giro / (2 × linea d'aria), quale che sia la tortuosità del provider di percorsi", async () => {
    for (const circuity of [1.0, 1.2, 1.35, 3.0]) {
      const { results } = await proxyOnly(new MockRoutingProvider({ circuity }));
      for (const r of results) expect(Math.abs(r.detourKm / (2 * r.lateralDistanceKm) - PROXY_CIRCUITY_FACTOR)).toBeLessThan(0.01);
    }
  });

  it("la classifica stimata non cambia con il provider di percorsi (nessuna distorsione ereditata)", async () => {
    const ranking = async (circuity: number) => (await proxyOnly(new MockRoutingProvider({ circuity }))).results.map((r) => [r.station.id, r.netSavings]);
    expect(await ranking(1.0)).toEqual(await ranking(3.0));
  });

  it("la distanza «a X km da te» della scheda (metà del giro) è coerente col proxy: lateral × 1,25, non la sola linea d'aria", async () => {
    const { results } = await proxyOnly(new MockRoutingProvider());
    for (const r of results) expect(r.detourKm / 2).toBeCloseTo(r.lateralDistanceKm * PROXY_CIRCUITY_FACTOR, 1);
  });
});

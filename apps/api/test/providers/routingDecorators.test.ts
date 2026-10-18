import { describe, expect, it, vi } from "vitest";
import { BudgetExhaustedError } from "../../src/errors";
import { BudgetedRoutingProvider } from "../../src/providers/routing/BudgetedRoutingProvider";
import { DirectionsBudget } from "../../src/providers/routing/DirectionsBudget";
import { InFlightRoutingProvider } from "../../src/providers/routing/InFlightRoutingProvider";
import { MockRoutingProvider } from "../../src/providers/routing/MockRoutingProvider";
import type { RouteResult, RoutingProvider } from "../../src/providers/routing/RoutingProvider";
import { InMemoryUsageCounter } from "../../src/usage/UsageCounter";

const A = { lon: 9.204, lat: 45.4864 };
const S = { lon: 9.5, lat: 45.31 };
const B = { lon: 11.3426, lat: 44.5058 };

describe("MockRoutingProvider", () => {
  it("è deterministico", async () => {
    const provider = new MockRoutingProvider();
    expect(await provider.getRoute([A, B])).toEqual(await provider.getRoute([A, B]));
  });

  it("la geometria parte dall'origine, arriva a destinazione e passa per i waypoint intermedi", async () => {
    const route = await new MockRoutingProvider().getRoute([A, S, B]);
    expect(route?.geometry[0]).toEqual([A.lon, A.lat]);
    expect(route?.geometry[route.geometry.length - 1]).toEqual([B.lon, B.lat]);
    expect(route?.geometry).toContainEqual([S.lon, S.lat]);
  });

  it("passare da una stazione allunga distanza e durata (disuguaglianza triangolare)", async () => {
    const provider = new MockRoutingProvider();
    const direct = await provider.getRoute([A, B]);
    const via = await provider.getRoute([A, S, B]);
    expect(via!.distanceKm).toBeGreaterThan(direct!.distanceKm);
    expect(via!.durationMinutes).toBeGreaterThan(direct!.durationMinutes);
  });

  it("distanza e durata sono coerenti con circuity e velocità configurate", async () => {
    const route = await new MockRoutingProvider({ circuity: 1, speedKmh: 60 }).getRoute([
      { lon: 0, lat: 0 },
      { lon: 1, lat: 0 },
    ]);
    expect(route!.distanceKm).toBeCloseTo(111.19, 1);
    expect(route!.durationMinutes).toBeCloseTo(route!.distanceKm, 5); // 60 km/h → 1 km/min
  });

  it("registra le richieste ricevute", async () => {
    const provider = new MockRoutingProvider();
    await provider.getRoute([A, B]);
    await provider.getRoute([A, S, B]);
    expect(provider.calls.map((call) => call.length)).toEqual([2, 3]);
  });

  it("richiede almeno 2 waypoint", async () => {
    await expect(new MockRoutingProvider().getRoute([A])).rejects.toThrow(RangeError);
  });
});

describe("DirectionsBudget + BudgetedRoutingProvider (kill switch)", () => {
  function setup(used: number, limits = { softLimit: 80_000, hardLimit: 98_000 }) {
    const counter = new InMemoryUsageCounter();
    const clock = { now: new Date("2026-09-28T10:00:00.000Z") };
    const budget = new DirectionsBudget({ counter, ...limits, now: () => clock.now });
    const inner = new MockRoutingProvider();
    const provider = new BudgetedRoutingProvider(inner, budget);
    return { counter, clock, budget, inner, provider, seed: () => counter.increment("mapbox-directions", "2026-09", used) };
  }

  it("sotto la soglia soft lo stato è ok e ogni chiamata viene contata", async () => {
    const { provider, budget, counter } = setup(0);
    await provider.getRoute([A, B]);
    await provider.getRoute([A, S, B]);
    expect(await budget.status()).toBe("ok");
    expect(await counter.get("mapbox-directions", "2026-09")).toBe(2);
  });

  it("a 80.000 chiamate scatta la soglia soft (routing reale disabilitato, ma le chiamate restano consentite)", async () => {
    const { budget, provider, seed, inner } = setup(80_000);
    await seed();
    expect(await budget.status()).toBe("soft_limit");
    await expect(provider.getRoute([A, B])).resolves.not.toBeNull(); // la rotta A→B resta necessaria
    expect(inner.calls).toHaveLength(1);
  });

  it("79.999 chiamate → ancora ok; 80.000 → soft (soglia inclusiva)", async () => {
    const below = setup(79_999);
    await below.seed();
    expect(await below.budget.status()).toBe("ok");

    const at = setup(80_000);
    await at.seed();
    expect(await at.budget.status()).toBe("soft_limit");
  });

  it("al limite hard le chiamate sono bloccate senza raggiungere il provider", async () => {
    const { provider, budget, seed, inner } = setup(98_000);
    await seed();
    expect(await budget.status()).toBe("hard_limit");
    await expect(provider.getRoute([A, B])).rejects.toBeInstanceOf(BudgetExhaustedError);
    expect(inner.calls).toHaveLength(0);
  });

  it("il contatore riparte a ogni mese (periodo YYYY-MM)", async () => {
    const { budget, clock, seed } = setup(90_000);
    await seed();
    expect(await budget.status()).toBe("soft_limit");
    clock.now = new Date("2026-10-01T00:00:01.000Z");
    expect(await budget.status()).toBe("ok");
  });

  it("softLimit non può superare hardLimit", () => {
    expect(
      () => new DirectionsBudget({ counter: new InMemoryUsageCounter(), softLimit: 10, hardLimit: 5 }),
    ).toThrow(RangeError);
  });
});

describe("InFlightRoutingProvider — solo deduplica delle richieste in corso, nessuna cache (Mapbox Product Terms §2.10.1)", () => {
  const route: RouteResult = { distanceKm: 10, durationMinutes: 12, geometry: [[0, 0], [1, 1]] };

  function countingProvider(behavior: () => Promise<RouteResult | null> = async () => route) {
    const getRoute = vi.fn(behavior);
    return { provider: { getRoute } as RoutingProvider, getRoute };
  }

  /** Un provider la cui risposta arriva quando lo decidiamo noi: serve a tenere le richieste «in volo». */
  function gatedProvider() {
    const pending: Array<{ resolve: (value: RouteResult | null) => void; reject: (reason: Error) => void }> = [];
    const getRoute = vi.fn(() => new Promise<RouteResult | null>((resolve, reject) => { pending.push({ resolve, reject }); }));
    return { provider: { getRoute } as RoutingProvider, getRoute, release: (value: RouteResult | null = route) => pending.shift()!.resolve(value), fail: (error: Error) => pending.shift()!.reject(error) };
  }

  it("la stessa richiesta ripetuta DOPO la risposta fa una nuova chiamata: nessun risultato resta memorizzato", async () => {
    const { provider, getRoute } = countingProvider();
    const dedup = new InFlightRoutingProvider(provider);
    await dedup.getRoute([A, B]);
    await dedup.getRoute([A, B]);
    await dedup.getRoute([A, B]);
    expect(getRoute).toHaveBeenCalledTimes(3);
    expect(dedup.pending).toBe(0);
  });

  it("richieste identiche in corso contemporaneamente vengono unificate in una sola chiamata", async () => {
    const { provider, getRoute, release } = gatedProvider();
    const dedup = new InFlightRoutingProvider(provider);
    const first = dedup.getRoute([A, S, B]);
    const second = dedup.getRoute([A, S, B]);
    const third = dedup.getRoute([A, S, B]);
    expect(dedup.pending).toBe(1);
    release();
    expect(await first).toBe(await second);
    expect(await third).toBe(route);
    expect(getRoute).toHaveBeenCalledTimes(1);
  });

  it("appena la richiesta si conclude la voce sparisce (anche subito dopo, la successiva riparte)", async () => {
    const { provider, getRoute, release } = gatedProvider();
    const dedup = new InFlightRoutingProvider(provider);
    const first = dedup.getRoute([A, B]);
    release();
    await first;
    expect(dedup.pending).toBe(0);
    const again = dedup.getRoute([A, B]);
    expect(getRoute).toHaveBeenCalledTimes(2);
    release();
    await again;
  });

  it("anche l'assenza di percorso (null) e gli errori non restano: la richiesta successiva riprova", async () => {
    const { provider, getRoute, release, fail } = gatedProvider();
    const dedup = new InFlightRoutingProvider(provider);
    const none = dedup.getRoute([A, B]);
    release(null);
    expect(await none).toBeNull();
    const failing = dedup.getRoute([A, B]);
    fail(new Error("rete assente"));
    await expect(failing).rejects.toThrow("rete assente");
    expect(dedup.pending).toBe(0);
    const ok = dedup.getRoute([A, B]);
    release();
    await expect(ok).resolves.toBe(route);
    expect(getRoute).toHaveBeenCalledTimes(3);
  });

  it("coordinate quasi identiche (entro ~10 m) condividono la chiamata in corso", async () => {
    const { provider, getRoute, release } = gatedProvider();
    const dedup = new InFlightRoutingProvider(provider);
    const first = dedup.getRoute([A, B]);
    const second = dedup.getRoute([{ lon: A.lon + 0.00001, lat: A.lat }, B]);
    release();
    await Promise.all([first, second]);
    expect(getRoute).toHaveBeenCalledTimes(1);
  });

  it("waypoint diversi non si mescolano", async () => {
    const { provider, getRoute, release } = gatedProvider();
    const dedup = new InFlightRoutingProvider(provider);
    const calls = [dedup.getRoute([A, B]), dedup.getRoute([A, S, B]), dedup.getRoute([B, A])];
    expect(getRoute).toHaveBeenCalledTimes(3);
    release(); release(); release();
    await Promise.all(calls);
  });

  it("nessun TTL, nessun numero massimo di voci: dopo molto tempo e molte richieste non c'è nulla in memoria", async () => {
    const { provider } = countingProvider();
    const dedup = new InFlightRoutingProvider(provider);
    for (let i = 0; i < 300; i++) await dedup.getRoute([{ lon: 9 + i * 0.001, lat: 45 }, B]);
    expect(dedup.pending).toBe(0);
  });

  it("stack di produzione: le richieste sovrapposte consumano UNA quota; quelle in sequenza una ciascuna (nessuna cache)", async () => {
    const counter = new InMemoryUsageCounter();
    const budget = new DirectionsBudget({ counter, softLimit: 80_000, hardLimit: 98_000, now: () => new Date("2026-09-28T00:00:00Z") });
    const stack = new InFlightRoutingProvider(new BudgetedRoutingProvider(new MockRoutingProvider(), budget));

    await Promise.all([stack.getRoute([A, B]), stack.getRoute([A, B]), stack.getRoute([A, B])]);
    expect(await counter.get("mapbox-directions", "2026-09")).toBe(1);

    await stack.getRoute([A, B]);
    await stack.getRoute([A, B]);
    expect(await counter.get("mapbox-directions", "2026-09")).toBe(3);
  });
});

describe("InMemoryUsageCounter", () => {
  it("separa servizi e periodi", async () => {
    const counter = new InMemoryUsageCounter();
    await counter.increment("a", "2026-09");
    await counter.increment("a", "2026-09", 4);
    await counter.increment("a", "2026-10");
    await counter.increment("b", "2026-09");
    expect(await counter.get("a", "2026-09")).toBe(5);
    expect(await counter.get("a", "2026-10")).toBe(1);
    expect(await counter.get("b", "2026-09")).toBe(1);
    expect(await counter.get("c", "2026-09")).toBe(0);
  });
});

describe("«Evita autostrada» nei decoratori di routing", () => {
  const route: RouteResult = { distanceKm: 10, durationMinutes: 12, geometry: [[0, 0], [1, 1]] };
  const A = { lon: 9, lat: 45 };
  const B = { lon: 10, lat: 45 };

  /** Provider con risposta a comando: tiene «in volo» le richieste per poter provare la deduplica. */
  function gated() {
    const resolvers: Array<() => void> = [];
    const getRoute = vi.fn(() => new Promise<RouteResult | null>((resolve) => resolvers.push(() => resolve(route))));
    return { getRoute, releaseAll: () => resolvers.splice(0).forEach((resolve) => resolve()) };
  }

  it("la deduplica tiene separati il percorso normale e quello senza autostrada (sono richieste diverse)", async () => {
    const { getRoute, releaseAll } = gated();
    const dedup = new InFlightRoutingProvider({ getRoute } as RoutingProvider);
    const calls = [dedup.getRoute([A, B]), dedup.getRoute([A, B], { avoidMotorway: true })];
    expect(getRoute).toHaveBeenCalledTimes(2);
    const again = [dedup.getRoute([A, B]), dedup.getRoute([A, B], { avoidMotorway: true })];
    expect(getRoute).toHaveBeenCalledTimes(2); // ora entrambe condividono la chiamata in corso
    releaseAll();
    await Promise.all([...calls, ...again]);
  });

  it("un avoidMotorway a false vale come assente (stessa richiesta)", async () => {
    const { getRoute, releaseAll } = gated();
    const dedup = new InFlightRoutingProvider({ getRoute } as RoutingProvider);
    const calls = [dedup.getRoute([A, B]), dedup.getRoute([A, B], { avoidMotorway: false })];
    expect(getRoute).toHaveBeenCalledTimes(1);
    releaseAll();
    await Promise.all(calls);
  });

  it("ogni insieme di esclusioni è una richiesta a sé; l'ordine in cui sono scritte non conta", async () => {
    const { getRoute, releaseAll } = gated();
    const dedup = new InFlightRoutingProvider({ getRoute } as RoutingProvider);
    const sets = [{}, { avoidMotorway: true }, { avoidTolls: true }, { avoidFerries: true }, { avoidMotorway: true, avoidTolls: true }, { avoidTolls: true, avoidFerries: true }];
    const calls = sets.map((set) => dedup.getRoute([A, B], set));
    expect(getRoute).toHaveBeenCalledTimes(sets.length); // nessuna collisione tra insiemi diversi
    calls.push(dedup.getRoute([A, B], { avoidTolls: true, avoidMotorway: true })); // stesso insieme, ordine diverso
    calls.push(dedup.getRoute([A, B], { avoidMotorway: false, avoidTolls: false, avoidFerries: false })); // tutto a false = assente
    expect(getRoute).toHaveBeenCalledTimes(sets.length);
    releaseAll();
    await Promise.all(calls);
  });

  it("il decoratore del kill switch inoltra le opzioni al provider", async () => {
    const getRoute = vi.fn(async () => route);
    const counter = new InMemoryUsageCounter();
    const budget = new DirectionsBudget({ counter, softLimit: 80_000, hardLimit: 98_000 });
    await new BudgetedRoutingProvider({ getRoute } as RoutingProvider, budget).getRoute([A, B], { avoidMotorway: true });
    expect(getRoute).toHaveBeenCalledWith([A, B], { avoidMotorway: true });
  });
});

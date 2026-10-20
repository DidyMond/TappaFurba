import { NEARBY_RADIUS_KM } from "@tappafurba/shared";
import { Writable } from "node:stream";
import type { FastifyInstance } from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import { buildApp, type AppOptions } from "../../src/app";
import { ProviderError } from "../../src/errors";
import { FixtureGeocodingProvider } from "../../src/providers/geocoding/FixtureGeocodingProvider";
import type { GeocodingProvider } from "../../src/providers/geocoding/GeocodingProvider";
import { MockRoutingProvider } from "../../src/providers/routing/MockRoutingProvider";
import { SearchService } from "../../src/search/SearchService";
import { SearchSessionStore } from "../../src/search/SearchSessionStore";
import { InMemoryStationRepository, row } from "../helpers/inMemoryStationRepository";

const validBody = {
  origin: { lon: 9.0, lat: 45.0 },
  destination: { lon: 10.0, lat: 45.0 },
  fuelType: "benzina",
};

const stations = () => [
  row({ stationId: 1, lon: 9.2, lat: 45.001, price: 1.8 }),
  row({ stationId: 2, lon: 9.4, lat: 45.002, price: 1.82 }),
  row({ stationId: 3, lon: 9.6, lat: 45.003, price: 1.84 }),
  row({ stationId: 5, lon: 9.5, lat: 45.012, price: 1.7 }),
];

const apps: FastifyInstance[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

async function makeApp(overrides: Partial<AppOptions> = {}): Promise<FastifyInstance> {
  const searchService = new SearchService({
    routing: new MockRoutingProvider(),
    repository: new InMemoryStationRepository(stations()),
    budget: { status: async () => "ok" },
    sessions: new SearchSessionStore(),
  });
  const app = await buildApp({
    logger: false,
    trustProxy: false,
    corsOrigin: "http://localhost:5173",
    searchService,
    geocoding: new FixtureGeocodingProvider(),
    searchRateLimitPerMinute: 100,
    geocodeRateLimitPerMinute: 100,
    checkDatabase: async () => true,
    runIngestion: async () => ({ ok: true }),
    ...overrides,
  });
  apps.push(app);
  return app;
}

describe("POST /search", () => {
  it("200 con risultati, riferimento di prezzo e stato del ricalcolo", async () => {
    const app = await makeApp();
    const response = await app.inject({ method: "POST", url: "/search", payload: validBody });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.searchId).toMatch(/^[0-9a-f-]{36}$/);
    expect(body.referencePrice).toMatchObject({ level: "on_route", sampleSize: 3 });
    expect(body.results.length).toBeGreaterThan(0);
    expect(body.refinement.status).toBe("pending");
    expect(body.pricesUpdatedAt).toBe("2026-09-28T07:00:00.000Z");
  });

  it("applica i default confermati quando i parametri opzionali mancano", async () => {
    const app = await makeApp();
    const body = (await app.inject({ method: "POST", url: "/search", payload: validBody })).json();
    // consumo di default 15 km/L → costo/km = riferimento / 15
    expect(body.costPerKm).toBeCloseTo(body.referencePrice.value / 15, 3);
  });

  it.each([
    ["origine mancante", { ...validBody, origin: undefined }],
    ["carburante non ammesso (hvo)", { ...validBody, fuelType: "hvo" }],
    ["carburante non ammesso (unknown)", { ...validBody, fuelType: "unknown" }],
    ["deviazione oltre il massimo (10 km)", { ...validBody, maxDetourKm: 11 }],
    ["deviazione sotto il minimo (1 km)", { ...validBody, maxDetourKm: 0.5 }],
    ["litri negativi", { ...validBody, liters: -5 }],
    ["consumo nullo", { ...validBody, consumptionKmPerLiter: 0 }],
    ["latitudine fuori range", { ...validBody, origin: { lon: 9, lat: 95 } }],
    ["soglia di freschezza non intera", { ...validBody, maxPriceAgeHours: 2.5 }],
    ["origine e destinazione coincidenti", { ...validBody, destination: validBody.origin }],
    ["tipo sbagliato", { ...validBody, liters: "quarantacinque" }],
  ])("400 VALIDATION_ERROR — %s", async (_label, payload) => {
    const app = await makeApp();
    const response = await app.inject({ method: "POST", url: "/search", payload: payload as object });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("VALIDATION_ERROR");
    expect(typeof response.json().error.message).toBe("string");
  });

  it("400 su JSON malformato", async () => {
    const app = await makeApp();
    const response = await app.inject({
      method: "POST",
      url: "/search",
      headers: { "content-type": "application/json" },
      payload: "{non è json",
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("VALIDATION_ERROR");
  });

  it("422 NO_ROUTE quando il provider non trova un percorso", async () => {
    const searchService = new SearchService({
      routing: { getRoute: async () => null },
      repository: new InMemoryStationRepository(stations()),
      budget: { status: async () => "ok" },
      sessions: new SearchSessionStore(),
    });
    const app = await makeApp({ searchService });
    const response = await app.inject({ method: "POST", url: "/search", payload: validBody });
    expect(response.statusCode).toBe(422);
    expect(response.json().error.code).toBe("NO_ROUTE");
  });

  it("RATE LIMIT — oltre il massimo per minuto risponde 429 RATE_LIMITED e protegge il provider", async () => {
    const app = await makeApp({ searchRateLimitPerMinute: 3 });
    const statuses: number[] = [];
    for (let i = 0; i < 5; i++) {
      statuses.push((await app.inject({ method: "POST", url: "/search", payload: validBody })).statusCode);
    }
    expect(statuses).toEqual([200, 200, 200, 429, 429]);

    const blocked = await app.inject({ method: "POST", url: "/search", payload: validBody });
    expect(blocked.json().error.code).toBe("RATE_LIMITED");
    expect(blocked.headers["retry-after"]).toBeDefined();
  });

  it("il rate limit di /search è per IP: un altro IP non è penalizzato", async () => {
    const app = await makeApp({ searchRateLimitPerMinute: 1, trustProxy: true });
    const call = (ip: string) =>
      app.inject({ method: "POST", url: "/search", payload: validBody, headers: { "x-forwarded-for": ip } });
    expect((await call("203.0.113.1")).statusCode).toBe(200);
    expect((await call("203.0.113.1")).statusCode).toBe(429);
    expect((await call("203.0.113.2")).statusCode).toBe(200);
  });

  it("le richieste bloccate dal rate limit non raggiungono il servizio di ricerca", async () => {
    const routing = new MockRoutingProvider();
    const searchService = new SearchService({
      routing,
      repository: new InMemoryStationRepository(stations()),
      budget: { status: async () => "ok" },
      sessions: new SearchSessionStore(),
    });
    const app = await makeApp({ searchService, searchRateLimitPerMinute: 2 });
    for (let i = 0; i < 6; i++) await app.inject({ method: "POST", url: "/search", payload: validBody });
    // 2 ricerche ammesse → 2 chiamate A→B (le altre 4 richieste sono state fermate prima)
    expect(routing.calls.filter((c) => c.length === 2)).toHaveLength(2);
  });
});

describe("GET /search/:id", () => {
  it("restituisce lo stato del ricalcolo e i risultati aggiornati", async () => {
    const app = await makeApp();
    const created = (await app.inject({ method: "POST", url: "/search", payload: validBody })).json();
    const polled = await app.inject({ method: "GET", url: `/search/${created.searchId}` });

    expect(polled.statusCode).toBe(200);
    expect(polled.json().searchId).toBe(created.searchId);
    expect(["pending", "done"]).toContain(polled.json().refinement.status);
    expect(Array.isArray(polled.json().results)).toBe(true);
  });

  it("404 SEARCH_NOT_FOUND per un id sconosciuto", async () => {
    const app = await makeApp();
    const response = await app.inject({ method: "GET", url: "/search/00000000-0000-4000-8000-000000000000" });
    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe("SEARCH_NOT_FOUND");
  });

  it("400 per un id che non è un UUID", async () => {
    const app = await makeApp();
    const response = await app.inject({ method: "GET", url: "/search/abc" });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("VALIDATION_ERROR");
  });
});

describe("GET /geocode/autocomplete", () => {
  it("restituisce i suggerimenti del provider", async () => {
    const app = await makeApp();
    const response = await app.inject({ method: "GET", url: "/geocode/autocomplete?q=bologna" });
    expect(response.statusCode).toBe(200);
    const names = response.json().suggestions.map((s: { name: string }) => s.name);
    expect(names).toEqual(expect.arrayContaining(["Bologna Centrale", "Bologna Fiera"]));
  });

  it("inoltra il bias di prossimità al provider", async () => {
    let received: unknown;
    const geocoding: GeocodingProvider = {
      autocomplete: async (_q, options) => {
        received = options;
        return [];
      },
      reverse: async () => null,
    };
    const app = await makeApp({ geocoding });
    await app.inject({ method: "GET", url: "/geocode/autocomplete?q=roma&lon=9.19&lat=45.46" });
    expect(received).toMatchObject({ proximity: { lon: 9.19, lat: 45.46 } });
  });

  it("senza coordinate non applica alcun bias", async () => {
    let received: { proximity?: unknown } | undefined;
    const geocoding: GeocodingProvider = {
      autocomplete: async (_q, options) => {
        received = options;
        return [];
      },
      reverse: async () => null,
    };
    const app = await makeApp({ geocoding });
    await app.inject({ method: "GET", url: "/geocode/autocomplete?q=roma" });
    expect(received?.proximity).toBeUndefined();
  });

  it.each(["", "?q=", "?q=ab", "?q=%20%20%20", `?q=${"x".repeat(121)}`])("400 se la query è vuota o troppo corta/lunga (%#)", async (query) => {
    const app = await makeApp();
    const response = await app.inject({ method: "GET", url: `/geocode/autocomplete${query}` });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("VALIDATION_ERROR");
  });

  it("un errore del provider diventa 502 PROVIDER_ERROR con messaggio sicuro", async () => {
    const geocoding: GeocodingProvider = {
      autocomplete: async () => {
        throw new ProviderError("Il servizio di ricerca degli indirizzi non è raggiungibile: riprova tra poco.");
      },
      reverse: async () => null,
    };
    const app = await makeApp({ geocoding });
    const response = await app.inject({ method: "GET", url: "/geocode/autocomplete?q=bologna" });
    expect(response.statusCode).toBe(502);
    expect(response.json().error).toEqual({ code: "PROVIDER_ERROR", message: "Il servizio di ricerca degli indirizzi non è raggiungibile: riprova tra poco." });
  });

  it("rate limit dedicato: oltre il massimo → 429", async () => {
    const app = await makeApp({ geocodeRateLimitPerMinute: 2 });
    const statuses: number[] = [];
    for (let i = 0; i < 4; i++) {
      statuses.push((await app.inject({ method: "GET", url: "/geocode/autocomplete?q=bologna" })).statusCode);
    }
    expect(statuses).toEqual([200, 200, 429, 429]);
  });

  it("i limiti di /search e /geocode sono indipendenti", async () => {
    const app = await makeApp({ searchRateLimitPerMinute: 1, geocodeRateLimitPerMinute: 5 });
    await app.inject({ method: "POST", url: "/search", payload: validBody });
    expect((await app.inject({ method: "POST", url: "/search", payload: validBody })).statusCode).toBe(429);
    expect((await app.inject({ method: "GET", url: "/geocode/autocomplete?q=bologna" })).statusCode).toBe(200);
  });
});

describe("GET /geocode/reverse", () => {
  it("restituisce l'etichetta del luogo", async () => {
    const app = await makeApp();
    const response = await app.inject({ method: "GET", url: "/geocode/reverse?lon=9.2045&lat=45.4866" });
    expect(response.statusCode).toBe(200);
    expect(response.json().label).toContain("Milano Centrale");
  });

  it("404 NOT_FOUND se non trova nulla", async () => {
    const app = await makeApp();
    const response = await app.inject({ method: "GET", url: "/geocode/reverse?lon=0&lat=0" });
    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe("NOT_FOUND");
  });

  it("400 se mancano le coordinate", async () => {
    const app = await makeApp();
    expect((await app.inject({ method: "GET", url: "/geocode/reverse" })).statusCode).toBe(400);
    expect((await app.inject({ method: "GET", url: "/geocode/reverse?lon=9" })).statusCode).toBe(400);
  });
});

describe("GET /health e POST /ingest", () => {
  it("health: 200 ok con database raggiungibile", async () => {
    const app = await makeApp();
    const response = await app.inject({ method: "GET", url: "/health" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: "ok", database: "ok" });
  });

  it("health: 503 degraded se il database non risponde", async () => {
    const app = await makeApp({ checkDatabase: async () => false });
    const response = await app.inject({ method: "GET", url: "/health" });
    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({ status: "degraded", database: "error" });
  });

  it("ingest: senza segreto configurato l'endpoint è disattivato (404); il resto è in security.test.ts", async () => {
    const app = await makeApp();
    const response = await app.inject({ method: "POST", url: "/ingest" });
    expect(response.statusCode).toBe(404);
  });
});

describe("gestione errori generale", () => {
  it("un errore imprevisto restituisce 500 senza esporre dettagli interni", async () => {
    const searchService = {
      search: async () => {
        throw new Error("password del database: hunter2");
      },
      getRefinement: () => null,
    } as unknown as SearchService;
    const app = await makeApp({ searchService });
    const response = await app.inject({ method: "POST", url: "/search", payload: validBody });
    expect(response.statusCode).toBe(500);
    expect(response.json().error.code).toBe("INTERNAL_ERROR");
    expect(response.body).not.toContain("hunter2");
  });
});

describe("privacy dei log", () => {
  it("l'indirizzo digitato (query string) non compare mai nei log del server", async () => {
    const lines: string[] = [];
    const logStream = new Writable({
      write(chunk, _encoding, callback) {
        lines.push(chunk.toString());
        callback();
      },
    });
    const app = await makeApp({ logger: true, logStream });

    await app.inject({ method: "GET", url: "/geocode/autocomplete?q=via%20segreta%2012%20milano&lon=9.19&lat=45.46" });
    await app.inject({ method: "GET", url: "/geocode/reverse?lon=9.2045&lat=45.4866" });
    await app.close();

    const logs = lines.join("");
    expect(logs).toContain("/geocode/autocomplete"); // la richiesta viene comunque tracciata...
    expect(logs).not.toMatch(/segreta/i); // ...ma senza il testo digitato
    expect(logs).not.toContain("q=");
    expect(logs).not.toContain("45.4866"); // né le coordinate della posizione utente
  });
});

describe("GET /search/:id/stations/:stationId", () => {
  it("200 con il dettaglio completo: stazione, combinazione scelta, prezzi, deviazione verificata e impatto", async () => {
    const app = await makeApp();
    const created = (await app.inject({ method: "POST", url: "/search", payload: validBody })).json();
    const response = await app.inject({ method: "GET", url: `/search/${created.searchId}/stations/5` });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.searchId).toBe(created.searchId);
    expect(body.station).toMatchObject({ id: 5, tipoImpianto: "stradale" });
    expect(body.selected).toMatchObject({ fuelType: "benzina", isSelf: true });
    expect(body.detour.source).toBe("routing");
    expect(body.detour.km).toBeGreaterThan(0);
    expect(body.impact).toEqual(
      expect.objectContaining({ netSavings: expect.any(Number), priceDifferencePerLiter: expect.any(Number), priceDifferencePercent: expect.any(Number) }),
    );
    expect(Array.isArray(body.prices)).toBe(true);
  });

  it("con il routing in errore risponde comunque 200 con detour.source «proxy»", async () => {
    const failing = new MockRoutingProvider();
    const original = failing.getRoute.bind(failing);
    failing.getRoute = async (waypoints) => {
      if (waypoints.length === 3) throw new ProviderError("Il servizio dei percorsi non è raggiungibile: riprova tra poco.");
      return original(waypoints);
    };
    const searchService = new SearchService({
      routing: failing,
      repository: new InMemoryStationRepository(stations()),
      budget: { status: async () => "soft_limit" },
      sessions: new SearchSessionStore(),
    });
    const app = await makeApp({ searchService });
    const created = (await app.inject({ method: "POST", url: "/search", payload: validBody })).json();
    const response = await app.inject({ method: "GET", url: `/search/${created.searchId}/stations/5` });
    expect(response.statusCode).toBe(200);
    expect(response.json().detour.source).toBe("proxy");
  });

  it("404 SEARCH_NOT_FOUND / NOT_FOUND e 400 per parametri non validi", async () => {
    const app = await makeApp();
    const unknown = await app.inject({ method: "GET", url: "/search/00000000-0000-4000-8000-000000000000/stations/5" });
    expect(unknown.statusCode).toBe(404);
    expect(unknown.json().error.code).toBe("SEARCH_NOT_FOUND");

    const created = (await app.inject({ method: "POST", url: "/search", payload: validBody })).json();
    const missing = await app.inject({ method: "GET", url: `/search/${created.searchId}/stations/424242` });
    expect(missing.statusCode).toBe(404);
    expect(missing.json().error.code).toBe("NOT_FOUND");

    const bad = await app.inject({ method: "GET", url: `/search/${created.searchId}/stations/abc` });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().error.code).toBe("VALIDATION_ERROR");
  });
});

describe("GET /search/:id/stations/:stationId/route", () => {
  it("200 con la geometria del percorso con sosta", async () => {
    const app = await makeApp();
    const created = (await app.inject({ method: "POST", url: "/search", payload: validBody })).json();
    const response = await app.inject({ method: "GET", url: `/search/${created.searchId}/stations/5/route` });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.stationId).toBe(5);
    expect(body.geometry.length).toBeGreaterThan(2);
    expect(body.detourKm).toBeGreaterThan(0);
  });

  it("404 SEARCH_NOT_FOUND per una ricerca sconosciuta, 404 NOT_FOUND per una stazione fuori dai risultati", async () => {
    const app = await makeApp();
    const unknown = await app.inject({ method: "GET", url: "/search/00000000-0000-4000-8000-000000000000/stations/5/route" });
    expect(unknown.statusCode).toBe(404);
    expect(unknown.json().error.code).toBe("SEARCH_NOT_FOUND");

    const created = (await app.inject({ method: "POST", url: "/search", payload: validBody })).json();
    const missing = await app.inject({ method: "GET", url: `/search/${created.searchId}/stations/424242/route` });
    expect(missing.statusCode).toBe(404);
    expect(missing.json().error.code).toBe("NOT_FOUND");
  });

  it("400 per parametri non validi", async () => {
    const app = await makeApp();
    const created = (await app.inject({ method: "POST", url: "/search", payload: validBody })).json();
    const response = await app.inject({ method: "GET", url: `/search/${created.searchId}/stations/abc/route` });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("VALIDATION_ERROR");
  });
});

describe("POST /nearby — «Intorno a me»", () => {
  const nearbyBody = { origin: { lon: 9.0, lat: 45.0 }, fuelType: "benzina" };
  const nearbyStations = () => [
    row({ stationId: 21, lon: 9.0, lat: 45.01, price: 1.8 }),
    row({ stationId: 22, lon: 9.0, lat: 45.02, price: 1.82 }),
    row({ stationId: 23, lon: 9.0, lat: 45.03, price: 1.84 }),
    row({ stationId: 24, lon: 9.0, lat: 45.035, price: 1.7 }),
  ];

  async function makeNearbyApp(overrides: Partial<AppOptions> = {}): Promise<FastifyInstance> {
    const searchService = new SearchService({
      routing: new MockRoutingProvider(),
      repository: new InMemoryStationRepository(nearbyStations()),
      budget: { status: async () => "ok" },
      sessions: new SearchSessionStore(),
    });
    return makeApp({ searchService, ...overrides });
  }

  it("200 con risultati, riferimento «area», punto e raggio di default (5 km), senza percorso", async () => {
    const app = await makeNearbyApp();
    const response = await app.inject({ method: "POST", url: "/nearby", payload: nearbyBody });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.searchId).toMatch(/^[0-9a-f-]{36}$/);
    expect(body.nearby).toEqual({ origin: { lon: 9.0, lat: 45.0 }, radiusKm: 5 });
    expect(body.route).toBeUndefined();
    expect(body.referencePrice).toMatchObject({ level: "area", sampleSize: 4 });
    expect(body.results).toHaveLength(4);
    expect(body.refinement.status).toBe("pending");
  });

  it("accetta un raggio scelto dall'utente", async () => {
    const app = await makeNearbyApp();
    const body = (await app.inject({ method: "POST", url: "/nearby", payload: { ...nearbyBody, radiusKm: 3.5 } })).json();
    expect(body.nearby.radiusKm).toBe(3.5);
    expect(body.candidatesEvaluated).toBe(3); // solo le stazioni entro 3,5 km (la quarta è a ~3,9)
  });

  it.each([
    ["origine mancante", { ...nearbyBody, origin: undefined }],
    ["raggio oltre il massimo (10 km)", { ...nearbyBody, radiusKm: 11 }],
    ["raggio sotto il minimo (1 km)", { ...nearbyBody, radiusKm: 0.5 }],
    ["carburante non ammesso (hvo)", { ...nearbyBody, fuelType: "hvo" }],
    ["latitudine fuori range", { ...nearbyBody, origin: { lon: 9, lat: 95 } }],
    ["litri negativi", { ...nearbyBody, liters: -5 }],
    ["tipo sbagliato", { ...nearbyBody, radiusKm: "cinque" }],
  ])("400 VALIDATION_ERROR — %s", async (_label, payload) => {
    const app = await makeNearbyApp();
    const response = await app.inject({ method: "POST", url: "/nearby", payload: payload as object });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("VALIDATION_ERROR");
  });

  it("422 NO_PRICE_DATA quando in zona non ci sono prezzi sufficienti", async () => {
    const searchService = new SearchService({
      routing: new MockRoutingProvider(),
      repository: new InMemoryStationRepository([]),
      budget: { status: async () => "ok" },
      sessions: new SearchSessionStore(),
    });
    const app = await makeApp({ searchService });
    const response = await app.inject({ method: "POST", url: "/nearby", payload: nearbyBody });
    expect(response.statusCode).toBe(422);
    expect(response.json().error.code).toBe("NO_PRICE_DATA");
  });

  it("RATE LIMIT — oltre il massimo per minuto /nearby risponde 429 RATE_LIMITED", async () => {
    const app = await makeNearbyApp({ searchRateLimitPerMinute: 2 });
    const statuses: number[] = [];
    for (let i = 0; i < 4; i++) {
      statuses.push((await app.inject({ method: "POST", url: "/nearby", payload: nearbyBody })).statusCode);
    }
    expect(statuses).toEqual([200, 200, 429, 429]);
    expect((await app.inject({ method: "POST", url: "/nearby", payload: nearbyBody })).json().error.code).toBe("RATE_LIMITED");
  });

  it("RATE LIMIT — /nearby e /search hanno contatori separati: l'uno non consuma il limite dell'altro (e ciascuno ha il suo)", async () => {
    // Stesso punto di partenza per le due rotte; il percorso A→B (a nord, +0,2°) lascia sul corridoio le stesse stazioni di prova.
    const trip = { origin: { lon: 9.0, lat: 45.0 }, destination: { lon: 9.0, lat: 45.2 }, fuelType: "benzina" };
    const app = await makeNearbyApp({ searchRateLimitPerMinute: 2 });
    const call = async (url: "/search" | "/nearby") => (await app.inject({ method: "POST", url, payload: url === "/search" ? trip : nearbyBody })).statusCode;

    // 2 su /search + 2 su /nearby, con il limite a 2 per rotta: tutte e quattro passano...
    expect([await call("/search"), await call("/search"), await call("/nearby"), await call("/nearby")]).toEqual([200, 200, 200, 200]);
    // ...e subito dopo ciascuna rotta ha esaurito il proprio.
    expect([await call("/search"), await call("/nearby")]).toEqual([429, 429]);
  });

  it("il polling e il dettaglio della stazione funzionano con l'id di una ricerca «Intorno a me»", async () => {
    const app = await makeNearbyApp();
    const { searchId } = (await app.inject({ method: "POST", url: "/nearby", payload: nearbyBody })).json();

    const poll = await app.inject({ method: "GET", url: `/search/${searchId}` });
    expect(poll.statusCode).toBe(200);
    expect(poll.json().results.length).toBe(4);

    const detail = await app.inject({ method: "GET", url: `/search/${searchId}/stations/24` });
    expect(detail.statusCode).toBe(200);
    expect(detail.json()).toMatchObject({ mode: "nearby", alongRouteKm: 0 });

    const route = await app.inject({ method: "GET", url: `/search/${searchId}/stations/24/route` });
    expect(route.statusCode).toBe(200);
    expect(route.json().geometry.length).toBeGreaterThan(1);
  });

  it("i log non contengono le coordinate del punto di partenza", async () => {
    const lines: string[] = [];
    const logStream = new Writable({
      write(chunk, _encoding, callback) {
        lines.push(chunk.toString());
        callback();
      },
    });
    const app = await makeNearbyApp({ logger: true, logStream });
    await app.inject({ method: "POST", url: "/nearby", payload: { ...nearbyBody, origin: { lon: 9.123456, lat: 45.654321 } } });
    await app.close();
    const logs = lines.join("");
    expect(logs).not.toContain("9.123456");
    expect(logs).not.toContain("45.654321");
  });
});

describe("POST /nearby — il raggio accettato coincide con quello dello slider (NEARBY_RADIUS_KM)", () => {
  const body = (radiusKm: number) => ({ origin: { lon: 9.0, lat: 45.0 }, fuelType: "benzina", radiusKm });
  const wide = () =>
    makeApp({
      searchService: new SearchService({
        routing: new MockRoutingProvider(),
        // Abbastanza stazioni (a ~1,1 / 2,2 / 3,3 km) per non cadere in NO_PRICE_DATA con qualunque raggio ≥ 4 km.
        repository: new InMemoryStationRepository([
          row({ stationId: 51, lon: 9.0, lat: 45.01, price: 1.8 }),
          row({ stationId: 52, lon: 9.0, lat: 45.02, price: 1.82 }),
          row({ stationId: 53, lon: 9.0, lat: 45.03, price: 1.84 }),
        ]),
        budget: { status: async () => "ok" },
        sessions: new SearchSessionStore(),
      }),
    });

  it("accetta gli estremi condivisi (min e max) e il valore predefinito", async () => {
    const app = await wide();
    for (const radiusKm of [NEARBY_RADIUS_KM.max, NEARBY_RADIUS_KM.max - 1]) {
      const res = await app.inject({ method: "POST", url: "/nearby", payload: body(radiusKm) });
      expect(res.statusCode, `raggio ${radiusKm}`).toBe(200);
      expect(res.json().nearby.radiusKm).toBe(radiusKm);
    }
    const noRadius = await app.inject({ method: "POST", url: "/nearby", payload: { origin: { lon: 9.0, lat: 45.0 }, fuelType: "benzina" } });
    expect(noRadius.json().nearby.radiusKm).toBe(NEARBY_RADIUS_KM.default);
  });

  it("il minimo condiviso (1 km) è valido anche se lì non c'è abbastanza prezzo: l'errore è dei dati (422), non del raggio (400)", async () => {
    const res = await (await wide()).inject({ method: "POST", url: "/nearby", payload: body(NEARBY_RADIUS_KM.min) });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe("NO_PRICE_DATA");
  });

  it("rifiuta (400) ciò che lo slider non può esprimere: appena sopra il massimo e appena sotto il minimo", async () => {
    const app = await wide();
    for (const radiusKm of [NEARBY_RADIUS_KM.max + 0.1, NEARBY_RADIUS_KM.min - 0.1, NEARBY_RADIUS_KM.max + 1, 0, -1]) {
      const res = await app.inject({ method: "POST", url: "/nearby", payload: body(radiusKm) });
      expect(res.statusCode, `raggio ${radiusKm}`).toBe(400);
      expect(res.json().error.code).toBe("VALIDATION_ERROR");
    }
  });
});

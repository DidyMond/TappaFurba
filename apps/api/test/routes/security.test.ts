import { Writable } from "node:stream";
import type { FastifyInstance } from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildApp, type AppOptions } from "../../src/app";
import { FixtureGeocodingProvider } from "../../src/providers/geocoding/FixtureGeocodingProvider";
import { BudgetedGeocodingProvider } from "../../src/providers/geocoding/BudgetedGeocodingProvider";
import type { GeocodingProvider } from "../../src/providers/geocoding/GeocodingProvider";
import { MockRoutingProvider } from "../../src/providers/routing/MockRoutingProvider";
import { SearchService } from "../../src/search/SearchService";
import { SearchSessionStore } from "../../src/search/SearchSessionStore";
import { InMemoryUsageCounter } from "../../src/usage/UsageCounter";
import { InMemoryStationRepository } from "../helpers/inMemoryStationRepository";

const INGEST_TOKEN = "t".repeat(40);
const LEAKY_URL =
  "https://api.mapbox.com/directions/v5/mapbox/driving/9,45;10,45?access_token=sk.eyJabcdefghijklmnopqrstuvwxyz0123456789.firma-segreta";

const apps: FastifyInstance[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

async function makeApp(overrides: Partial<AppOptions> = {}): Promise<FastifyInstance> {
  const app = await buildApp({
    logger: false,
    trustProxy: false,
    corsOrigin: "https://tappafurba.example",
    searchService: new SearchService({
      routing: new MockRoutingProvider(),
      repository: new InMemoryStationRepository([]),
      budget: { status: async () => "ok" },
      sessions: new SearchSessionStore(),
    }),
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

const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

describe("POST /ingest — autenticazione, limite e una sola esecuzione alla volta", () => {
  it("rifiuta (401) senza segreto, con segreto sbagliato o con uno schema diverso da Bearer, e non lancia l'ingestione", async () => {
    const runIngestion = vi.fn(async () => ({ ok: true }));
    const app = await makeApp({ ingestToken: INGEST_TOKEN, runIngestion, ingestRateLimitPerMinute: 50 });
    for (const headers of [{}, bearer("x".repeat(40)), bearer("corto"), { authorization: INGEST_TOKEN }, { authorization: `Basic ${INGEST_TOKEN}` }]) {
      const response = await app.inject({ method: "POST", url: "/ingest", headers });
      expect(response.statusCode).toBe(401);
      expect(response.headers["www-authenticate"]).toBe("Bearer");
    }
    expect(runIngestion).not.toHaveBeenCalled();
  });

  it("con il segreto giusto esegue l'ingestione e restituisce il riepilogo", async () => {
    const app = await makeApp({ ingestToken: INGEST_TOKEN, runIngestion: async () => ({ stationsUpserted: 3 }) });
    const response = await app.inject({ method: "POST", url: "/ingest", headers: bearer(INGEST_TOKEN) });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ stationsUpserted: 3 });
  });

  it("senza segreto configurato l'endpoint non esiste (404), anche con un header Authorization", async () => {
    const runIngestion = vi.fn(async () => ({ ok: true }));
    const app = await makeApp({ runIngestion });
    const response = await app.inject({ method: "POST", url: "/ingest", headers: bearer(INGEST_TOKEN) });
    expect(response.statusCode).toBe(404);
    expect(runIngestion).not.toHaveBeenCalled();
  });

  it("limita i tentativi per IP (anche quelli rifiutati): dopo il tetto risponde 429", async () => {
    const app = await makeApp({ ingestToken: INGEST_TOKEN, ingestRateLimitPerMinute: 3 });
    const statuses: number[] = [];
    for (let i = 0; i < 5; i++) {
      statuses.push((await app.inject({ method: "POST", url: "/ingest", headers: bearer("sbagliato") })).statusCode);
    }
    expect(statuses).toEqual([401, 401, 401, 429, 429]);
  });

  it("due ingestioni contemporanee non partono insieme: la seconda riceve 429, poi si può rilanciare", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const runIngestion = vi.fn(async () => {
      await gate;
      return { ok: true };
    });
    const app = await makeApp({ ingestToken: INGEST_TOKEN, runIngestion, ingestRateLimitPerMinute: 50 });
    const first = app.inject({ method: "POST", url: "/ingest", headers: bearer(INGEST_TOKEN) });
    await vi.waitFor(() => expect(runIngestion).toHaveBeenCalledTimes(1));
    const second = await app.inject({ method: "POST", url: "/ingest", headers: bearer(INGEST_TOKEN) });
    expect(second.statusCode).toBe(429);
    release();
    expect((await first).statusCode).toBe(200);
    expect((await app.inject({ method: "POST", url: "/ingest", headers: bearer(INGEST_TOKEN) })).statusCode).toBe(200);
    expect(runIngestion).toHaveBeenCalledTimes(2);
  });

  it("se l'ingestione fallisce il client non riceve il messaggio dell'errore (né un eventuale token)", async () => {
    const app = await makeApp({
      ingestToken: INGEST_TOKEN,
      runIngestion: async () => {
        throw new Error(`download fallito: ${LEAKY_URL}`);
      },
    });
    const response = await app.inject({ method: "POST", url: "/ingest", headers: bearer(INGEST_TOKEN) });
    expect(response.statusCode).toBe(502);
    expect(response.body).not.toContain("access_token");
    expect(response.body).not.toContain("download fallito");
  });
});

describe("rate limit per IP e header X-Forwarded-For", () => {
  const geocode = (app: FastifyInstance, forwardedFor: string) =>
    app.inject({ method: "GET", url: "/geocode/autocomplete?q=milano", headers: { "x-forwarded-for": forwardedFor } });

  it("con trustProxy = 1 (un proxy) un client NON sceglie il proprio IP falsificando X-Forwarded-For", async () => {
    // Il proxy (nginx) accoda l'IP vero in fondo all'header: gli indirizzi a sinistra li ha scritti il client.
    const app = await makeApp({ trustProxy: 1, geocodeRateLimitPerMinute: 2 });
    const statuses: number[] = [];
    for (let i = 1; i <= 4; i++) statuses.push((await geocode(app, `10.0.0.${i}, 203.0.113.9`)).statusCode);
    expect(statuses).toEqual([200, 200, 429, 429]);
  });

  it("con trustProxy = true l'header intero è fidato: il limite si aggira (per questo il valore consigliato è il NUMERO di proxy)", async () => {
    const app = await makeApp({ trustProxy: true, geocodeRateLimitPerMinute: 2 });
    const statuses: number[] = [];
    for (let i = 1; i <= 4; i++) statuses.push((await geocode(app, `10.0.0.${i}, 203.0.113.9`)).statusCode);
    expect(statuses).toEqual([200, 200, 200, 200]);
  });

  it("senza proxy fidati (false) l'header è ignorato del tutto", async () => {
    const app = await makeApp({ trustProxy: false, geocodeRateLimitPerMinute: 2 });
    const statuses: number[] = [];
    for (let i = 1; i <= 4; i++) statuses.push((await geocode(app, `10.0.0.${i}`)).statusCode);
    expect(statuses).toEqual([200, 200, 429, 429]);
  });

  it("il limite non si aggira con HEAD né con le maiuscole nel percorso", async () => {
    const app = await makeApp({ geocodeRateLimitPerMinute: 2 });
    // HEAD non ha una rotta propria (avrebbe un contatore separato e raddoppierebbe il limite).
    for (let i = 0; i < 5; i++) {
      expect((await app.inject({ method: "HEAD", url: "/geocode/autocomplete?q=milano" })).statusCode).toBe(404);
    }
    expect((await app.inject({ method: "GET", url: "/geocode/autocomplete?q=milano" })).statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: "/geocode/autocomplete?q=milano" })).statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: "/geocode/autocomplete?q=milano" })).statusCode).toBe(429);
    // Un percorso con le maiuscole è un'altra rotta: non esiste, e non dà accesso al servizio senza limite.
    expect((await app.inject({ method: "GET", url: "/GeoCode/Autocomplete?q=milano" })).statusCode).toBe(404);
    expect((await app.inject({ method: "POST", url: "/SeArCh", payload: {} })).statusCode).toBe(404);
  });

  it("anche /search ha il suo limite (429 oltre il tetto)", async () => {
    const app = await makeApp({ searchRateLimitPerMinute: 2 });
    const body = { origin: { lon: 9, lat: 45 }, destination: { lon: 10, lat: 45 }, fuelType: "benzina" };
    const limited: boolean[] = [];
    for (let i = 0; i < 4; i++) {
      limited.push((await app.inject({ method: "POST", url: "/search", payload: body })).statusCode === 429);
    }
    expect(limited).toEqual([false, false, true, true]);
  });
});

describe("CORS: solo l'origine configurata", () => {
  it("una richiesta da un'origine estranea non riceve il permesso per quell'origine", async () => {
    const app = await makeApp();
    const response = await app.inject({
      method: "GET",
      url: "/geocode/autocomplete?q=milano",
      headers: { origin: "https://sito-malevolo.example" },
    });
    expect(response.headers["access-control-allow-origin"]).toBe("https://tappafurba.example");
  });

  it("il preflight con un'origine estranea non ottiene il permesso per quell'origine", async () => {
    const app = await makeApp();
    const response = await app.inject({
      method: "OPTIONS",
      url: "/search",
      headers: { origin: "https://sito-malevolo.example", "access-control-request-method": "POST" },
    });
    expect(response.headers["access-control-allow-origin"]).not.toBe("https://sito-malevolo.example");
    expect(response.headers["access-control-allow-origin"]).not.toBe("*");
  });
});

describe("nessun segreto nelle risposte né nei log", () => {
  function captured() {
    const lines: string[] = [];
    const stream = new Writable({
      write(chunk, _encoding, callback) {
        lines.push(String(chunk));
        callback();
      },
    });
    return { stream, text: () => lines.join("") };
  }

  const leakyGeocoder = (error: unknown): GeocodingProvider => ({
    autocomplete: async () => {
      throw error;
    },
    reverse: async () => null,
  });

  it("un errore nativo imprevisto con l'URL e il token dentro finisce nei log ripulito e non arriva al client", async () => {
    const log = captured();
    const error = new Error(`fetch failed: GET ${LEAKY_URL}`, { cause: new Error(`ECONNRESET ${LEAKY_URL}`) });
    const app = await makeApp({ logger: true, logStream: log.stream, geocoding: leakyGeocoder(error) });
    const response = await app.inject({ method: "GET", url: "/geocode/autocomplete?q=milano" });
    expect(response.statusCode).toBe(500);
    expect(response.json().error.code).toBe("INTERNAL_ERROR");
    for (const text of [response.body, log.text()]) {
      expect(text).not.toContain("eyJabcdefghijklmnopqrstuvwxyz");
      expect(text).not.toContain("firma-segreta");
    }
    expect(log.text()).toContain("[REDACTED");
    expect(log.text()).toContain("fetch failed"); // il resto dell'errore resta leggibile
  });

  it("un errore di ingestione con il token dentro non lo scrive nei log", async () => {
    const log = captured();
    const app = await makeApp({
      logger: true,
      logStream: log.stream,
      ingestToken: INGEST_TOKEN,
      runIngestion: async () => {
        throw new Error(LEAKY_URL);
      },
    });
    await app.inject({ method: "POST", url: "/ingest", headers: bearer(INGEST_TOKEN) });
    expect(log.text()).not.toContain("firma-segreta");
  });

  it("il segreto di /ingest non viene mai scritto nei log", async () => {
    const log = captured();
    const app = await makeApp({ logger: true, logStream: log.stream, ingestToken: INGEST_TOKEN });
    await app.inject({ method: "POST", url: "/ingest", headers: bearer(INGEST_TOKEN) });
    await app.inject({ method: "POST", url: "/ingest", headers: bearer("sbagliato") });
    expect(log.text()).not.toContain(INGEST_TOKEN);
    expect(log.text()).not.toContain("sbagliato");
  });
});

describe("quota del geocoding: tetto mensile globale (le due rotte e tutti gli IP insieme)", () => {
  it("un solo IP può far partire al massimo 2 × limite-per-rotta chiamate in un minuto, ma il tetto mensile le ferma tutte", async () => {
    let outbound = 0;
    const fixture = new FixtureGeocodingProvider();
    const counting: GeocodingProvider = {
      autocomplete: async (...args) => (outbound++, fixture.autocomplete(...args)),
      reverse: async (...args) => (outbound++, fixture.reverse(...args)),
    };
    const HARD_LIMIT = 6;
    const app = await makeApp({
      geocodeRateLimitPerMinute: 50, // il rate limit per IP da solo lascerebbe passare 100 chiamate
      geocoding: new BudgetedGeocodingProvider(counting, new InMemoryUsageCounter(), HARD_LIMIT),
    });
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) {
      statuses.push((await app.inject({ method: "GET", url: `/geocode/autocomplete?q=milano${i}` })).statusCode);
      statuses.push((await app.inject({ method: "GET", url: "/geocode/reverse?lon=9.19&lat=45.46" })).statusCode);
    }
    expect(outbound).toBe(HARD_LIMIT);
    expect(statuses.filter((status) => status === 503)).toHaveLength(12 - HARD_LIMIT);
    const blocked = await app.inject({ method: "GET", url: "/geocode/autocomplete?q=torino" });
    expect(blocked.statusCode).toBe(503);
    expect(blocked.json().error.code).toBe("BUDGET_EXHAUSTED");
    expect(outbound).toBe(HARD_LIMIT);
  });

  it("il tetto è globale: IP diversi consumano lo stesso contatore", async () => {
    let outbound = 0;
    const counting: GeocodingProvider = {
      autocomplete: async () => (outbound++, []),
      reverse: async () => null,
    };
    const app = await makeApp({
      trustProxy: true, // qui si simulano più client distinti
      geocodeRateLimitPerMinute: 50,
      geocoding: new BudgetedGeocodingProvider(counting, new InMemoryUsageCounter(), 4),
    });
    const statuses: number[] = [];
    for (let i = 1; i <= 8; i++) {
      statuses.push(
        (await app.inject({ method: "GET", url: "/geocode/autocomplete?q=milano", headers: { "x-forwarded-for": `198.51.100.${i}` } })).statusCode,
      );
    }
    expect(statuses).toEqual([200, 200, 200, 200, 503, 503, 503, 503]);
    expect(outbound).toBe(4);
  });
});

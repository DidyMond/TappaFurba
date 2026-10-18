import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearRecentRoutes,
  CURRENT_POSITION_TEXT,
  loadRecentRoutes,
  migrateLegacyRecentRoutes,
  RECENT_ROUTES_KEY,
  RECENT_ROUTES_MAX,
  recordRecentRoute,
  resetRecentRoutesMemory,
  routeId,
  sanitizeRecentRoutes,
} from "./recentRoutes";

beforeEach(() => {
  localStorage.clear();
  resetRecentRoutesMemory();
});
afterEach(() => vi.restoreAllMocks());

const entry = (from: string, to: string, fuelType: "benzina" | "diesel" = "benzina") => ({ origin: { text: from }, destination: { text: to }, fuelType });

describe("storico dei tragitti (Tragitti frequenti)", () => {
  it("senza nulla di salvato l'elenco è vuoto", () => {
    expect(loadRecentRoutes()).toEqual([]);
  });

  it("una ricerca riuscita aggiunge il tragitto con conteggio 1; la stessa ricerca lo incrementa", () => {
    recordRecentRoute(entry("Milano", "Bologna"), 1000);
    expect(loadRecentRoutes()).toHaveLength(1);
    expect(loadRecentRoutes()[0]).toMatchObject({ count: 1, lastAt: 1000, fuelType: "benzina" });
    recordRecentRoute(entry("Milano", "Bologna"), 2000);
    expect(loadRecentRoutes()).toHaveLength(1);
    expect(loadRecentRoutes()[0]).toMatchObject({ count: 2, lastAt: 2000 });
  });

  it("il tragitto si riconosce senza badare a maiuscole, accenti e spazi; il carburante resta quello dell'ultima ricerca", () => {
    expect(routeId("Forlì  Centro", "Città")).toBe(routeId("forli centro", "citta"));
    recordRecentRoute(entry("Forlì", "Roma", "benzina"), 1);
    recordRecentRoute(entry("FORLI", "ROMA", "diesel"), 2);
    expect(loadRecentRoutes()).toHaveLength(1);
    expect(loadRecentRoutes()[0]).toMatchObject({ count: 2, fuelType: "diesel" });
  });

  it("ordina per frequenza e, a pari frequenza, per recenza", () => {
    recordRecentRoute(entry("A", "B"), 1);
    recordRecentRoute(entry("C", "D"), 2);
    recordRecentRoute(entry("E", "F"), 3);
    recordRecentRoute(entry("A", "B"), 4); // A→B sale a 2
    expect(loadRecentRoutes().map((r) => r.origin.text)).toEqual(["A", "E", "C"]);
  });

  it(`conserva al più ${RECENT_ROUTES_MAX} tragitti: in coda esce il meno cercato (a pari conteggio il più vecchio), mai quello appena fatto`, () => {
    for (let i = 0; i < RECENT_ROUTES_MAX + 3; i++) recordRecentRoute(entry(`Da${i}`, `A${i}`), i + 1);
    const routes = loadRecentRoutes();
    expect(routes).toHaveLength(RECENT_ROUTES_MAX);
    expect(routes.some((r) => r.origin.text === `Da${RECENT_ROUTES_MAX + 2}`)).toBe(true); // l'ultimo c'è
    expect(routes.some((r) => r.origin.text === "Da0")).toBe(false); // il più vecchio a conteggio 1 è uscito
  });

  it("scarta in lettura le voci non valide, una per una, senza perdere le altre", () => {
    const good = { origin: { text: "Milano" }, destination: { text: "Bologna" }, fuelType: "diesel", count: 3, lastAt: 7 };
    const clean = sanitizeRecentRoutes([
      good,
      null,
      "testo",
      { ...good, origin: { text: "" } },
      { ...good, origin: { text: "x".repeat(161) } },
      { ...good, destination: { nome: "Y" } },
      { ...good, destination: undefined },
    ]);
    expect(clean).toHaveLength(1);
    expect(clean[0]).toMatchObject({ fuelType: "diesel", count: 3, lastAt: 7 });
  });

  it("campi numerici o carburante fuori dominio tornano a valori sicuri (conteggio 1, benzina)", () => {
    const [route] = sanitizeRecentRoutes([{ origin: { text: "A" }, destination: { text: "B" }, fuelType: "elettrico", count: -4, lastAt: "ieri" }]);
    expect(route).toMatchObject({ fuelType: "benzina", count: 1, lastAt: 0 });
  });

  it("JSON corrotto, versione sconosciuta o forma sbagliata: elenco vuoto, nessun errore", () => {
    for (const raw of ["{rotto", JSON.stringify({ version: 99, routes: [] }), JSON.stringify([1, 2]), JSON.stringify({ version: 2, routes: "no" })]) {
      localStorage.setItem(RECENT_ROUTES_KEY, raw);
      expect(loadRecentRoutes(), raw).toEqual([]);
    }
  });

  it("ignora una registrazione con un testo non valido", () => {
    recordRecentRoute({ origin: { text: "" }, destination: { text: "B" }, fuelType: "benzina" });
    expect(loadRecentRoutes()).toEqual([]);
  });

  it("clearRecentRoutes cancella tutto, anche dallo storage", () => {
    recordRecentRoute(entry("A", "B"));
    clearRecentRoutes();
    expect(loadRecentRoutes()).toEqual([]);
    expect(localStorage.getItem(RECENT_ROUTES_KEY)).toBeNull();
  });

  it("con lo storage bloccato si usa una copia in memoria (nessuna eccezione)", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    expect(() => recordRecentRoute(entry("A", "B"))).not.toThrow();
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(loadRecentRoutes()).toHaveLength(1);
  });

  it("l'elenco restituito è stabile finché i dati non cambiano (serve a useSyncExternalStore)", () => {
    recordRecentRoute(entry("A", "B"));
    expect(loadRecentRoutes()).toBe(loadRecentRoutes());
  });
});

describe("storico — nessuna coordinata, nessun mapbox_id (termini d'uso Mapbox §2.7.2)", () => {
  it("SNAPSHOT del payload persistito: versione 2, solo testi, carburante, conteggio e data", () => {
    recordRecentRoute({ origin: { text: "Via Roma 1, 20100 Milano, Italia" }, destination: { text: "Piazza Maggiore, 40100 Bologna, Italia" }, fuelType: "diesel" }, 1_700_000_000_000);
    expect(JSON.parse(localStorage.getItem(RECENT_ROUTES_KEY)!)).toEqual({
      version: 2,
      routes: [
        {
          origin: { text: "Via Roma 1, 20100 Milano, Italia" },
          destination: { text: "Piazza Maggiore, 40100 Bologna, Italia" },
          fuelType: "diesel",
          count: 1,
          lastAt: 1_700_000_000_000,
        },
      ],
    });
  });

  it("un estremo preso dal GPS si salva come flag «posizione attuale» con il testo fisso: mai l'indirizzo ricavato dalla posizione", () => {
    recordRecentRoute({ origin: { text: "Via Segreta 7, 20100 Milano, Italia", current: true }, destination: { text: "Bologna" }, fuelType: "benzina" }, 5);
    const raw = localStorage.getItem(RECENT_ROUTES_KEY)!;
    expect(JSON.parse(raw).routes[0].origin).toEqual({ text: CURRENT_POSITION_TEXT, current: true });
    expect(raw).not.toContain("Segreta");
  });

  it("anche se la registrazione arriva con campi in più (lon, lat, mapbox_id, id…) il payload salvato non li contiene", () => {
    const dirty = {
      origin: { text: "Milano", lon: 9.19, lat: 45.46, mapbox_id: "dXJuOm1ieHBsYzpBYkU", id: "x", coordinates: [9.19, 45.46] },
      destination: { text: "Bologna", longitude: 11.34, latitude: 44.49, mapbox_id: "abc" },
      fuelType: "benzina" as const,
      lon: 1,
      lat: 2,
    };
    recordRecentRoute(dirty as unknown as Parameters<typeof recordRecentRoute>[0], 9);
    const raw = localStorage.getItem(RECENT_ROUTES_KEY)!;
    expect(raw).not.toMatch(/lon|lat|mapbox|coord|9\.19|45\.46|11\.34|44\.49/i);
    const stored = JSON.parse(raw).routes[0];
    expect(Object.keys(stored).sort()).toEqual(["count", "destination", "fuelType", "lastAt", "origin"]);
    expect(Object.keys(stored.origin)).toEqual(["text"]);
    expect(Object.keys(stored.destination)).toEqual(["text"]);
  });

  it("migrazione dalla versione 1: i testi restano, lo storage viene RISCRITTO senza coordinate", () => {
    localStorage.setItem(
      RECENT_ROUTES_KEY,
      JSON.stringify({
        version: 1,
        routes: [{ id: "x", origin: { label: "Via A, Milano", lon: 9.1, lat: 45.4 }, destination: { label: "Via B, Bologna", lon: 11.3, lat: 44.5 }, fuelType: "diesel", count: 4, lastAt: 77 }],
      }),
    );
    migrateLegacyRecentRoutes();
    const raw = localStorage.getItem(RECENT_ROUTES_KEY)!;
    expect(raw).not.toMatch(/lon|lat|label|9\.1|45\.4|11\.3|44\.5/);
    expect(JSON.parse(raw)).toEqual({ version: 2, routes: [{ origin: { text: "Via A, Milano" }, destination: { text: "Via B, Bologna" }, fuelType: "diesel", count: 4, lastAt: 77 }] });
    expect(loadRecentRoutes()[0]).toMatchObject({ origin: { text: "Via A, Milano" }, count: 4 });
  });

  it("la versione 1 si legge solo come testi anche prima della migrazione (le coordinate non emergono mai)", () => {
    localStorage.setItem(RECENT_ROUTES_KEY, JSON.stringify({ version: 1, routes: [{ origin: { label: "A", lon: 9, lat: 45 }, destination: { label: "B", lon: 10, lat: 44 }, fuelType: "gpl", count: 1, lastAt: 1 }] }));
    const [route] = loadRecentRoutes();
    expect(route!.origin).toEqual({ text: "A" });
    expect(JSON.stringify(route)).not.toMatch(/lon|lat/);
  });

  it("l'id distingue un estremo GPS da un testo uguale", () => {
    expect(routeId({ text: CURRENT_POSITION_TEXT, current: true }, { text: "Bologna" })).not.toBe(routeId({ text: CURRENT_POSITION_TEXT }, { text: "Bologna" }));
  });
});

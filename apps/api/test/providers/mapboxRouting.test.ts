import { describe, expect, it, vi } from "vitest";
import { ProviderError } from "../../src/errors";
import { MapboxRoutingProvider } from "../../src/providers/routing/MapboxRoutingProvider";

const TOKEN = "pk.test-token-should-never-leak";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

const okBody = {
  code: "Ok",
  routes: [
    {
      distance: 216600,
      duration: 9174,
      geometry: {
        type: "LineString",
        coordinates: [
          [9.204, 45.4864],
          [10.0, 45.0],
          [11.3426, 44.5058],
        ],
      },
    },
  ],
  waypoints: [],
};

const A = { lon: 9.204, lat: 45.4864 };
const S = { lon: 9.5, lat: 45.31 };
const B = { lon: 11.3426, lat: 44.5058 };

describe("MapboxRoutingProvider", () => {
  it("usa il profilo mapbox/driving con geometria GeoJSON completa, senza alternative né step", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(okBody));
    await new MapboxRoutingProvider({ token: TOKEN, fetchImpl }).getRoute([A, B]);

    const url = new URL(fetchImpl.mock.calls[0]![0] as string);
    expect(url.origin).toBe("https://api.mapbox.com");
    expect(url.pathname).toBe("/directions/v5/mapbox/driving/9.204,45.4864;11.3426,44.5058");
    expect(url.searchParams.get("geometries")).toBe("geojson");
    expect(url.searchParams.get("overview")).toBe("full");
    expect(url.searchParams.get("alternatives")).toBe("false");
    expect(url.searchParams.get("steps")).toBe("false");
    expect(url.searchParams.get("access_token")).toBe(TOKEN);
  });

  it("passa i waypoint nell'ordine dato (A → stazione → B), in formato lon,lat", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(okBody));
    await new MapboxRoutingProvider({ token: TOKEN, fetchImpl }).getRoute([A, S, B]);
    expect(new URL(fetchImpl.mock.calls[0]![0] as string).pathname).toContain("/9.204,45.4864;9.5,45.31;11.3426,44.5058");
  });

  it("converte metri → km e secondi → minuti", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(okBody));
    const route = await new MapboxRoutingProvider({ token: TOKEN, fetchImpl }).getRoute([A, B]);

    expect(route?.distanceKm).toBeCloseTo(216.6, 5);
    expect(route?.durationMinutes).toBeCloseTo(152.9, 5);
    expect(route?.geometry).toHaveLength(3);
    expect(route?.geometry[0]).toEqual([9.204, 45.4864]);
  });

  it("supporta un profilo alternativo", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(okBody));
    await new MapboxRoutingProvider({ token: TOKEN, profile: "mapbox/driving-traffic", fetchImpl }).getRoute([A, B]);
    expect(new URL(fetchImpl.mock.calls[0]![0] as string).pathname).toContain("/mapbox/driving-traffic/");
  });

  it.each(["NoRoute", "NoSegment"])("codice %s (HTTP 200 o 422) → null, non un errore", async (code) => {
    for (const status of [200, 422]) {
      const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ code, routes: [] }, status));
      expect(await new MapboxRoutingProvider({ token: TOKEN, fetchImpl }).getRoute([A, B])).toBeNull();
    }
  });

  it("Ok senza rotte → null", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ code: "Ok", routes: [] }));
    expect(await new MapboxRoutingProvider({ token: TOKEN, fetchImpl }).getRoute([A, B])).toBeNull();
  });

  it.each([
    [401, /non è disponibile al momento/],
    [403, /non è disponibile al momento/],
    [429, /troppe richieste/],
    [500, /non è disponibile al momento/],
  ])("HTTP %i → ProviderError leggibile", async (status, message) => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ message: "x" }, status));
    const promise = new MapboxRoutingProvider({ token: TOKEN, fetchImpl }).getRoute([A, B]);
    await expect(promise).rejects.toBeInstanceOf(ProviderError);
    await expect(promise).rejects.toThrow(message);
  });

  it("un input non valido (es. InvalidInput) è un ProviderError, non 'nessun percorso'", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ code: "InvalidInput", message: "bad" }, 422));
    await expect(new MapboxRoutingProvider({ token: TOKEN, fetchImpl }).getRoute([A, B])).rejects.toBeInstanceOf(ProviderError);
  });

  it("il messaggio per l'utente è in italiano semplice, senza HTTP né «routing»: il dettaglio tecnico sta solo in `detail` (per i log)", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ message: "x" }, 503));
    const error = await new MapboxRoutingProvider({ token: TOKEN, fetchImpl }).getRoute([A, B]).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ProviderError);
    expect((error as ProviderError).message).not.toMatch(/HTTP|routing|credenziali/i);
    expect((error as ProviderError).detail).toBe("routing: HTTP 503");
  });

  it("un errore di rete non fa mai trapelare token o URL nel messaggio", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error(`boom ${TOKEN}`));
    const promise = new MapboxRoutingProvider({ token: TOKEN, fetchImpl }).getRoute([A, B]);
    await expect(promise).rejects.toBeInstanceOf(ProviderError);
    await expect(promise).rejects.not.toThrow(TOKEN);
  });

  it("richiede da 2 a 25 waypoint", async () => {
    const provider = new MapboxRoutingProvider({ token: TOKEN, fetchImpl: vi.fn() });
    await expect(provider.getRoute([A])).rejects.toThrow(RangeError);
    await expect(provider.getRoute(Array.from({ length: 26 }, () => A))).rejects.toThrow(RangeError);
  });
});

describe("MapboxRoutingProvider — esclusioni combinate (motorway, toll, ferry)", () => {
  const exclude = async (options: Parameters<MapboxRoutingProvider["getRoute"]>[1]) => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(okBody));
    await new MapboxRoutingProvider({ token: TOKEN, fetchImpl }).getRoute([A, B], options);
    return new URL(fetchImpl.mock.calls[0]![0] as string).searchParams.get("exclude");
  };

  it("pedaggi → exclude=toll; traghetti → exclude=ferry", async () => {
    expect(await exclude({ avoidTolls: true })).toBe("toll");
    expect(await exclude({ avoidFerries: true })).toBe("ferry");
  });

  it("più esclusioni sono separate da virgola, sempre nello stesso ordine (motorway, toll, ferry)", async () => {
    expect(await exclude({ avoidMotorway: true, avoidTolls: true })).toBe("motorway,toll");
    expect(await exclude({ avoidFerries: true, avoidTolls: true })).toBe("toll,ferry");
    expect(await exclude({ avoidFerries: true, avoidTolls: true, avoidMotorway: true })).toBe("motorway,toll,ferry");
  });

  it("tutto a false: nessun exclude", async () => {
    expect(await exclude({ avoidMotorway: false, avoidTolls: false, avoidFerries: false })).toBeNull();
  });
});

describe("MapboxRoutingProvider — «Evita autostrada»", () => {
  it("con avoidMotorway aggiunge exclude=motorway", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(okBody));
    await new MapboxRoutingProvider({ token: TOKEN, fetchImpl }).getRoute([A, S, B], { avoidMotorway: true });
    const url = new URL(fetchImpl.mock.calls[0]![0] as string);
    expect(url.searchParams.get("exclude")).toBe("motorway");
    expect(url.searchParams.get("geometries")).toBe("geojson");
  });

  it("senza avoidMotorway (o a false) non c'è alcun exclude", async () => {
    const fetchImpl = vi.fn().mockImplementation(async () => jsonResponse(okBody));
    const provider = new MapboxRoutingProvider({ token: TOKEN, fetchImpl });
    await provider.getRoute([A, B]);
    await provider.getRoute([A, B], { avoidMotorway: false });
    for (const call of fetchImpl.mock.calls) expect(new URL(call[0] as string).searchParams.has("exclude")).toBe(false);
  });
});

import { describe, expect, it, vi } from "vitest";
import { ProviderError, RateLimitedProviderError } from "../../src/errors";
import { OspzLivePriceProvider, parseRetryAfterMs } from "../../src/providers/live-prices/OspzLivePriceProvider";

const BASE = "https://carburanti.example/ospzApi";
const UA = "TappaFurba-test/0.0";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

// Forma reale della risposta di POST /search/zone (stazione 62820, 28/09/2026).
const realistic = {
  success: true,
  center: { lat: 45.69, lng: 9.05 },
  results: [
    {
      id: 62820,
      name: "1858 BREGNANO",
      fuels: [
        { id: 1, price: 2.2, name: "Benzina", fuelId: 1, isSelf: false },
        { id: 2, price: 1.99, name: "Benzina", fuelId: 1, isSelf: true },
      ],
      location: { lat: 45.685986, lng: 9.054773 },
      insertDate: "2026-09-28T11:11:43+02:00",
      address: null,
      brand: "AgipEni",
      distance: "0.017",
    },
  ],
};

describe("OspzLivePriceProvider", () => {
  it("invia lat/lng, raggio (troncato a 10 km) e User-Agent che identifica l'app", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json(realistic));
    await new OspzLivePriceProvider({ baseUrl: BASE, userAgent: UA, fetchImpl }).fetchZone({ lon: 9.055, lat: 45.686 }, 25);

    const [url, init] = fetchImpl.mock.calls[0]! as [string, RequestInit];
    expect(url).toBe(`${BASE}/search/zone`);
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["User-Agent"]).toBe(UA);
    expect(JSON.parse(init.body as string)).toEqual({ points: [{ lat: 45.686, lng: 9.055 }], radius: 10, priceOrder: "asc" });
  });

  it("converte la risposta nel formato interno (id stazione, data ISO, carburanti)", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json(realistic));
    const stations = await new OspzLivePriceProvider({ baseUrl: BASE, userAgent: UA, fetchImpl }).fetchZone({ lon: 9, lat: 45 }, 10);

    expect(stations).toEqual([
      {
        stationId: 62820,
        communicatedAt: "2026-09-28T11:11:43+02:00",
        fuels: [
          { name: "Benzina", price: 2.2, isSelf: false },
          { name: "Benzina", price: 1.99, isSelf: true },
        ],
      },
    ]);
  });

  it("scarta le singole stazioni malformate senza far fallire la chiamata", async () => {
    const body = { success: true, results: [realistic.results[0], { id: "x" }, null, { id: 5, insertDate: "2026-09-28T10:00:00+02:00" }] };
    const stations = await new OspzLivePriceProvider({ baseUrl: BASE, userAgent: UA, fetchImpl: async () => json(body) }).fetchZone(
      { lon: 9, lat: 45 },
      10,
    );
    expect(stations.map((s) => s.stationId)).toEqual([62820]);
  });

  it("HTTP non-2xx → ProviderError", async () => {
    const provider = new OspzLivePriceProvider({ baseUrl: BASE, userAgent: UA, fetchImpl: async () => new Response("", { status: 503 }) });
    await expect(provider.fetchZone({ lon: 9, lat: 45 }, 10)).rejects.toBeInstanceOf(ProviderError);
  });

  it("risposta HTML (redirect, manutenzione, sito rifatto) → ProviderError, non un crash", async () => {
    const provider = new OspzLivePriceProvider({
      baseUrl: BASE,
      userAgent: UA,
      fetchImpl: async () => new Response("<html>Manutenzione</html>", { status: 200, headers: { "content-type": "text/html" } }),
    });
    await expect(provider.fetchZone({ lon: 9, lat: 45 }, 10)).rejects.toBeInstanceOf(ProviderError);
  });

  it("formato inatteso (manca results) → ProviderError", async () => {
    const provider = new OspzLivePriceProvider({ baseUrl: BASE, userAgent: UA, fetchImpl: async () => json({ success: true }) });
    await expect(provider.fetchZone({ lon: 9, lat: 45 }, 10)).rejects.toBeInstanceOf(ProviderError);
  });

  it("errore di rete o timeout → ProviderError con messaggio che non espone dettagli interni", async () => {
    const provider = new OspzLivePriceProvider({
      baseUrl: BASE,
      userAgent: UA,
      fetchImpl: async () => {
        throw new TypeError("fetch failed: ECONNRESET 10.0.0.1");
      },
    });
    const error = await provider.fetchZone({ lon: 9, lat: 45 }, 10).catch((e) => e);
    expect(error).toBeInstanceOf(ProviderError);
    expect(String(error.message)).not.toContain("10.0.0.1");
  });

  it("HTTP 429 → RateLimitedProviderError con l'attesa indicata da Retry-After", async () => {
    const provider = new OspzLivePriceProvider({
      baseUrl: BASE,
      userAgent: UA,
      fetchImpl: async () => new Response("", { status: 429, headers: { "retry-after": "90" } }),
    });
    const error = await provider.fetchZone({ lon: 9, lat: 45 }, 10).catch((e) => e);
    expect(error).toBeInstanceOf(RateLimitedProviderError);
    expect(error.retryAfterMs).toBe(90_000);
  });

  it("HTTP 429 senza Retry-After → attesa non indicata", async () => {
    const provider = new OspzLivePriceProvider({ baseUrl: BASE, userAgent: UA, fetchImpl: async () => new Response("", { status: 429 }) });
    const error = await provider.fetchZone({ lon: 9, lat: 45 }, 10).catch((e) => e);
    expect(error).toBeInstanceOf(RateLimitedProviderError);
    expect(error.retryAfterMs).toBeUndefined();
  });
});

describe("parseRetryAfterMs", () => {
  it("accetta secondi e date HTTP, ignora valori assenti, negativi o assurdi", () => {
    expect(parseRetryAfterMs("30")).toBe(30_000);
    expect(parseRetryAfterMs("Wed, 21 Oct 2026 07:28:30 GMT", Date.parse("2026-10-21T07:28:00Z"))).toBe(30_000);
    expect(parseRetryAfterMs(null)).toBeUndefined();
    expect(parseRetryAfterMs("-5")).toBeUndefined();
    expect(parseRetryAfterMs("abc")).toBeUndefined();
    expect(parseRetryAfterMs("999999")).toBeUndefined();
  });
});

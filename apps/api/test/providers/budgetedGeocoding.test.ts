import { describe, expect, it } from "vitest";
import { BudgetExhaustedError, ProviderError } from "../../src/errors";
import { BudgetedGeocodingProvider, GEOCODING_USAGE_SERVICE } from "../../src/providers/geocoding/BudgetedGeocodingProvider";
import type { GeocodingProvider } from "../../src/providers/geocoding/GeocodingProvider";
import { InMemoryUsageCounter } from "../../src/usage/UsageCounter";

function innerProvider() {
  const calls = { autocomplete: 0, reverse: 0 };
  const provider: GeocodingProvider = {
    autocomplete: async () => (calls.autocomplete++, []),
    reverse: async () => (calls.reverse++, "Via Roma, Milano"),
  };
  return { provider, calls };
}

describe("BudgetedGeocodingProvider", () => {
  it("conta ogni chiamata reale, autocomplete e reverse insieme, nello stesso contatore mensile", async () => {
    const { provider } = innerProvider();
    const counter = new InMemoryUsageCounter();
    const budgeted = new BudgetedGeocodingProvider(provider, counter, 100, () => new Date("2026-10-16T10:00:00Z"));
    await budgeted.autocomplete("milano");
    await budgeted.autocomplete("roma");
    await budgeted.reverse({ lon: 9.19, lat: 45.46 });
    expect(await counter.get(GEOCODING_USAGE_SERVICE, "2026-10")).toBe(3);
  });

  it("oltre il limite non chiama più il provider e risponde con BudgetExhaustedError (503)", async () => {
    const { provider, calls } = innerProvider();
    const counter = new InMemoryUsageCounter();
    const budgeted = new BudgetedGeocodingProvider(provider, counter, 3, () => new Date("2026-10-16T10:00:00Z"));
    await budgeted.autocomplete("milano");
    await budgeted.reverse({ lon: 9, lat: 45 });
    await budgeted.autocomplete("roma");
    await expect(budgeted.autocomplete("torino")).rejects.toBeInstanceOf(BudgetExhaustedError);
    await expect(budgeted.reverse({ lon: 9, lat: 45 })).rejects.toMatchObject({ httpStatus: 503, code: "BUDGET_EXHAUSTED" });
    expect(calls).toEqual({ autocomplete: 2, reverse: 1 });
  });

  it("le richieste respinte non si contano (il contatore resta al limite)", async () => {
    const { provider } = innerProvider();
    const counter = new InMemoryUsageCounter();
    const budgeted = new BudgetedGeocodingProvider(provider, counter, 2, () => new Date("2026-10-16T10:00:00Z"));
    await budgeted.autocomplete("a1");
    await budgeted.autocomplete("a2");
    for (let i = 0; i < 5; i++) await expect(budgeted.autocomplete("a3")).rejects.toBeInstanceOf(BudgetExhaustedError);
    expect(await counter.get(GEOCODING_USAGE_SERVICE, "2026-10")).toBe(2);
  });

  it("il messaggio per l'utente parla degli indirizzi, non dei percorsi, e non cita Mapbox né soglie", async () => {
    const { provider } = innerProvider();
    const budgeted = new BudgetedGeocodingProvider(provider, new InMemoryUsageCounter(), 1, () => new Date("2026-10-16T10:00:00Z"));
    await budgeted.autocomplete("milano");
    const error = (await budgeted.autocomplete("roma").catch((e: unknown) => e)) as BudgetExhaustedError;
    expect(error.message).toMatch(/indirizzi/);
    expect(error.message).not.toMatch(/percorsi|Mapbox|\d{3}/);
  });

  it("a un nuovo mese il contatore riparte da zero", async () => {
    const { provider } = innerProvider();
    const counter = new InMemoryUsageCounter();
    let now = new Date("2026-10-31T23:59:00Z");
    const budgeted = new BudgetedGeocodingProvider(provider, counter, 1, () => now);
    await budgeted.autocomplete("milano");
    await expect(budgeted.autocomplete("roma")).rejects.toBeInstanceOf(BudgetExhaustedError);
    now = new Date("2026-11-01T00:01:00Z");
    await expect(budgeted.autocomplete("roma")).resolves.toEqual([]);
    expect(await counter.get(GEOCODING_USAGE_SERVICE, "2026-11")).toBe(1);
  });

  it("una chiamata che fallisce a monte si conta comunque (Mapbox può fatturarla) e l'errore del provider passa invariato", async () => {
    const counter = new InMemoryUsageCounter();
    const failing: GeocodingProvider = {
      autocomplete: async () => {
        throw new ProviderError("non raggiungibile");
      },
      reverse: async () => null,
    };
    const budgeted = new BudgetedGeocodingProvider(failing, counter, 5, () => new Date("2026-10-16T10:00:00Z"));
    await expect(budgeted.autocomplete("milano")).rejects.toBeInstanceOf(ProviderError);
    expect(await counter.get(GEOCODING_USAGE_SERVICE, "2026-10")).toBe(1);
  });

  it("rifiuta un limite non valido", () => {
    const { provider } = innerProvider();
    for (const bad of [0, -1, 1.5, Number.NaN]) {
      expect(() => new BudgetedGeocodingProvider(provider, new InMemoryUsageCounter(), bad)).toThrow(RangeError);
    }
  });
});

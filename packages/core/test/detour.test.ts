import { describe, expect, it } from "vitest";
import {
  computeRoutedDetour,
  DETOUR_MINUTES_TOLERANCE,
  estimateProxyDetour,
  MIN_DETOUR_SPEED_KMH,
  NEARBY_PROXY_SPEED_KMH,
  PROXY_CIRCUITY_FACTOR,
  PROXY_DETOUR_SPEED_KMH,
} from "../src/geo/detour";

describe("estimateProxyDetour", () => {
  it("una stazione esattamente sul tracciato ha deviazione zero", () => {
    expect(estimateProxyDetour(0)).toEqual({ km: 0, minutes: 0 });
  });

  it("è andata e ritorno (2×) corretta per la tortuosità stradale", () => {
    const { km } = estimateProxyDetour(2);
    expect(km).toBeCloseTo(2 * 2 * PROXY_CIRCUITY_FACTOR, 10); // 5 km
  });

  it("i minuti derivano dai km alla velocità media di deviazione", () => {
    const { km, minutes } = estimateProxyDetour(2);
    expect(minutes).toBeCloseTo((km / PROXY_DETOUR_SPEED_KMH) * 60, 10); // 7.5 min
    expect(minutes).toBeCloseTo(7.5, 10);
  });

  it("con una velocità diversa cambiano solo i minuti, non i km", () => {
    const base = estimateProxyDetour(2);
    const slow = estimateProxyDetour(2, { speedKmh: 20 });
    expect(slow.km).toBe(base.km);
    expect(slow.minutes).toBeCloseTo((base.km / 20) * 60, 10); // 15 min
    expect(estimateProxyDetour(2, {})).toEqual(base);
    expect(estimateProxyDetour(2, { speedKmh: PROXY_DETOUR_SPEED_KMH })).toEqual(base);
  });

  it("«Intorno a me»: i minuti usano la velocità media dei giri brevi (22 km/h), più bassa di quella del corridoio (40 km/h)", () => {
    expect(NEARBY_PROXY_SPEED_KMH).toBe(22);
    expect(NEARBY_PROXY_SPEED_KMH).toBeLessThan(PROXY_DETOUR_SPEED_KMH);
    const nearby = estimateProxyDetour(2, { speedKmh: NEARBY_PROXY_SPEED_KMH });
    expect(nearby.km).toBeCloseTo(5, 10); // i km sono quelli di sempre: 2 × 2 × 1,25
    expect(nearby.minutes).toBeCloseTo((5 / 22) * 60, 10); // ~13,6 min invece di 7,5
    expect(nearby.minutes).toBeGreaterThan(estimateProxyDetour(2).minutes * 1.7);
  });

  it("rifiuta una velocità nulla, negativa o non finita", () => {
    for (const speedKmh of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => estimateProxyDetour(2, { speedKmh })).toThrow(RangeError);
    }
  });

  it("è monotona crescente nella distanza laterale", () => {
    expect(estimateProxyDetour(3).km).toBeGreaterThan(estimateProxyDetour(1).km);
    expect(estimateProxyDetour(3).minutes).toBeGreaterThan(estimateProxyDetour(1).minutes);
  });

  it("rifiuta distanze negative o non finite", () => {
    expect(() => estimateProxyDetour(-0.1)).toThrow(RangeError);
    expect(() => estimateProxyDetour(Number.NaN)).toThrow(RangeError);
    expect(() => estimateProxyDetour(Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });
});

describe("computeRoutedDetour", () => {
  const direct = { distanceKm: 216.6, durationMinutes: 152.9 };

  it("è la differenza tra A→stazione→B e A→B (esempio reale Milano→Bologna via Lodi)", () => {
    const via = { distanceKm: 231.3, durationMinutes: 174.0 };
    const detour = computeRoutedDetour(direct, via);
    expect(detour.km).toBeCloseTo(14.7, 5);
    expect(detour.minutes).toBeCloseTo(21.1, 5);
  });

  it("non scende mai sotto zero (differenze di snapping tra le due richieste)", () => {
    const via = { distanceKm: 216.4, durationMinutes: 152.5 };
    expect(computeRoutedDetour(direct, via)).toEqual({ km: 0, minutes: 0 });
  });

  it("gestisce separatamente km e minuti", () => {
    const via = { distanceKm: 218.0, durationMinutes: 152.0 }; // più km, ma meno minuti
    const detour = computeRoutedDetour(direct, via);
    expect(detour.km).toBeCloseTo(1.4, 5);
    expect(detour.minutes).toBe(0);
  });
});

describe("computeRoutedDetour — coerenza km / minuti / distanza laterale (regressioni)", () => {
  // Caso reale (tragitto di prova, stazione 1858 Bregnano a 0,8 km dal tracciato): il diretto è il percorso
  // più veloce (15,5 km), A→S→B passa per strade locali più corte (12,9 km) ma più lente (+2,9 min).
  const direct = { distanceKm: 15.487, durationMinutes: 17.64 };
  const viaShorterSlower = { distanceKm: 12.941, durationMinutes: 20.57 };

  it("(a) una stazione con distanza laterale > 0 non può avere deviazione di 0,0 km, nemmeno se A→S→B è più corto del diretto", () => {
    const detour = computeRoutedDetour(direct, viaShorterSlower, 0.8);
    expect(detour.km).toBeGreaterThan(0);
    expect(detour.km).toBeCloseTo(1.6, 10); // minimo fisico: 2 × 0,8 km
    expect(detour.minutes).toBeCloseTo(2.93, 2); // i minuti reali restano
  });

  it("(a) vale per qualunque distanza laterale positiva e per qualunque esito del routing", () => {
    const vias = [
      { distanceKm: 1, durationMinutes: 1 },
      { distanceKm: 15.487, durationMinutes: 17.64 }, // identico al diretto
      viaShorterSlower,
      { distanceKm: 40, durationMinutes: 60 },
    ];
    for (const lateral of [0.001, 0.05, 0.3, 0.8, 2.5, 7]) {
      for (const via of vias) {
        const { km } = computeRoutedDetour(direct, via, lateral);
        expect(km).toBeGreaterThanOrEqual(2 * lateral - 1e-12);
        expect(km).toBeGreaterThan(0);
      }
    }
  });

  it("(a) anche la stima proxy di una stazione fuori dal tracciato è sempre > 0", () => {
    for (const lateral of [0.001, 0.05, 0.8]) expect(estimateProxyDetour(lateral).km).toBeGreaterThan(0);
  });

  it("(b) deviazione ≈ 0 km ⇒ ≈ 0 minuti (tolleranza 1 min), qualunque sia il dato del routing", () => {
    const slowVia = { distanceKm: direct.distanceKm, durationMinutes: direct.durationMinutes + 12 };
    const detour = computeRoutedDetour(direct, slowVia, 0);
    expect(detour.km).toBeCloseTo(0, 10);
    expect(detour.minutes).toBeLessThanOrEqual(1);
  });

  it("(b) proprietà: per ogni combinazione di km e minuti grezzi, km ≈ 0 implica minuti entro la tolleranza", () => {
    for (const rawKm of [-5, -2.5, -0.3, 0, 0.02, 0.4, 3]) {
      for (const rawMin of [-4, 0, 0.5, 2.9, 9, 30]) {
        for (const lateral of [0, 0.001, 0.02, 0.5]) {
          const via = { distanceKm: direct.distanceKm + rawKm, durationMinutes: direct.durationMinutes + rawMin };
          const detour = computeRoutedDetour(direct, via, lateral);
          expect(detour.km).toBeGreaterThanOrEqual(0);
          expect(detour.minutes).toBeGreaterThanOrEqual(0);
          if (detour.km < 0.05) expect(detour.minutes).toBeLessThanOrEqual(1);
          // i minuti non superano mai i km extra percorsi alla velocità minima (minimo: la tolleranza)
          expect(detour.minutes).toBeLessThanOrEqual(Math.max(DETOUR_MINUTES_TOLERANCE, (detour.km / MIN_DETOUR_SPEED_KMH) * 60) + 1e-9);
        }
      }
    }
  });

  it("un confronto già coerente non viene alterato (deviazione reale maggiore del minimo geometrico)", () => {
    const via = { distanceKm: direct.distanceKm + 3.2, durationMinutes: direct.durationMinutes + 5.1 };
    const detour = computeRoutedDetour(direct, via, 0.8);
    expect(detour.km).toBeCloseTo(3.2, 10);
    expect(detour.minutes).toBeCloseTo(5.1, 10);
  });

  it("rifiuta distanze laterali negative o non finite", () => {
    expect(() => computeRoutedDetour(direct, viaShorterSlower, -1)).toThrow(RangeError);
    expect(() => computeRoutedDetour(direct, viaShorterSlower, Number.NaN)).toThrow(RangeError);
  });
});

import { describe, expect, it } from "vitest";
import {
  computeReferencePrice,
  median,
  N_MIN,
  ON_ROUTE_THRESHOLD_KM,
  type NationalPrice,
  type PriceSample,
} from "../src/pricing/referencePrice";

const sample = (lateralDistanceKm: number, price: number): PriceSample => ({ lateralDistanceKm, price });
const national: NationalPrice = { median: 1.81, sampleSize: 30000 };

describe("costanti della cascata", () => {
  it("N_MIN = 3 e soglia on-route = 0.5 km (decisioni prodotto confermate)", () => {
    expect(N_MIN).toBe(3);
    expect(ON_ROUTE_THRESHOLD_KM).toBe(0.5);
  });
});

describe("median", () => {
  it("con numero dispari di valori restituisce quello centrale", () => {
    expect(median([1.79, 1.75, 1.77])).toBe(1.77);
  });

  it("con numero pari di valori restituisce la media dei due centrali", () => {
    expect(median([1.7, 1.8, 1.9, 2.0])).toBeCloseTo(1.85, 10);
  });

  it("con un solo valore restituisce quel valore", () => {
    expect(median([1.99])).toBe(1.99);
  });

  it("non modifica l'array in ingresso", () => {
    const input = [3, 1, 2];
    median(input);
    expect(input).toEqual([3, 1, 2]);
  });

  it("rifiuta un array vuoto", () => {
    expect(() => median([])).toThrow(RangeError);
  });
});

describe("computeReferencePrice — livello 1 (on-route)", () => {
  it("esempio a 5 stazioni: la mediana delle sole stazioni sul percorso ignora l'outlier autostradale", () => {
    const samples = [
      sample(0.1, 1.75),
      sample(0.3, 1.79),
      sample(3.5, 1.65),
      sample(8.0, 1.98), // outlier caro, fuori dal tracciato
      sample(0.2, 1.77),
    ];

    const result = computeReferencePrice(samples, national);

    expect(result).toEqual({ value: 1.77, level: "on_route", sampleSize: 3 });

    const arithmeticMeanOfAll = samples.reduce((sum, s) => sum + s.price, 0) / samples.length;
    expect(arithmeticMeanOfAll).toBeCloseTo(1.788, 3);
    expect(result!.value).not.toBeCloseTo(arithmeticMeanOfAll, 3);
  });

  it("una stazione a esattamente 0.5 km conta come on-route (soglia inclusiva)", () => {
    const result = computeReferencePrice([sample(0.5, 1.7), sample(0.2, 1.8), sample(0.0, 1.9)], null);
    expect(result?.level).toBe("on_route");
    expect(result?.sampleSize).toBe(3);
  });

  it("una stazione a 0.5001 km NON conta come on-route", () => {
    const result = computeReferencePrice([sample(0.5001, 1.7), sample(0.2, 1.8), sample(0.0, 1.9)], null);
    expect(result?.level).toBe("corridor");
  });

  it("basta esattamente N_MIN stazioni on-route", () => {
    const result = computeReferencePrice([sample(0.1, 1.7), sample(0.2, 1.8), sample(0.3, 1.9)], null);
    expect(result).toEqual({ value: 1.8, level: "on_route", sampleSize: 3 });
  });

  it("le stazioni lontane non influenzano la mediana quando il livello 1 è sufficiente", () => {
    const onRoute = [sample(0.1, 1.7), sample(0.2, 1.72), sample(0.3, 1.74)];
    const withOutliers = [...onRoute, sample(4.0, 2.5), sample(4.5, 2.6), sample(4.9, 2.7)];
    expect(computeReferencePrice(withOutliers, null)?.value).toBe(computeReferencePrice(onRoute, null)?.value);
  });
});

describe("computeReferencePrice — livello 2 (corridoio)", () => {
  it("con solo 2 stazioni on-route ricade sulla mediana dell'intero corridoio", () => {
    const samples = [sample(0.1, 1.7), sample(0.4, 1.8), sample(2.0, 1.9), sample(3.0, 2.0), sample(4.0, 2.1)];
    const result = computeReferencePrice(samples, national);
    expect(result).toEqual({ value: 1.9, level: "corridor", sampleSize: 5 });
  });

  it("con zero stazioni on-route ma corridoio sufficiente usa il corridoio", () => {
    const result = computeReferencePrice([sample(1.0, 1.7), sample(2.0, 1.8), sample(3.0, 1.9)], null);
    expect(result).toEqual({ value: 1.8, level: "corridor", sampleSize: 3 });
  });

  it("il livello 2 include anche le stazioni on-route nel campione", () => {
    const result = computeReferencePrice([sample(0.1, 1.5), sample(2.0, 1.8), sample(3.0, 1.9)], null);
    expect(result?.level).toBe("corridor");
    expect(result?.sampleSize).toBe(3);
    expect(result?.value).toBe(1.8);
  });
});

describe("computeReferencePrice — livello 3 (nazionale)", () => {
  it("con meno di N_MIN stazioni nel corridoio usa la mediana nazionale", () => {
    const result = computeReferencePrice([sample(0.1, 1.7), sample(1.0, 1.8)], national);
    expect(result).toEqual({ value: 1.81, level: "national", sampleSize: 30000 });
  });

  it("con corridoio vuoto usa la mediana nazionale", () => {
    expect(computeReferencePrice([], national)).toEqual({ value: 1.81, level: "national", sampleSize: 30000 });
  });

  it("carburante raro (es. Metano): 1 stazione on-route e solo 2 nel corridoio → nazionale", () => {
    const metanoNational: NationalPrice = { median: 1.79, sampleSize: 1578 };
    const result = computeReferencePrice([sample(0.2, 1.75), sample(2.5, 1.85)], metanoNational);
    expect(result?.level).toBe("national");
    expect(result?.value).toBe(1.79);
  });

  it("ignora una mediana nazionale calcolata su meno di N_MIN campioni", () => {
    expect(computeReferencePrice([sample(0.1, 1.7)], { median: 1.8, sampleSize: 2 })).toBeNull();
  });

  it("ignora una mediana nazionale non finita", () => {
    expect(computeReferencePrice([], { median: Number.NaN, sampleSize: 100 })).toBeNull();
  });

  it("restituisce null quando nessun livello ha dati sufficienti", () => {
    expect(computeReferencePrice([sample(0.1, 1.7)], null)).toBeNull();
    expect(computeReferencePrice([], null)).toBeNull();
  });
});

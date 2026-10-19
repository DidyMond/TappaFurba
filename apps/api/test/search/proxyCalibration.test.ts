import { PROXY_CIRCUITY_FACTOR, PROXY_DETOUR_SPEED_KMH } from "@tappafurba/core";
import { describe, expect, it } from "vitest";
import {
  buildCalibrationReport,
  type CalibrationSample,
  evaluateWhatIf,
  percentile,
  realFactor,
  RELEVANT_GAP,
  summarizeRatios,
} from "../../src/search/proxyCalibration";

/** Campione costruito apposta: giro reale = 2 × linea d'aria × `factor`, alla velocità `speedKmh`. Dati inventati, nessuna misura vera. */
function sample(euclidKm: number, factor: number, speedKmh: number, area = "urbano"): CalibrationSample {
  const realKm = 2 * euclidKm * factor;
  return { area, euclidKm, realKm, realMinutes: (realKm / speedKmh) * 60 };
}

describe("percentile", () => {
  it("interpola linearmente e tiene gli estremi", () => {
    const values = [1, 2, 3, 4, 5];
    expect(percentile(values, 0)).toBe(1);
    expect(percentile(values, 0.5)).toBe(3);
    expect(percentile(values, 1)).toBe(5);
    expect(percentile([1, 2, 3, 4], 0.5)).toBe(2.5);
    expect(percentile(values, 0.25)).toBe(2);
  });
  it("un solo valore è tutti i percentili; senza valori è un errore", () => {
    expect(percentile([7], 0.9)).toBe(7);
    expect(() => percentile([], 0.5)).toThrow(RangeError);
  });
});

describe("realFactor", () => {
  it("è giro reale / (2 × linea d'aria): l'equivalente del fattore del proxy", () => {
    expect(realFactor({ area: "x", euclidKm: 2, realKm: 6, realMinutes: 10 })).toBe(1.5);
  });
  it("con distanza nulla non è definito", () => {
    expect(() => realFactor({ area: "x", euclidKm: 0, realKm: 1, realMinutes: 1 })).toThrow(RangeError);
  });
});

describe("summarizeRatios — scarto del proxy sui campioni", () => {
  it("giro reale esattamente come la stima (1,25 a 40 km/h): nessuno scarto", () => {
    const stats = summarizeRatios([sample(1, PROXY_CIRCUITY_FACTOR, PROXY_DETOUR_SPEED_KMH), sample(3, PROXY_CIRCUITY_FACTOR, PROXY_DETOUR_SPEED_KMH)])!;
    expect(stats.median).toBeCloseTo(PROXY_CIRCUITY_FACTOR, 10);
    expect(stats.proxyKmGap).toBeCloseTo(0, 10);
    expect(stats.medianTimeRatio).toBeCloseTo(1, 10);
    expect(stats.shareUnderestimated).toBe(0);
  });

  it("giro reale 1,5 volte la linea d'aria: il proxy (1,25) sottostima del 16,7% e il giro supera la stima in tutti i casi", () => {
    const stats = summarizeRatios([sample(1, 1.5, 40), sample(2, 1.5, 40), sample(5, 1.5, 40)])!;
    expect(stats.median).toBeCloseTo(1.5, 10);
    expect(stats.proxyKmGap).toBeCloseTo((1.5 - 1.25) / 1.5, 10);
    expect(stats.shareUnderestimated).toBe(1);
    expect(stats.proxyKmGap).toBeGreaterThan(RELEVANT_GAP);
  });

  it("minuti: a 20 km/h reali contro i 40 km/h del proxy servono il doppio dei minuti stimati, a parità di km", () => {
    const stats = summarizeRatios([sample(2, PROXY_CIRCUITY_FACTOR, 20)])!;
    expect(stats.medianTimeRatio).toBeCloseTo(2, 10);
    expect(stats.medianSpeedKmh).toBeCloseTo(20, 10);
  });

  it("quartili e mediana su un campione misto", () => {
    const stats = summarizeRatios([1.2, 1.3, 1.4, 1.6, 2.0].map((f) => sample(2, f, 30)))!;
    expect(stats.p25).toBeCloseTo(1.3, 10);
    expect(stats.median).toBeCloseTo(1.4, 10);
    expect(stats.p75).toBeCloseTo(1.6, 10);
    expect(stats.shareUnderestimated).toBeCloseTo(4 / 5, 10);
  });

  it("senza campioni non c'è nulla da riassumere", () => {
    expect(summarizeRatios([])).toBeNull();
  });
});

describe("buildCalibrationReport — per zona e per fascia di distanza", () => {
  const samples = [
    sample(1, 1.8, 18, "urbano"),
    sample(1.5, 1.8, 18, "urbano"),
    sample(3, 1.4, 22, "urbano"),
    sample(5, 1.3, 30, "extraurbano"),
    sample(6, 1.3, 30, "extraurbano"),
    sample(8, 1.45, 36, "extraurbano"),
  ];

  it("separa le zone e riassume anche il totale", () => {
    const report = buildCalibrationReport(samples);
    expect(report.overall!.count).toBe(6);
    expect(Object.keys(report.byArea).sort()).toEqual(["extraurbano", "urbano"]);
    expect(report.byArea.urbano!.count).toBe(3);
    expect(report.byArea.extraurbano!.count).toBe(3);
    expect(report.byArea.urbano!.median).toBeGreaterThan(report.byArea.extraurbano!.median);
  });

  it("assegna ogni campione alla fascia di distanza giusta (estremo inferiore incluso, superiore escluso)", () => {
    const { byBand } = buildCalibrationReport(samples);
    expect(byBand.map((b) => b.stats?.count ?? 0)).toEqual([2, 1, 2, 1]); // 0,3–2 · 2–4 · 4–7 · 7–10
    expect(byBand[0]!.label).toBe("0.3–2 km");
    expect(byBand[3]!.label).toBe("7–10 km");
  });

  it("le fasce senza campioni risultano vuote, non rompono il report", () => {
    const report = buildCalibrationReport([sample(5, 1.3, 30)]);
    expect(report.byBand.map((b) => b.stats === null)).toEqual([true, true, false, true]);
  });

  it("il fattore usato per lo scarto si può cambiare: con quello giusto lo scarto è nullo", () => {
    const report = buildCalibrationReport(samples.slice(0, 2), { factor: 1.8 });
    expect(report.overall!.proxyKmGap).toBeCloseTo(0, 10);
  });
});

describe("evaluateWhatIf — che errore avrebbe un altro fattore", () => {
  it("con fattore e velocità giusti gli errori sono nulli", () => {
    const result = evaluateWhatIf([sample(2, 1.5, 22), sample(4, 1.5, 22)], { factor: 1.5, speedKmh: 22 })!;
    expect(result.medianKmError).toBeCloseTo(0, 10);
    expect(result.medianMinutesError).toBeCloseTo(0, 10);
    expect(result.medianCostErrorEuro).toBeCloseTo(0, 10);
  });

  it("sottostima: errore con segno negativo e costo in euro del giro (carburante + tempo)", () => {
    // Reale: 2 km di linea d'aria × 2 × 1,5 = 6 km a 20 km/h = 18 min. Stima: 5 km a 40 km/h = 7,5 min.
    const result = evaluateWhatIf([sample(2, 1.5, 20)], { factor: 1.25, speedKmh: 40 })!;
    expect(result.medianKmError).toBeCloseTo((5 - 6) / 6, 10);
    expect(result.medianMinutesError).toBeCloseTo((7.5 - 18) / 18, 10);
    // costo = km × (1,9 / 15) + minuti × 0,15 → reale 6×0,12667 + 18×0,15 = 3,46; stima 5×0,12667 + 7,5×0,15 = 1,758
    expect(result.medianCostErrorEuro).toBeCloseTo(3.46 - 1.7583, 3);
  });

  it("i parametri del costo si possono cambiare", () => {
    const base = evaluateWhatIf([sample(2, 1.5, 20)], { factor: 1.25, speedKmh: 40 })!;
    const noTime = evaluateWhatIf([sample(2, 1.5, 20)], { factor: 1.25, speedKmh: 40 }, { fuelPricePerLiter: 1.9, consumptionKmPerLiter: 15, valueOfTimePerMinute: 0 })!;
    expect(noTime.medianCostErrorEuro).toBeLessThan(base.medianCostErrorEuro);
  });

  it("senza campioni non c'è nulla da valutare", () => {
    expect(evaluateWhatIf([], { factor: 1.25, speedKmh: 40 })).toBeNull();
  });
});

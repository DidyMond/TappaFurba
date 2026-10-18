import { describe, expect, it } from "vitest";
import { computeNetSavings, costPerKm, type NetSavingsInput } from "../src/savings/netSavings";

const base: NetSavingsInput = {
  referencePrice: 1.75,
  stationPrice: 1.65,
  liters: 50,
  detourKm: 2,
  detourMinutes: 3,
  consumptionKmPerLiter: 15,
  valueOfTimePerMinute: 0.15,
};

describe("costPerKm", () => {
  it("è prezzo di riferimento / consumo (€/km)", () => {
    expect(costPerKm(1.75, 15)).toBeCloseTo(0.116667, 5);
    expect(costPerKm(2.0, 20)).toBeCloseTo(0.1, 10);
  });

  it("rifiuta un consumo nullo o negativo", () => {
    expect(() => costPerKm(1.75, 0)).toThrow(RangeError);
    expect(() => costPerKm(1.75, -5)).toThrow(RangeError);
    expect(() => costPerKm(1.75, Number.NaN)).toThrow(RangeError);
  });
});

describe("computeNetSavings", () => {
  it("applica la formula S_net = (P_avg − P_station)·L − (D·C_km + T·V_time)", () => {
    const result = computeNetSavings(base);

    expect(result.grossSavings).toBeCloseTo(5.0, 10); // (1.75 − 1.65) · 50
    expect(result.costPerKm).toBeCloseTo(0.116667, 5);
    expect(result.detourFuelCost).toBeCloseTo(0.233333, 5); // 2 km · 0.116667
    expect(result.detourTimeCost).toBeCloseTo(0.45, 10); // 3 min · 0.15
    expect(result.netSavings).toBeCloseTo(4.316667, 5);
  });

  it("con deviazione zero il risparmio netto coincide con quello lordo", () => {
    const result = computeNetSavings({ ...base, detourKm: 0, detourMinutes: 0 });
    expect(result.netSavings).toBeCloseTo(result.grossSavings, 10);
    expect(result.detourFuelCost).toBe(0);
    expect(result.detourTimeCost).toBe(0);
  });

  it("è negativo se la stazione costa più del prezzo di riferimento", () => {
    const result = computeNetSavings({ ...base, stationPrice: 1.85, detourKm: 0, detourMinutes: 0 });
    expect(result.grossSavings).toBeCloseTo(-5.0, 10);
    expect(result.netSavings).toBeLessThan(0);
  });

  it("una deviazione lunga può annullare un piccolo vantaggio di prezzo (il paradosso della deviazione)", () => {
    // 2 cent/L su 45 L = 0.90 €, ma 5 km e 10 min di deviazione costano molto di più.
    const result = computeNetSavings({
      ...base,
      stationPrice: 1.73,
      liters: 45,
      detourKm: 5,
      detourMinutes: 10,
    });
    expect(result.grossSavings).toBeCloseTo(0.9, 10);
    expect(result.netSavings).toBeLessThan(0);
  });

  it("C_km dipende dal prezzo di riferimento, non da quello della stazione", () => {
    const cheap = computeNetSavings({ ...base, stationPrice: 1.4 });
    const dear = computeNetSavings({ ...base, stationPrice: 1.7 });
    expect(cheap.costPerKm).toBe(dear.costPerKm);
    expect(cheap.detourFuelCost).toBe(dear.detourFuelCost);
  });

  it("con valore del tempo a zero il costo del tempo scompare", () => {
    const result = computeNetSavings({ ...base, valueOfTimePerMinute: 0 });
    expect(result.detourTimeCost).toBe(0);
    expect(result.netSavings).toBeCloseTo(result.grossSavings - result.detourFuelCost, 10);
  });

  it("scala linearmente con i litri", () => {
    const small = computeNetSavings({ ...base, liters: 25, detourKm: 0, detourMinutes: 0 });
    const large = computeNetSavings({ ...base, liters: 50, detourKm: 0, detourMinutes: 0 });
    expect(large.netSavings).toBeCloseTo(small.netSavings * 2, 10);
  });

  it("a parità di condizioni, più deviazione significa meno risparmio", () => {
    const near = computeNetSavings({ ...base, detourKm: 1, detourMinutes: 2 });
    const far = computeNetSavings({ ...base, detourKm: 4, detourMinutes: 8 });
    expect(far.netSavings).toBeLessThan(near.netSavings);
  });

  it("rifiuta input non validi", () => {
    expect(() => computeNetSavings({ ...base, liters: -1 })).toThrow(RangeError);
    expect(() => computeNetSavings({ ...base, detourKm: Number.NaN })).toThrow(RangeError);
    expect(() => computeNetSavings({ ...base, stationPrice: Number.POSITIVE_INFINITY })).toThrow(RangeError);
    expect(() => computeNetSavings({ ...base, consumptionKmPerLiter: 0 })).toThrow(RangeError);
  });
});

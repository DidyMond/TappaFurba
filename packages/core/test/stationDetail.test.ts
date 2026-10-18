import { describe, expect, it } from "vitest";
import { computeNetSavings, computeStationDetail, resolveDetour } from "../src";

const base = {
  referencePrice: 2.15,
  stationPrice: 1.99,
  liters: 45,
  detour: { km: 1.6, minutes: 2.9 },
  consumptionKmPerLiter: 15,
  valueOfTimePerMinute: 0.15,
};

describe("computeStationDetail — differenziale rispetto al prezzo di riferimento", () => {
  it("una stazione più economica ha differenziale negativo, in €/L e in percentuale", () => {
    const detail = computeStationDetail(base);
    expect(detail.priceDifferencePerLiter).toBeCloseTo(-0.16, 10);
    expect(detail.priceDifferencePercent).toBeCloseTo((-0.16 / 2.15) * 100, 10); // −7,44 %
    expect(detail.priceDifferencePercent).toBeCloseTo(-7.44, 2);
  });

  it("una stazione più cara ha differenziale positivo", () => {
    const detail = computeStationDetail({ ...base, stationPrice: 2.3 });
    expect(detail.priceDifferencePerLiter).toBeCloseTo(0.15, 10);
    expect(detail.priceDifferencePercent).toBeGreaterThan(0);
  });

  it("al prezzo di riferimento il differenziale è zero", () => {
    const detail = computeStationDetail({ ...base, stationPrice: 2.15 });
    expect(detail.priceDifferencePerLiter).toBe(0);
    expect(detail.priceDifferencePercent).toBe(0);
  });

  it("il differenziale per litro per i litri coincide con il risparmio lordo (segno opposto)", () => {
    const detail = computeStationDetail(base);
    expect(-detail.priceDifferencePerLiter * base.liters).toBeCloseTo(detail.grossSavings, 10);
  });
});

describe("computeStationDetail — coerenza con la formula S_net", () => {
  it("usa gli stessi numeri di computeNetSavings (stesso risparmio netto dell'elenco)", () => {
    const detail = computeStationDetail(base);
    const expected = computeNetSavings({
      referencePrice: base.referencePrice,
      stationPrice: base.stationPrice,
      liters: base.liters,
      detourKm: base.detour.km,
      detourMinutes: base.detour.minutes,
      consumptionKmPerLiter: base.consumptionKmPerLiter,
      valueOfTimePerMinute: base.valueOfTimePerMinute,
    });
    expect(detail.netSavings).toBeCloseTo(expected.netSavings, 12);
    expect(detail.grossSavings).toBeCloseTo(7.2, 10);
  });

  it("costo della deviazione = carburante + tempo e netto = lordo − costo", () => {
    const detail = computeStationDetail(base);
    expect(detail.detourFuelCost).toBeCloseTo(1.6 * (2.15 / 15), 10);
    expect(detail.detourTimeCost).toBeCloseTo(2.9 * 0.15, 10);
    expect(detail.detourCost).toBeCloseTo(detail.detourFuelCost + detail.detourTimeCost, 12);
    expect(detail.netSavings).toBeCloseTo(detail.grossSavings - detail.detourCost, 12);
  });

  it("senza convenienza il risparmio netto è negativo (non si nasconde)", () => {
    expect(computeStationDetail({ ...base, stationPrice: 2.2 }).netSavings).toBeLessThan(0);
  });

  it("rifiuta un prezzo di riferimento non valido", () => {
    expect(() => computeStationDetail({ ...base, referencePrice: 0 })).toThrow(RangeError);
    expect(() => computeStationDetail({ ...base, referencePrice: Number.NaN })).toThrow(RangeError);
  });

  it("rifiuta ingressi non validi (litri o deviazione negativi)", () => {
    expect(() => computeStationDetail({ ...base, liters: -1 })).toThrow(RangeError);
    expect(() => computeStationDetail({ ...base, detour: { km: -1, minutes: 0 } })).toThrow(RangeError);
  });
});

describe("resolveDetour — la stima non si spaccia mai per verificata", () => {
  const proxy = { km: 2, minutes: 3 };

  it("con una deviazione verificata la usa e la dichiara «routing»", () => {
    expect(resolveDetour({ km: 1.6, minutes: 2.9 }, proxy)).toEqual({ detour: { km: 1.6, minutes: 2.9 }, source: "routing" });
  });

  it("senza verifica (null/undefined) ricade sulla stima dichiarata «proxy»", () => {
    expect(resolveDetour(null, proxy)).toEqual({ detour: proxy, source: "proxy" });
    expect(resolveDetour(undefined, proxy)).toEqual({ detour: proxy, source: "proxy" });
  });

  it("una verifica con valori non finiti non conta come verifica", () => {
    expect(resolveDetour({ km: Number.NaN, minutes: 1 }, proxy).source).toBe("proxy");
    expect(resolveDetour({ km: 1, minutes: Number.POSITIVE_INFINITY }, proxy).source).toBe("proxy");
  });

  it("una verifica a 0 km / 0 min è comunque una verifica", () => {
    expect(resolveDetour({ km: 0, minutes: 0 }, proxy).source).toBe("routing");
  });
});

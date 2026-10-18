import { describe, expect, it } from "vitest";
import {
  canStepConsumption,
  CONSUMPTION_MARKS,
  displayRange,
  formatConsumption,
  formatConsumptionWithUnit,
  fromDisplay,
  kmplToL100,
  L100_SLIDER,
  l100ToKmpl,
  stepConsumption,
  toDisplay,
  unitLabel,
} from "./consumption";
import { CONSUMPTION_RANGE } from "./defaults";

describe("conversione km/L ↔ L/100 km (solo display)", () => {
  it("uscita: L/100 km = 100 ÷ (km/L) con 1 decimale", () => {
    expect(kmplToL100(15)).toBe(6.7);
    expect(kmplToL100(8)).toBe(12.5);
    expect(kmplToL100(30)).toBe(3.3);
    expect(kmplToL100(40)).toBe(2.5);
    expect(kmplToL100(3)).toBe(33.3);
    expect(kmplToL100(12.5)).toBe(8);
  });

  it("ingresso: km/L = 100 ÷ (L/100 km) arrotondato a 2 decimali", () => {
    expect(l100ToKmpl(6.7)).toBe(14.93);
    expect(l100ToKmpl(5)).toBe(20);
    expect(l100ToKmpl(8)).toBe(12.5);
    expect(l100ToKmpl(2.5)).toBe(40);
    expect(l100ToKmpl(33.3)).toBe(3);
    expect(l100ToKmpl(6.5)).toBe(15.38);
  });

  it("gli estremi dello slider L/100 km (2,5 e 33,3) sono l'equivalente di 40 e 3 km/L: la validazione resta 3–40 km/L", () => {
    expect(L100_SLIDER).toEqual({ min: 2.5, max: 33.3, step: 0.1 });
    expect(l100ToKmpl(L100_SLIDER.min)).toBe(CONSUMPTION_RANGE.max);
    expect(l100ToKmpl(L100_SLIDER.max)).toBe(CONSUMPTION_RANGE.min);
  });

  it("andata e ritorno: ogni valore dello slider (2,5–33,3 a passo 0,1) dà km/L validi e si rilegge uguale (unica eccezione: 32,0, che 2 decimali di km/L non rappresentano)", () => {
    const mismatches: number[] = [];
    for (let tenths = 25; tenths <= 333; tenths++) {
      const l100 = tenths / 10;
      const kmpl = l100ToKmpl(l100);
      expect(kmpl, String(l100)).toBeGreaterThanOrEqual(CONSUMPTION_RANGE.min);
      expect(kmpl, String(l100)).toBeLessThanOrEqual(CONSUMPTION_RANGE.max);
      if (kmplToL100(kmpl) !== l100) mismatches.push(l100);
    }
    expect(mismatches).toEqual([32]); // nessun km/L a 2 decimali si legge «32,0»: 3,12 → 32,1 e 3,13 → 31,9
  });

  it("il valore salvato non cambia mai cambiando solo l'unità mostrata; la riconversione dal display è un'approssimazione contenuta", () => {
    for (const kmpl of [3, 8, 14.93, 15, 22.5, 30, 40]) {
      expect(fromDisplay(toDisplay(kmpl, "kmpl"), "kmpl")).toBe(kmpl);
      expect(Math.abs(fromDisplay(toDisplay(kmpl, "l100km"), "l100km") - kmpl) / kmpl).toBeLessThan(0.03);
    }
  });

  it("toDisplay / fromDisplay / displayRange per unità", () => {
    expect(toDisplay(15, "kmpl")).toBe(15);
    expect(toDisplay(15, "l100km")).toBe(6.7);
    expect(fromDisplay(18, "kmpl")).toBe(18);
    expect(fromDisplay(5, "l100km")).toBe(20);
    expect(displayRange("kmpl")).toEqual({ min: 3, max: 40 });
    expect(displayRange("l100km")).toEqual({ min: 2.5, max: 33.3 });
  });
});

describe("formattazione con l'unità sempre visibile", () => {
  it("virgola italiana e un decimale", () => {
    expect(formatConsumption(15, "kmpl")).toBe("15,0");
    expect(formatConsumption(15, "l100km")).toBe("6,7");
    expect(formatConsumptionWithUnit(15, "kmpl")).toBe("15,0 km/L");
    expect(formatConsumptionWithUnit(15, "l100km")).toBe("6,7 L/100 km");
    expect(formatConsumptionWithUnit(8, "l100km")).toBe("12,5 L/100 km");
    expect(unitLabel("kmpl")).toBe("km/L");
    expect(unitLabel("l100km")).toBe("L/100 km");
  });

  it("le tre tacche «Sport · Medio · Eco» diventano 12,5 · 6,7 · 3,3 in L/100 km", () => {
    expect(CONSUMPTION_MARKS.map((m) => m.kmpl)).toEqual([8, 15, 30]);
    expect(CONSUMPTION_MARKS.map((m) => kmplToL100(m.kmpl))).toEqual([12.5, 6.7, 3.3]);
  });
});

describe("stepper per-ricerca (passi di 0,5 sul valore mostrato)", () => {
  it("in km/L: ±0,5 km/L", () => {
    expect(stepConsumption(15, "kmpl", 1)).toBe(15.5);
    expect(stepConsumption(15, "kmpl", -1)).toBe(14.5);
  });

  it("in L/100 km: ±0,5 L/100 km, il risultato è sempre km/L", () => {
    expect(stepConsumption(15, "l100km", 1)).toBe(l100ToKmpl(7.2)); // 6,7 + 0,5
    expect(stepConsumption(15, "l100km", -1)).toBe(l100ToKmpl(6.2));
    expect(stepConsumption(12.5, "l100km", 1)).toBe(l100ToKmpl(8.5));
    // Il valore mostrato cambia esattamente di 0,5.
    const up = stepConsumption(15, "l100km", 1);
    expect(toDisplay(up, "l100km")).toBe(7.2);
    expect(toDisplay(stepConsumption(up, "l100km", -1), "l100km")).toBe(6.7);
  });

  it("non esce mai da 3–40 km/L (2,5–33,3 L/100 km)", () => {
    expect(stepConsumption(40, "kmpl", 1)).toBe(40);
    expect(stepConsumption(3, "kmpl", -1)).toBe(3);
    expect(stepConsumption(40, "l100km", -1)).toBe(40); // 2,5 L/100 km è il minimo
    expect(stepConsumption(3, "l100km", 1)).toBe(3); // 33,3 è il massimo
    expect(canStepConsumption(40, "kmpl", 1)).toBe(false);
    expect(canStepConsumption(3, "kmpl", -1)).toBe(false);
    expect(canStepConsumption(40, "l100km", -1)).toBe(false);
    expect(canStepConsumption(3, "l100km", 1)).toBe(false);
    expect(canStepConsumption(15, "l100km", 1)).toBe(true);
    expect(canStepConsumption(15, "l100km", -1)).toBe(true);
  });

  it("a ogni valore dell'intervallo in L/100 km un passo in su e uno in giù restano in 3–40 km/L", () => {
    for (let tenths = 25; tenths <= 333; tenths++) {
      const kmpl = l100ToKmpl(tenths / 10);
      for (const direction of [1, -1] as const) {
        const next = stepConsumption(kmpl, "l100km", direction);
        expect(next).toBeGreaterThanOrEqual(3);
        expect(next).toBeLessThanOrEqual(40);
      }
    }
  });
});

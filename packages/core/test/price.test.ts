import { describe, expect, it } from "vitest";
import { isPlausiblePrice } from "../src/validation/price";

describe("isPlausiblePrice", () => {
  it("accetta prezzi realistici osservati nel dataset (es. 2.669, 0.849, 1.794)", () => {
    expect(isPlausiblePrice(2.669)).toBe(true);
    expect(isPlausiblePrice(0.849)).toBe(true);
    expect(isPlausiblePrice(1.794)).toBe(true);
  });

  it("rifiuta un prezzo a zero", () => {
    expect(isPlausiblePrice(0)).toBe(false);
  });

  it("rifiuta un evidente errore di battitura (es. 26.69 invece di 2.669)", () => {
    expect(isPlausiblePrice(26.69)).toBe(false);
  });

  it("rifiuta valori negativi o non finiti", () => {
    expect(isPlausiblePrice(-1)).toBe(false);
    expect(isPlausiblePrice(Number.NaN)).toBe(false);
  });

  it("per benzina e gasolio rifiuta i segnaposto osservati nei dati reali (1.000, 0.780)", () => {
    expect(isPlausiblePrice(1.0, "benzina")).toBe(false);
    expect(isPlausiblePrice(0.78, "diesel")).toBe(false);
    expect(isPlausiblePrice(1.0, "hvo")).toBe(false);
  });

  it("GPL e metano possono legittimamente costare meno di 1.2 €/L", () => {
    expect(isPlausiblePrice(0.849, "gpl")).toBe(true);
    expect(isPlausiblePrice(1.0, "metano")).toBe(true);
  });

  it("senza tipo di carburante vale solo il range generale", () => {
    expect(isPlausiblePrice(1.0)).toBe(true);
  });
});

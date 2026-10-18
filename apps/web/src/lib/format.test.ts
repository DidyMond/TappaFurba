import { describe, expect, it } from "vitest";
import { formatPriceDifference, formatSignedEuro, formatSignedPercent } from "./format";

describe("formattazione del dettaglio stazione", () => {
  it("formatSignedEuro: importo, con il segno meno tipografico se negativo", () => {
    expect(formatSignedEuro(15.8)).toBe("€ 15,80");
    expect(formatSignedEuro(0)).toBe("€ 0,00");
    expect(formatSignedEuro(-2)).toBe("−€ 2,00");
  });

  it("formatPriceDifference: €/L con tre decimali e segno esplicito", () => {
    expect(formatPriceDifference(-0.149)).toBe("−0,149");
    expect(formatPriceDifference(0.15)).toBe("+0,150");
    expect(formatPriceDifference(0)).toBe("0,000");
  });

  it("formatSignedPercent: un decimale con segno", () => {
    expect(formatSignedPercent(-7.44)).toBe("−7,4%");
    expect(formatSignedPercent(3)).toBe("+3,0%");
    expect(formatSignedPercent(0)).toBe("0,0%");
  });
});

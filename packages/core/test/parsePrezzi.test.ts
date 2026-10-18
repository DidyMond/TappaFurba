import { describe, expect, it } from "vitest";
import { parsePrezziCsv } from "../src/csv/parsePrezzi";

const sampleCsv = [
  "Estrazione del 2026-09-26",
  "idImpianto|descCarburante|prezzo|isSelf|dtComu",
  "3464|Benzina|2.669|0|24/09/2026 19:30:07",
  "3464|Benzina|2.309|1|24/09/2026 19:30:06",
  "3493|HVOlution|2.649|0|26/09/2026 07:33:48",
  "3510|F-101|1.999|0|25/09/2026 15:23:11",
  "9999|Gasolio||1|25/09/2026 10:00:00", // prezzo mancante
  "8888|Benzina|26.69|0|25/09/2026 10:00:00", // prezzo implausibile (probabile errore di battitura)
].join("\n");

describe("parsePrezziCsv", () => {
  it("normalizza descCarburante nei bucket attesi", () => {
    const { prices } = parsePrezziCsv(sampleCsv);
    expect(prices.find((p) => p.rawDescCarburante === "Benzina" && p.price === 2.669)?.fuelType).toBe("benzina");
    expect(prices.find((p) => p.rawDescCarburante === "HVOlution")?.fuelType).toBe("hvo");
  });

  it("mappa isSelf correttamente su booleano", () => {
    const { prices } = parsePrezziCsv(sampleCsv);
    const servito = prices.find((p) => p.rawDescCarburante === "Benzina" && p.price === 2.669);
    const self = prices.find((p) => p.rawDescCarburante === "Benzina" && p.price === 2.309);
    expect(servito?.isSelf).toBe(false);
    expect(self?.isSelf).toBe(true);
  });

  it("converte dtComu in ISO 8601", () => {
    const { prices } = parsePrezziCsv(sampleCsv);
    const price = prices.find((p) => p.rawDescCarburante === "Benzina" && p.isSelf === false);
    expect(price?.communicatedAt).toBe("2026-09-24T19:30:07.000Z");
  });

  it('classifica un valore sconosciuto come "unknown" e lo logga, senza inventare nulla', () => {
    const { prices, warnings } = parsePrezziCsv(sampleCsv);
    const unknown = prices.find((p) => p.rawDescCarburante === "F-101");
    expect(unknown?.fuelType).toBe("unknown");
    expect(warnings.some((w) => w.reason.includes("F-101"))).toBe(true);
  });

  it("esclude righe con prezzo mancante, loggando un warning", () => {
    const { prices, warnings } = parsePrezziCsv(sampleCsv);
    expect(prices.some((p) => p.stationId === 9999)).toBe(false);
    expect(warnings.some((w) => w.reason.includes("prezzo mancante"))).toBe(true);
  });

  it("esclude righe con prezzo fuori range plausibile, loggando un warning", () => {
    const { prices, warnings } = parsePrezziCsv(sampleCsv);
    expect(prices.some((p) => p.stationId === 8888)).toBe(false);
    expect(warnings.some((w) => w.reason.includes("fuori range plausibile"))).toBe(true);
  });

  it("scarta il segnaposto 1.000 di 'Blue Super' (caso reale, stazione 3473) ma tiene GPL a 0.863", () => {
    const csv = [
      "Estrazione del 2026-09-27",
      "idImpianto|descCarburante|prezzo|isSelf|dtComu",
      "3473|Benzina|2.199|1|26/09/2026 14:50:07",
      "3473|Blue Super|1.000|1|24/09/2026 21:52:18",
      "3473|GPL|0.863|0|24/09/2026 21:52:18",
    ].join("\n");
    const { prices, warnings } = parsePrezziCsv(csv);
    expect(prices.map((p) => p.rawDescCarburante)).toEqual(["Benzina", "GPL"]);
    expect(warnings.some((w) => w.reason.includes("fuori range plausibile"))).toBe(true);
  });
});

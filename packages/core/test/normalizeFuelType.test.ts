import { describe, expect, it } from "vitest";
import { normalizeFuelType } from "../src/fuel/normalizeFuelType";

// Elenco reale delle ~60 varianti distinte osservate in prezzo_alle_8.csv
// (MIMIT, verificato dal vivo il 26/09/2026 scaricando il file pubblicato).
const REAL_RAW_VALUES = [
  "BCHVO",
  "Benzina",
  "Benzina 100 ottani",
  "Benzina 102 Ottani",
  "Benzina Energy 98 ottani",
  "Benzina Plus 98",
  "Benzina Shell V Power",
  "Benzina Speciale 98 Ottani",
  "Benzina WR 100",
  "Benzina speciale",
  "Blu Diesel Alpino",
  "Blue Diesel",
  "Blue Super",
  "Diesel HVO",
  "Diesel HVO Energy",
  "Diesel Shell V Power",
  "DieselMax",
  "E-DIESEL",
  "Excellium Diesel",
  "Excellium diesel",
  "F-101",
  "F101",
  "GASOLIO HVO",
  "GNL",
  "GP DIESEL",
  "GPL",
  "Gasolio",
  "Gasolio Alpino",
  "Gasolio Artico",
  "Gasolio Artico Igloo",
  "Gasolio Bio HVO",
  "Gasolio Ecoplus",
  "Gasolio Energy D",
  "Gasolio Gelo",
  "Gasolio HVO",
  "Gasolio Oro Diesel",
  "Gasolio Plus",
  "Gasolio Premium",
  "Gasolio Prestazionale",
  "Gasolio artico",
  "Gasolio speciale",
  "HVO",
  "HVO Energy Diesel",
  "HVO Future",
  "HVO eco diesel",
  "HVO100",
  "HVOlution",
  "HVOvolution",
  "Hi-Q Diesel",
  "HiQ Perform B100 Ottani",
  "HiQ Perform+",
  "L-GNC",
  "Metano",
  "REHVO",
  "S-Diesel",
  "Supreme Diesel",
  "V-Power",
  "V-Power Diesel",
  "Verde speciale",
];

const KNOWN_FUEL_TYPES = ["benzina", "diesel", "gpl", "metano", "hvo", "other", "unknown"];

// Solo i codici realmente non catalogabili (nessuna parola chiave riconoscibile).
const EXPECTED_UNKNOWN = new Set(["F-101", "F101"]);

describe("normalizeFuelType — copertura reale MIMIT", () => {
  it("classifica ogni valore reale osservato in un bucket noto (mai un crash)", () => {
    for (const raw of REAL_RAW_VALUES) {
      const result = normalizeFuelType(raw);
      expect(KNOWN_FUEL_TYPES).toContain(result.fuelType);
    }
  });

  it('riconosce come "unknown" solo i codici realmente non catalogabili', () => {
    for (const raw of REAL_RAW_VALUES) {
      const result = normalizeFuelType(raw);
      if (EXPECTED_UNKNOWN.has(raw)) {
        expect(result.fuelType, `${raw} dovrebbe essere unknown`).toBe("unknown");
      } else {
        expect(result.fuelType, `${raw} non dovrebbe essere unknown`).not.toBe("unknown");
      }
    }
  });

  it('è case-insensitive e ignora spazi ridondanti (es. "Excellium Diesel" vs "Excellium diesel")', () => {
    expect(normalizeFuelType("Excellium Diesel").fuelType).toBe("diesel");
    expect(normalizeFuelType("Excellium diesel").fuelType).toBe("diesel");
    expect(normalizeFuelType("  gasolio   artico  ").fuelType).toBe("diesel");
  });

  it("non mappa mai una variante HVO su diesel/benzina solo perché ne contiene la parola", () => {
    expect(normalizeFuelType("Gasolio Bio HVO").fuelType).toBe("hvo");
    expect(normalizeFuelType("GASOLIO HVO").fuelType).toBe("hvo");
    expect(normalizeFuelType("Diesel HVO Energy").fuelType).toBe("hvo");
  });

  it("esclude GNL e L-GNC dai bucket metano/gpl (sono carburanti diversi)", () => {
    expect(normalizeFuelType("GNL").fuelType).toBe("other");
    expect(normalizeFuelType("L-GNC").fuelType).toBe("other");
    expect(normalizeFuelType("Metano").fuelType).toBe("metano");
  });

  it('distingue "HiQ Perform+" (diesel premium) da "HiQ Perform B100 Ottani" (biocarburante)', () => {
    expect(normalizeFuelType("HiQ Perform+").fuelType).toBe("diesel");
    expect(normalizeFuelType("HiQ Perform B100 Ottani").fuelType).toBe("hvo");
  });

  it("registra la via di classificazione (dictionary vs heuristic vs unknown)", () => {
    expect(normalizeFuelType("Benzina").matchedVia).toBe("dictionary");
    expect(normalizeFuelType("E-DIESEL").matchedVia).toBe("heuristic");
    expect(normalizeFuelType("F-101").matchedVia).toBe("unknown");
  });
});

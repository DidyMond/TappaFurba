import type { FuelType } from "@tappafurba/shared";
import { FUEL_TYPE_DICTIONARY } from "./fuelTypeDictionary";

export function preprocessFuelLabel(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // rimuove diacritici
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export interface NormalizeFuelTypeResult {
  fuelType: FuelType;
  matchedVia: "dictionary" | "heuristic" | "unknown";
}

/**
 * Rete di sicurezza per varianti non ancora catalogate in FUEL_TYPE_DICTIONARY:
 * MIMIT introduce periodicamente nuovi nomi commerciali. L'ordine delle regole
 * è significativo: "hvo" viene verificato prima di "diesel/gasolio", così
 * "Gasolio Bio HVO" non ricadrebbe mai su diesel per il solo fatto di
 * contenere anche la parola "gasolio".
 */
const HEURISTIC_RULES: Array<{ test: (label: string) => boolean; fuelType: FuelType }> = [
  { test: (label) => label.includes("hvo"), fuelType: "hvo" },
  { test: (label) => label.includes("metano"), fuelType: "metano" },
  { test: (label) => label.includes("gnl") || label.includes("gnc"), fuelType: "other" },
  { test: (label) => label.includes("diesel") || label.includes("gasolio"), fuelType: "diesel" },
  {
    test: (label) => label.includes("benzina") || label.includes("verde") || label.includes("v-power"),
    fuelType: "benzina",
  },
];

export function normalizeFuelType(raw: string): NormalizeFuelTypeResult {
  const label = preprocessFuelLabel(raw);

  const dictionaryMatch = FUEL_TYPE_DICTIONARY[label];
  if (dictionaryMatch) {
    return { fuelType: dictionaryMatch, matchedVia: "dictionary" };
  }

  for (const rule of HEURISTIC_RULES) {
    if (rule.test(label)) {
      return { fuelType: rule.fuelType, matchedVia: "heuristic" };
    }
  }

  return { fuelType: "unknown", matchedVia: "unknown" };
}

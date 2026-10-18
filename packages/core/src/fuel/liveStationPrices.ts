import type { FuelPrice } from "@tappafurba/shared";
import { isPlausiblePrice } from "../validation/price";
import { dedupeToLowestPricePerStationFuelMode } from "./dedupePrices";
import { normalizeFuelType } from "./normalizeFuelType";

/** Prezzi di una stazione come restituiti dalla fonte in tempo reale (sito Osservaprezzi). */
export interface LiveStationInput {
  /** Stesso idImpianto del CSV MIMIT. */
  stationId: number;
  /** ISO 8601: data di comunicazione dei prezzi (a livello di stazione, non per carburante). */
  communicatedAt: string;
  fuels: ReadonlyArray<{ name: string; price: number; isSelf: boolean }>;
}

/**
 * Trasforma i prezzi live di una stazione nello stesso formato normalizzato del
 * CSV giornaliero: stessa normalizzazione dei carburanti, stessa validazione di
 * plausibilità, stessa regola di riduzione (prezzo più basso per carburante e
 * modalità). Così le due fonti sono intercambiabili a valle.
 */
export function liveStationToFuelPrices(input: LiveStationInput): FuelPrice[] {
  if (Number.isNaN(Date.parse(input.communicatedAt))) return [];

  const prices: FuelPrice[] = [];
  for (const fuel of input.fuels) {
    const fuelType = normalizeFuelType(fuel.name).fuelType;
    if (!isPlausiblePrice(fuel.price, fuelType)) continue;
    prices.push({
      stationId: input.stationId,
      fuelType,
      rawDescCarburante: fuel.name,
      isSelf: fuel.isSelf,
      price: fuel.price,
      communicatedAt: new Date(input.communicatedAt).toISOString(),
    });
  }
  return dedupeToLowestPricePerStationFuelMode(prices);
}

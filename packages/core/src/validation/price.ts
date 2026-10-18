import type { FuelType } from "@tappafurba/shared";

/**
 * Range di prezzo plausibile per un litro di carburante in Italia (€).
 * Serve solo a intercettare errori di battitura/parsing grossolani
 * (es. "26.69" invece di "2.669"), non a validare la congruità di mercato.
 */
const MIN_PLAUSIBLE_PRICE = 0.3;
const MAX_PLAUSIBLE_PRICE = 5;

/**
 * Soglia minima per i carburanti liquidi da autotrazione. I gestori inseriscono
 * a volte un segnaposto (osservati nei dati reali: 1.000 su "Blue Super", 0.780 su
 * un gasolio) quando non vendono quel prodotto: con le accise italiane benzina e
 * gasolio non scendono sotto questa cifra, mentre GPL e metano sì (0.85, 1.7).
 */
const MIN_PLAUSIBLE_PRICE_LIQUID_FUEL = 1.2;
const LIQUID_FUELS: ReadonlySet<FuelType> = new Set(["benzina", "diesel", "hvo"]);

export function isPlausiblePrice(price: number, fuelType?: FuelType): boolean {
  if (!Number.isFinite(price) || price < MIN_PLAUSIBLE_PRICE || price > MAX_PLAUSIBLE_PRICE) return false;
  if (fuelType && LIQUID_FUELS.has(fuelType) && price < MIN_PLAUSIBLE_PRICE_LIQUID_FUEL) return false;
  return true;
}

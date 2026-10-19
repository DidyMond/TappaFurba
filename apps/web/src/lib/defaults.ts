import type { SearchFuelType } from "@tappafurba/shared";

/**
 * Valori iniziali della ricerca. Coincidono con i default dello schema di validazione dell'API; le Impostazioni
 * (profilo veicolo, preferenze) li sovrascrivono.
 */
export const SEARCH_DEFAULTS = {
  fuelType: "benzina" as SearchFuelType,
  liters: 45,
  maxDetourKm: 5,
  /** Raggio di «Intorno a me»: come il MIMIT, 5 km di partenza e 10 al massimo. */
  radiusKm: 5,
  consumptionKmPerLiter: 15,
  valueOfTimePerMinute: 0.15,
  onlySelf: true,
  maxPriceAgeHours: 72,
} as const;

export const LITERS_RANGE = { min: 5, max: 120, step: 5 } as const;
export const DETOUR_RANGE = { min: 1, max: 10, step: 1 } as const;
export const RADIUS_RANGE = { min: 1, max: 10, step: 1 } as const;
export const CONSUMPTION_RANGE = { min: 3, max: 40 } as const;

export const FUEL_OPTIONS: ReadonlyArray<{ value: SearchFuelType; label: string }> = [
  { value: "benzina", label: "Benzina" },
  { value: "diesel", label: "Diesel" },
  { value: "gpl", label: "GPL" },
  { value: "metano", label: "Metano" },
];

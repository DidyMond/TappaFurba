import { NEARBY_RADIUS_KM, type SearchFuelType } from "@tappafurba/shared";

/**
 * Valori iniziali della ricerca. Coincidono con i default dello schema di validazione dell'API; le Impostazioni
 * (profilo veicolo, preferenze) li sovrascrivono.
 */
export const SEARCH_DEFAULTS = {
  fuelType: "benzina" as SearchFuelType,
  liters: 45,
  maxDetourKm: 5,
  /** Raggio di «Intorno a me» (i limiti sono in `NEARBY_RADIUS_KM`, gli stessi dell'API). */
  radiusKm: NEARBY_RADIUS_KM.default,
  consumptionKmPerLiter: 15,
  valueOfTimePerMinute: 0.15,
  onlySelf: true,
  maxPriceAgeHours: 72,
} as const;

export const LITERS_RANGE = { min: 5, max: 120, step: 5 } as const;
export const DETOUR_RANGE = { min: 1, max: 10, step: 1 } as const;
/** Slider del raggio: gli estremi sono quelli accettati dall'API (`NEARBY_RADIUS_KM`). */
export const RADIUS_RANGE = { min: NEARBY_RADIUS_KM.min, max: NEARBY_RADIUS_KM.max, step: 1 } as const;
export const CONSUMPTION_RANGE = { min: 3, max: 40 } as const;

export const FUEL_OPTIONS: ReadonlyArray<{ value: SearchFuelType; label: string }> = [
  { value: "benzina", label: "Benzina" },
  { value: "diesel", label: "Diesel" },
  { value: "gpl", label: "GPL" },
  { value: "metano", label: "Metano" },
];

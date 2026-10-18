import { CONSUMPTION_RANGE } from "./defaults";

/**
 * Unità con cui l'utente VEDE e modifica il consumo. È solo presentazione: il modello interno, il `localStorage`
 * (`consumptionKmPerLiter`), la richiesta all'API e `packages/core` sono sempre in km/L.
 */
export type ConsumptionUnit = "kmpl" | "l100km";

export const CONSUMPTION_UNITS: ReadonlyArray<{ value: ConsumptionUnit; label: string }> = [
  { value: "kmpl", label: "km/L" },
  { value: "l100km", label: "L/100 km" },
];

/** Etichetta dell'unità, sempre mostrata accanto al valore. */
export const unitLabel = (unit: ConsumptionUnit): string => CONSUMPTION_UNITS.find((u) => u.value === unit)!.label;

/** Slider delle Impostazioni in L/100 km: l'equivalente di 40 e 3 km/L (2,5 e 33,3). */
export const L100_SLIDER = { min: 2.5, max: 33.3, step: 0.1 } as const;
/** Passo dello stepper per-ricerca: 0,5 km/L oppure 0,5 L/100 km. */
export const STEPPER_STEP = 0.5;

const round1 = (value: number) => Math.round(value * 10) / 10;
const round2 = (value: number) => Math.round(value * 100) / 100;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** km/L → L/100 km, un decimale (15 → 6,7). */
export const kmplToL100 = (kmpl: number): number => round1(100 / kmpl);
/** L/100 km → km/L, arrotondato a 2 decimali (6,7 → 14,93). */
export const l100ToKmpl = (l100: number): number => round2(100 / l100);

/** Il valore interno (km/L) nell'unità scelta. */
export const toDisplay = (kmpl: number, unit: ConsumptionUnit): number => (unit === "kmpl" ? kmpl : kmplToL100(kmpl));
/** Un valore nell'unità scelta, riportato a km/L (il modello interno). */
export const fromDisplay = (value: number, unit: ConsumptionUnit): number => (unit === "kmpl" ? value : l100ToKmpl(value));

/** Intervallo del valore mostrato nell'unità scelta. La validazione resta sempre quella di 3–40 km/L. */
export const displayRange = (unit: ConsumptionUnit): { min: number; max: number } =>
  unit === "kmpl" ? { min: CONSUMPTION_RANGE.min, max: CONSUMPTION_RANGE.max } : { min: L100_SLIDER.min, max: L100_SLIDER.max };

const decimal1 = new Intl.NumberFormat("it-IT", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
/** Valore nell'unità scelta con un decimale e virgola italiana: «15,0» o «6,7» (senza unità). */
export const formatConsumption = (kmpl: number, unit: ConsumptionUnit): string => decimal1.format(toDisplay(kmpl, unit));
/** Valore con unità: «15,0 km/L» o «6,7 L/100 km». */
export const formatConsumptionWithUnit = (kmpl: number, unit: ConsumptionUnit): string => `${formatConsumption(kmpl, unit)} ${unitLabel(unit)}`;

/** Le tre tacche sotto lo slider (km/L), con il loro nome. In L/100 km diventano 12,5 · 6,7 · 3,3. */
export const CONSUMPTION_MARKS: ReadonlyArray<{ kmpl: number; name: string }> = [
  { kmpl: 8, name: "Sport" },
  { kmpl: 15, name: "Medio" },
  { kmpl: 30, name: "Eco" },
];

/**
 * Un passo dello stepper nell'unità scelta, restituito come km/L (2 decimali in L/100 km). Il passo è sul valore
 * MOSTRATO (0,5 km/L o 0,5 L/100 km) e il risultato resta dentro l'intervallo dell'unità, quindi sempre in 3–40 km/L.
 */
export function stepConsumption(kmpl: number, unit: ConsumptionUnit, direction: 1 | -1): number {
  const { min, max } = displayRange(unit);
  const next = clamp(round1(toDisplay(kmpl, unit) + direction * STEPPER_STEP), min, max);
  return clamp(unit === "kmpl" ? round2(next) : l100ToKmpl(next), CONSUMPTION_RANGE.min, CONSUMPTION_RANGE.max);
}

/** Lo stepper può ancora muoversi in quella direzione? */
export function canStepConsumption(kmpl: number, unit: ConsumptionUnit, direction: 1 | -1): boolean {
  const { min, max } = displayRange(unit);
  const shown = toDisplay(kmpl, unit);
  return direction === 1 ? shown < max : shown > min;
}

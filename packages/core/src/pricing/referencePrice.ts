/**
 * Prezzo di riferimento della tratta (P_avg) — cascata a 3 livelli, sempre
 * calcolata per la specifica combinazione carburante + modalità già scelta a
 * monte (i campioni contengono il prezzo effettivamente usato per stazione):
 *
 *   1. on_route : mediana delle stazioni con distanza laterale one-way <= 0.5 km
 *   2. corridor : se il campione on-route ha < N_MIN stazioni, mediana di tutte
 *                 le stazioni del corridoio (raggio = deviazione massima scelta)
 *   3. national : se anche il corridoio ha < N_MIN stazioni, mediana nazionale
 *
 * Si usa la mediana (non la media) per la robustezza agli outlier, es. una
 * singola stazione autostradale molto cara.
 */

/** Campione minimo per ogni livello della cascata. */
export const N_MIN = 3;

/** Soglia "sul percorso", one-way, fissa e indipendente dallo slider dell'utente. */
export const ON_ROUTE_THRESHOLD_KM = 0.5;

export type ReferencePriceLevel = "on_route" | "corridor" | "national";

export interface PriceSample {
  /** Distanza laterale one-way della stazione dal tracciato, km. */
  lateralDistanceKm: number;
  /** Prezzo effettivo usato per la stazione (già risolto Self/Servito), €/L. */
  price: number;
}

export interface NationalPrice {
  /** Mediana nazionale per la stessa combinazione carburante/modalità, €/L. */
  median: number;
  sampleSize: number;
}

export interface ReferencePrice {
  value: number;
  level: ReferencePriceLevel;
  sampleSize: number;
}

export function median(values: readonly number[]): number {
  if (values.length === 0) {
    throw new RangeError("median: serve almeno un valore");
  }
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/**
 * @param corridorSamples una voce per stazione, tutte entro il raggio del corridoio
 * @param national mediana nazionale (null se non disponibile)
 * @returns null solo se nessun livello ha dati sufficienti
 */
export function computeReferencePrice(
  corridorSamples: readonly PriceSample[],
  national: NationalPrice | null,
): ReferencePrice | null {
  const onRoute = corridorSamples.filter((sample) => sample.lateralDistanceKm <= ON_ROUTE_THRESHOLD_KM);
  if (onRoute.length >= N_MIN) {
    return { value: median(onRoute.map((s) => s.price)), level: "on_route", sampleSize: onRoute.length };
  }

  if (corridorSamples.length >= N_MIN) {
    return {
      value: median(corridorSamples.map((s) => s.price)),
      level: "corridor",
      sampleSize: corridorSamples.length,
    };
  }

  if (national && national.sampleSize >= N_MIN && Number.isFinite(national.median)) {
    return { value: national.median, level: "national", sampleSize: national.sampleSize };
  }

  return null;
}

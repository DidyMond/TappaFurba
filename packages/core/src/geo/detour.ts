/**
 * Deviazione = extra reale di A→stazione→B rispetto ad A→B (stessa definizione
 * del D_detour/T_detour della formula S_net e dello slider `maxDetourKm`).
 */

/**
 * Rapporto tipico tra distanza su strada e distanza in linea d'aria per
 * percorsi extraurbani. Ipotesi documentata, non un dato misurato: serve solo
 * al ranking iniziale, poi sostituita dal routing reale per la top-N.
 */
export const PROXY_CIRCUITY_FACTOR = 1.25;

/** Velocità media assunta sul tratto di deviazione (strade locali), km/h. */
export const PROXY_DETOUR_SPEED_KMH = 40;

export interface Detour {
  km: number;
  minutes: number;
}

/**
 * Stima proxy: si esce dal tracciato nel punto più vicino, si raggiunge la
 * stazione e si rientra nello stesso punto (andata e ritorno = 2 × distanza
 * laterale), corretta per la tortuosità stradale.
 */
export function estimateProxyDetour(lateralDistanceKm: number): Detour {
  if (!Number.isFinite(lateralDistanceKm) || lateralDistanceKm < 0) {
    throw new RangeError(`lateralDistanceKm deve essere >= 0 (ricevuto ${lateralDistanceKm})`);
  }
  const km = 2 * lateralDistanceKm * PROXY_CIRCUITY_FACTOR;
  return { km, minutes: (km / PROXY_DETOUR_SPEED_KMH) * 60 };
}

export interface RouteMetrics {
  distanceKm: number;
  durationMinutes: number;
}

/**
 * Il percorso diretto del provider è il più VELOCE, non il più corto: A→S→B può
 * passare per strade locali più brevi in km ma più lente (caso reale: −2,5 km e
 * +2,9 min). Il solo `max(0, ·)` su km e minuti separati produceva allora
 * «+0,0 km (+3 min)», incoerente per una stazione fuori dal tracciato.
 *
 * Per raggiungere una stazione a distanza laterale L dal tracciato servono
 * almeno L all'andata e L al ritorno in linea retta: 2·L è quindi il minimo
 * fisico dei km extra, anche quando il confronto tra i due percorsi dà meno.
 */
export const MIN_DETOUR_KM_PER_LATERAL_KM = 2;

/**
 * Velocità minima plausibile sul tratto di deviazione, km/h: limita i minuti
 * extra in rapporto ai km extra (con km ≈ 0 restano entro `DETOUR_MINUTES_TOLERANCE`).
 */
export const MIN_DETOUR_SPEED_KMH = 10;

/** Scarto ammesso, in minuti, tra minuti extra e km extra (svolte, semafori, snapping). */
export const DETOUR_MINUTES_TOLERANCE = 1;

/**
 * Deviazione reale da due risposte di routing, resa coerente:
 * - i km non scendono sotto il minimo geometrico (`2 × lateralDistanceKm`) né sotto zero;
 * - i minuti non scendono sotto zero e non superano i km extra percorsi alla velocità minima,
 *   (con un minimo pari alla tolleranza): una deviazione di ~0 km non può costare minuti.
 */
export function computeRoutedDetour(direct: RouteMetrics, viaStation: RouteMetrics, lateralDistanceKm = 0): Detour {
  if (!Number.isFinite(lateralDistanceKm) || lateralDistanceKm < 0) {
    throw new RangeError(`lateralDistanceKm deve essere >= 0 (ricevuto ${lateralDistanceKm})`);
  }
  const km = Math.max(0, viaStation.distanceKm - direct.distanceKm, MIN_DETOUR_KM_PER_LATERAL_KM * lateralDistanceKm);
  const maxMinutes = Math.max(DETOUR_MINUTES_TOLERANCE, (km / MIN_DETOUR_SPEED_KMH) * 60);
  const minutes = Math.min(Math.max(0, viaStation.durationMinutes - direct.durationMinutes), maxMinutes);
  return { km, minutes };
}

import { PROXY_CIRCUITY_FACTOR, PROXY_DETOUR_SPEED_KMH } from "@tappafurba/core";

/**
 * Calibrazione del proxy del giro (`estimateProxyDetour`): confronta la stima della fase 1 con il giro reale misurato dal
 * routing. Funzioni pure, usate dallo script `scripts/calibrate-nearby-proxy.ts` (che fa le misure vere) e provate dai test
 * senza alcuna chiamata di rete.
 */
export interface CalibrationSample {
  /** Tipo di zona del punto di partenza, come lo dichiara chi misura (es. «urbano», «extraurbano»). */
  area: string;
  /** Distanza in linea d'aria punto → stazione, km (quella che usa il proxy). */
  euclidKm: number;
  /** Giro reale punto → stazione → punto, km. */
  realKm: number;
  /** Durata reale del giro, minuti. */
  realMinutes: number;
}

export interface RatioStats {
  count: number;
  /** Quartili del rapporto «giro reale / (2 × linea d'aria)»: 1,25 è ciò che assume il proxy. */
  p25: number;
  median: number;
  p75: number;
  /** Scarto sistematico della stima sui km: (mediana − fattore) / mediana. Positivo = il proxy sottostima il giro vero. */
  proxyKmGap: number;
  /** Rapporto mediano «minuti reali / minuti del proxy» (il proxy assume 40 km/h sul giro stimato). */
  medianTimeRatio: number;
  /** Quota di campioni in cui il giro reale supera la stima. */
  shareUnderestimated: number;
  /** Velocità media reale mediana sul giro (km/h): il proxy assume `PROXY_DETOUR_SPEED_KMH`. */
  medianSpeedKmh: number;
}

export interface CalibrationReport {
  overall: RatioStats | null;
  byArea: Record<string, RatioStats>;
  byBand: Array<{ label: string; stats: RatioStats | null }>;
}

/** Fasce di distanza in linea d'aria (km), come lo script le campiona: [da, a). */
export const DEFAULT_BANDS: ReadonlyArray<readonly [number, number]> = [
  [0.3, 2],
  [2, 4],
  [4, 7],
  [7, 10.01],
];

/** Percentile con interpolazione lineare su valori già ordinati. */
export function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) throw new RangeError("percentile: serve almeno un valore");
  const position = (sorted.length - 1) * Math.min(1, Math.max(0, p));
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  return sorted[lower]! + (sorted[upper]! - sorted[lower]!) * (position - lower);
}

/** Rapporto «giro reale / (2 × linea d'aria)» di un campione: l'equivalente del fattore del proxy. */
export function realFactor(sample: CalibrationSample): number {
  if (!(sample.euclidKm > 0)) throw new RangeError("realFactor: la distanza deve essere > 0");
  return sample.realKm / (2 * sample.euclidKm);
}

export function summarizeRatios(samples: readonly CalibrationSample[], factor = PROXY_CIRCUITY_FACTOR): RatioStats | null {
  if (samples.length === 0) return null;
  const ratios = samples.map(realFactor).sort((a, b) => a - b);
  const timeRatios = samples
    .map((s) => s.realMinutes / (((2 * s.euclidKm * factor) / PROXY_DETOUR_SPEED_KMH) * 60))
    .sort((a, b) => a - b);
  const median = percentile(ratios, 0.5);
  return {
    count: samples.length,
    p25: percentile(ratios, 0.25),
    median,
    p75: percentile(ratios, 0.75),
    proxyKmGap: (median - factor) / median,
    medianTimeRatio: percentile(timeRatios, 0.5),
    shareUnderestimated: ratios.filter((r) => r > factor).length / ratios.length,
    medianSpeedKmh: percentile(
      samples.map((s) => (s.realKm / s.realMinutes) * 60).sort((a, b) => a - b),
      0.5,
    ),
  };
}

export interface WhatIf {
  /** Fattore di tortuosità ipotizzato (km del giro = 2 × linea d'aria × fattore). */
  factor: number;
  /** Velocità ipotizzata sul giro, km/h (minuti = km / velocità). */
  speedKmh: number;
}

export interface WhatIfResult {
  /** Errore relativo mediano con segno della stima sui km: (stima − reale) / reale. Negativo = sottostima. */
  medianKmError: number;
  /** Idem sui minuti. */
  medianMinutesError: number;
  /** Errore assoluto mediano sul costo del giro in € (carburante + tempo), con i parametri indicati. */
  medianCostErrorEuro: number;
}

/**
 * Che errore avrebbe una stima con un altro fattore e un'altra velocità, sugli stessi campioni. Il costo del giro è quello
 * del risparmio netto: km × (prezzo / consumo) + minuti × valore del tempo.
 */
export function evaluateWhatIf(
  samples: readonly CalibrationSample[],
  whatIf: WhatIf,
  cost: { fuelPricePerLiter: number; consumptionKmPerLiter: number; valueOfTimePerMinute: number } = {
    fuelPricePerLiter: 1.9,
    consumptionKmPerLiter: 15,
    valueOfTimePerMinute: 0.15,
  },
): WhatIfResult | null {
  if (samples.length === 0) return null;
  const perKm = cost.fuelPricePerLiter / cost.consumptionKmPerLiter;
  const kmErrors: number[] = [];
  const minutesErrors: number[] = [];
  const costErrors: number[] = [];
  for (const s of samples) {
    const km = 2 * s.euclidKm * whatIf.factor;
    const minutes = (km / whatIf.speedKmh) * 60;
    kmErrors.push((km - s.realKm) / s.realKm);
    minutesErrors.push((minutes - s.realMinutes) / s.realMinutes);
    costErrors.push(Math.abs(km * perKm + minutes * cost.valueOfTimePerMinute - (s.realKm * perKm + s.realMinutes * cost.valueOfTimePerMinute)));
  }
  const median = (values: number[]) => percentile(values.sort((a, b) => a - b), 0.5);
  return { medianKmError: median(kmErrors), medianMinutesError: median(minutesErrors), medianCostErrorEuro: median(costErrors) };
}

export function buildCalibrationReport(
  samples: readonly CalibrationSample[],
  options: { factor?: number; bands?: ReadonlyArray<readonly [number, number]> } = {},
): CalibrationReport {
  const factor = options.factor ?? PROXY_CIRCUITY_FACTOR;
  const areas = [...new Set(samples.map((s) => s.area))];
  return {
    overall: summarizeRatios(samples, factor),
    byArea: Object.fromEntries(areas.map((area) => [area, summarizeRatios(samples.filter((s) => s.area === area), factor)!])),
    byBand: (options.bands ?? DEFAULT_BANDS).map(([from, to]) => ({
      label: `${from}–${Math.min(to, 10)} km`,
      stats: summarizeRatios(samples.filter((s) => s.euclidKm >= from && s.euclidKm < to), factor),
    })),
  };
}

/** Soglia oltre la quale lo scarto sistematico dei km è «rilevante» e si propone un fattore a parte. */
export const RELEVANT_GAP = 0.15;

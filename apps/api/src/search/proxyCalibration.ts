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

/**
 * I campioni entro `maxKm` di linea d'aria dal punto: l'uso tipico di «Intorno a me» (raggio predefinito 5 km). Il totale pesa
 * allo stesso modo tutte le fasce fino a 10 km, quindi sull'uso tipico conviene guardare anche questo sottoinsieme.
 */
export function withinDistance(samples: readonly CalibrationSample[], maxKm: number): CalibrationSample[] {
  return samples.filter((s) => s.euclidKm <= maxKm);
}

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

export interface CostParameters {
  fuelPricePerLiter: number;
  consumptionKmPerLiter: number;
  valueOfTimePerMinute: number;
}

const pct = (x: number) => `${x >= 0 ? "+" : ""}${Math.round(x * 100)}%`;
const comma = (x: number, digits = 2) => x.toFixed(digits).replace(".", ",");

function ratioLine(label: string, s: RatioStats | null): string {
  return s
    ? `${label.padEnd(16)} n=${String(s.count).padStart(3)} | giro vero / (2×linea d'aria): p25 ${s.p25.toFixed(2)} · mediana ${s.median.toFixed(2)} · p75 ${s.p75.toFixed(2)} | scarto km del proxy ${pct(s.proxyKmGap).padStart(5)} | minuti vero/proxy ${s.medianTimeRatio.toFixed(2)} (velocità reale mediana ${s.medianSpeedKmh.toFixed(0)} km/h) | giro > stima nel ${Math.round(s.shareUnderestimated * 100)}%`
    : `${label.padEnd(16)} nessun campione`;
}

/**
 * Il testo del report dello script di calibrazione (una riga per elemento): totale, solo l'uso tipico (entro `maxKm`), per zona
 * e per fascia, confronto «che errore avrebbe una stima diversa» e verdetto. Il verdetto guarda l'uso tipico, non il totale.
 */
export function formatCalibrationReport(samples: readonly CalibrationSample[], options: { maxKm: number; cost: CostParameters }): string[] {
  const { maxKm, cost } = options;
  const report = buildCalibrationReport(samples);
  const typical = withinDistance(samples, maxKm);
  const typicalStats = summarizeRatios(typical);
  const lines = [
    `\n=== Calibrazione del proxy (il proxy assume ${PROXY_CIRCUITY_FACTOR} e ${PROXY_DETOUR_SPEED_KMH} km/h) ===`,
    ratioLine("TOTALE", report.overall),
    ratioLine(`entro ${maxKm} km`, typicalStats),
    ...Object.entries(report.byArea).map(([area, stats]) => ratioLine(area, stats)),
    "--- per fascia di distanza in linea d'aria",
    ...report.byBand.map((band) => ratioLine(band.label, band.stats)),
  ];
  if (!report.overall || !typicalStats) return lines;

  lines.push(
    `\n--- Che errore avrebbe una stima diversa (costo del giro con benzina ${comma(cost.fuelPricePerLiter)} €/L, ${cost.consumptionKmPerLiter} km/L, ${comma(cost.valueOfTimePerMinute)} €/min)`,
  );
  const candidates = (stats: RatioStats) => [
    { name: "attuale", factor: PROXY_CIRCUITY_FACTOR, speedKmh: PROXY_DETOUR_SPEED_KMH },
    { name: "solo km", factor: Number(stats.median.toFixed(2)), speedKmh: PROXY_DETOUR_SPEED_KMH },
    { name: "km e velocità", factor: Number(stats.median.toFixed(2)), speedKmh: Math.round(stats.medianSpeedKmh) },
  ];
  const sets: Array<[string, readonly CalibrationSample[], RatioStats]> = [
    ["TOTALE", samples, report.overall],
    [`entro ${maxKm} km`, typical, typicalStats],
  ];
  for (const [label, set, stats] of sets) {
    lines.push(`[${label}]`);
    for (const c of candidates(stats)) {
      const r = evaluateWhatIf(set, c, cost);
      if (r)
        lines.push(
          `  ${c.name.padEnd(14)} fattore ${c.factor.toFixed(2)} a ${String(c.speedKmh).padStart(2)} km/h | errore mediano km ${pct(r.medianKmError).padStart(5)} · minuti ${pct(r.medianMinutesError).padStart(5)} | errore mediano sul costo del giro ${r.medianCostErrorEuro.toFixed(2)} €`,
        );
    }
  }

  const current = evaluateWhatIf(typical, { factor: PROXY_CIRCUITY_FACTOR, speedKmh: PROXY_DETOUR_SPEED_KMH }, cost)!;
  const parts = `km ${pct(current.medianKmError)}, minuti ${pct(current.medianMinutesError)}`;
  lines.push(
    Math.abs(current.medianKmError) > RELEVANT_GAP || Math.abs(current.medianMinutesError) > RELEVANT_GAP
      ? `\nScarto rilevante (> ${RELEVANT_GAP * 100}%) nella stima attuale, entro ${maxKm} km: ${parts}. Il proxy sottostima il giro. ` +
          `Valori mediani misurati: fattore ${typicalStats.median.toFixed(2)}, velocità media del giro ${Math.round(typicalStats.medianSpeedKmh)} km/h.`
      : `\nScarto entro ${RELEVANT_GAP * 100}% entro ${maxKm} km (${parts}): i valori attuali restano adeguati.`,
  );
  return lines;
}

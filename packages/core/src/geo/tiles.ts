import type { Coordinate } from "./route";

/**
 * Griglia di riquadri per l'aggiornamento dei prezzi "in tempo reale".
 *
 * La fonte live (sito Osservaprezzi) si interroga per zona: un punto e un raggio
 * di al massimo 10 km. Dividere il territorio in riquadri fissi permette di
 * (a) riusare lo stesso riquadro tra ricerche diverse e utenti diversi (cache
 * per riquadro, non per ricerca) e (b) coprire il corridoio con poche chiamate.
 *
 * Lato del riquadro 14 km: il cerchio da 10 km centrato sul riquadro lo contiene
 * per intero (semidiagonale ≈ 9,9 km).
 */
export const TILE_SIDE_KM = 14;
/** Raggio da usare interrogando la fonte live al centro di un riquadro. */
export const TILE_QUERY_RADIUS_KM = 10;

const KM_PER_DEGREE = 111.32;
const DEG_TO_RAD = Math.PI / 180;

export interface Tile {
  /** Identificativo stabile "riga:colonna". */
  id: string;
  /** Centro del riquadro, [lon, lat]. */
  center: Coordinate;
}

const LAT_STEP_DEG = TILE_SIDE_KM / KM_PER_DEGREE;

/** Ampiezza in longitudine di un riquadro della riga data: costante per riga, così gli id sono deterministici. */
function lonStepForRow(row: number): number {
  const centerLat = (row + 0.5) * LAT_STEP_DEG;
  return TILE_SIDE_KM / (KM_PER_DEGREE * Math.cos(centerLat * DEG_TO_RAD));
}

export function tileForPoint(lon: number, lat: number): Tile {
  const row = Math.floor(lat / LAT_STEP_DEG);
  const lonStep = lonStepForRow(row);
  const col = Math.floor(lon / lonStep);
  return {
    id: `${row}:${col}`,
    center: [(col + 0.5) * lonStep, (row + 0.5) * LAT_STEP_DEG],
  };
}

/** Distanza in km tra due punti vicini (approssimazione piana, sufficiente per campionare). */
function approxDistanceKm(a: Coordinate, b: Coordinate): number {
  const meanLat = ((a[1] + b[1]) / 2) * DEG_TO_RAD;
  const dx = (b[0] - a[0]) * KM_PER_DEGREE * Math.cos(meanLat);
  const dy = (b[1] - a[1]) * KM_PER_DEGREE;
  return Math.hypot(dx, dy);
}

export interface TilesCoveringRouteOptions {
  /** Semi-larghezza del corridoio attorno al tracciato. */
  bufferKm: number;
  /** Passo massimo di campionamento lungo il tracciato (default 2 km). */
  sampleStepKm?: number;
}

/**
 * Riquadri che intersecano il corridoio (tracciato ± bufferKm), nell'ordine in
 * cui compaiono lungo il percorso, senza duplicati.
 *
 * Il tracciato viene campionato ogni `sampleStepKm`; un riquadro è incluso se il
 * suo rettangolo dista al più bufferKm + sampleStepKm/2 da un campione. Poiché
 * ogni punto del tracciato dista al più sampleStepKm/2 dal campione più vicino,
 * nessun riquadro del corridoio può restare scoperto (si può solo sovra-coprire
 * di poco, che costa una chiamata in più ma non falsa i risultati).
 */
export function tilesCoveringRoute(route: readonly Coordinate[], options: TilesCoveringRouteOptions): Tile[] {
  if (route.length === 0) return [];
  const step = options.sampleStepKm ?? 2;
  const reachKm = options.bufferKm + step / 2;
  const seen = new Map<string, Tile>();

  const visit = (point: Coordinate) => {
    const [lon, lat] = point;
    const cosLat = Math.cos(lat * DEG_TO_RAD);
    const latSpanDeg = reachKm / KM_PER_DEGREE;
    const rowMin = Math.floor((lat - latSpanDeg) / LAT_STEP_DEG);
    const rowMax = Math.floor((lat + latSpanDeg) / LAT_STEP_DEG);
    for (let row = rowMin; row <= rowMax; row++) {
      const lonStep = lonStepForRow(row);
      const lonSpanDeg = reachKm / (KM_PER_DEGREE * Math.cos(Math.max(Math.abs(row), Math.abs(row + 1)) * LAT_STEP_DEG * DEG_TO_RAD));
      const colMin = Math.floor((lon - lonSpanDeg) / lonStep);
      const colMax = Math.floor((lon + lonSpanDeg) / lonStep);
      const lat0 = row * LAT_STEP_DEG;
      const lat1 = lat0 + LAT_STEP_DEG;
      const dyKm = Math.max(lat0 - lat, 0, lat - lat1) * KM_PER_DEGREE;
      for (let col = colMin; col <= colMax; col++) {
        const lon0 = col * lonStep;
        const lon1 = lon0 + lonStep;
        const dxKm = Math.max(lon0 - lon, 0, lon - lon1) * KM_PER_DEGREE * cosLat;
        if (Math.hypot(dxKm, dyKm) > reachKm) continue;
        const id = `${row}:${col}`;
        if (!seen.has(id)) seen.set(id, { id, center: [lon0 + lonStep / 2, lat0 + LAT_STEP_DEG / 2] });
      }
    }
  };

  let previous = route[0]!;
  visit(previous);
  for (let i = 1; i < route.length; i++) {
    const current = route[i]!;
    const segmentKm = approxDistanceKm(previous, current);
    const pieces = Math.max(1, Math.ceil(segmentKm / step));
    for (let k = 1; k <= pieces; k++) {
      const t = k / pieces;
      visit([previous[0] + (current[0] - previous[0]) * t, previous[1] + (current[1] - previous[1]) * t]);
    }
    previous = current;
  }

  return [...seen.values()];
}

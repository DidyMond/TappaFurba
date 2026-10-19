import { lineString, point } from "@turf/helpers";
import length from "@turf/length";
import nearestPointOnLine from "@turf/nearest-point-on-line";
import simplify from "@turf/simplify";

/** [longitudine, latitudine], stesso ordine di GeoJSON. */
export type Coordinate = [lon: number, lat: number];

/**
 * Tolleranza Douglas-Peucker in gradi (~50 m). Sulle rotte reali riduce
 * drasticamente i vertici (Milano→Bologna: 1510 → ~75) con errore
 * trascurabile rispetto alla scala del corridoio (km), e rende la
 * proiezione delle stazioni ~7 volte più veloce.
 */
export const DEFAULT_SIMPLIFY_TOLERANCE_DEG = 0.0005;

/**
 * Tolleranza per il tracciato che si DISEGNA sulla mappa: 0,00001° (~1 m). Quella da 50 m serve ai calcoli sul corridoio e
 * mostrata in mappa taglia le curve e i tratti brevi, così la linea non segue la strada (visibile da zoom 15). A 1 m resta
 * invisibile anche a zoom 18 e costa poco: Milano→Bologna passa da 1430 a ~520 punti (≈10 KB).
 */
export const DISPLAY_SIMPLIFY_TOLERANCE_DEG = 0.00001;

function toLine(coords: readonly Coordinate[]) {
  if (coords.length < 2) {
    throw new RangeError("Una rotta richiede almeno 2 coordinate");
  }
  return lineString(coords.map((c) => [c[0], c[1]]));
}

export function simplifyRoute(
  coords: readonly Coordinate[],
  toleranceDeg: number = DEFAULT_SIMPLIFY_TOLERANCE_DEG,
): Coordinate[] {
  const line = toLine(coords);
  if (coords.length < 3) {
    return line.geometry.coordinates as Coordinate[];
  }
  const simplified = simplify(line, { tolerance: toleranceDeg, highQuality: false });
  return simplified.geometry.coordinates as Coordinate[];
}

export function routeLengthKm(coords: readonly Coordinate[]): number {
  return length(toLine(coords), { units: "kilometers" });
}

/** WKT LINESTRING (lon lat), 6 decimali (~0.1 m), per le query PostGIS. */
export function routeToWkt(coords: readonly Coordinate[]): string {
  if (coords.length < 2) {
    throw new RangeError("Una rotta richiede almeno 2 coordinate");
  }
  return `LINESTRING(${coords.map(([lon, lat]) => `${lon.toFixed(6)} ${lat.toFixed(6)}`).join(", ")})`;
}

/** WKT POINT (lon lat), 6 decimali, per le query PostGIS attorno a un punto (modalità «Intorno a me»). */
export function pointToWkt([lon, lat]: Coordinate): string {
  return `POINT(${lon.toFixed(6)} ${lat.toFixed(6)})`;
}

/** Raggio medio terrestre usato da turf (6371008,8 m): le distanze coincidono con quelle del resto del calcolo. */
const EARTH_RADIUS_KM = 6371.0088;

/** Distanza in linea d'aria tra due punti (haversine), km. */
export function distanceKm(a: Coordinate, b: Coordinate): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLon = toRad(b[0] - a[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

export interface RouteProjection {
  /** Distanza one-way minima del punto dal tracciato, km. */
  lateralDistanceKm: number;
  /** Posizione del punto proiettato, in km dall'origine lungo il tracciato. */
  alongRouteKm: number;
}

/**
 * Costruisce il proiettore per ogni rotta, poi lo si applica a molte stazioni.
 *
 * `nearestPointOnLine` di turf è geodetico ma O(vertici) per ogni punto
 * (misurato: 4.3 ms/stazione su 1510 vertici → ~10 s per 2400 stazioni su una
 * rotta di 1600 km). Qui una scansione planare economica (proiezione
 * equirettangolare locale) individua il segmento più vicino, e turf calcola
 * distanza e posizione esatte solo su quel segmento. La scansione planare può
 * sbagliare segmento solo in caso di quasi-parità, con differenze di metri.
 */
export function createRouteProjector(coords: readonly Coordinate[]): (target: Coordinate) => RouteProjection {
  toLine(coords); // valida: almeno 2 coordinate
  const segmentCount = coords.length - 1;

  const lons = Float64Array.from(coords, (c) => c[0]);
  const lats = Float64Array.from(coords, (c) => c[1]);

  // Km cumulati a ogni vertice, per convertire la posizione sul segmento in posizione lungo la rotta.
  const cumulativeKm = new Float64Array(coords.length);
  for (let i = 0; i < segmentCount; i++) {
    cumulativeKm[i + 1] = cumulativeKm[i]! + length(lineString([coords[i]!, coords[i + 1]!]), { units: "kilometers" });
  }

  return (target) => {
    const [targetLon, targetLat] = target;
    const lonScale = Math.cos((targetLat * Math.PI) / 180);

    let bestSegment = 0;
    let bestDistanceSq = Number.POSITIVE_INFINITY;
    for (let i = 0; i < segmentCount; i++) {
      const ax = (lons[i]! - targetLon) * lonScale;
      const ay = lats[i]! - targetLat;
      const dx = (lons[i + 1]! - targetLon) * lonScale - ax;
      const dy = lats[i + 1]! - targetLat - ay;
      const lengthSq = dx * dx + dy * dy;
      const t = lengthSq === 0 ? 0 : Math.min(1, Math.max(0, -(ax * dx + ay * dy) / lengthSq));
      const px = ax + t * dx;
      const py = ay + t * dy;
      const distanceSq = px * px + py * py;
      if (distanceSq < bestDistanceSq) {
        bestDistanceSq = distanceSq;
        bestSegment = i;
      }
    }

    const segment = lineString([coords[bestSegment]!, coords[bestSegment + 1]!]);
    const nearest = nearestPointOnLine(segment, point([targetLon, targetLat]), { units: "kilometers" });
    return {
      lateralDistanceKm: nearest.properties.dist ?? 0,
      alongRouteKm: cumulativeKm[bestSegment]! + (nearest.properties.location ?? 0),
    };
  };
}

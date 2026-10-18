import type { Coordinate } from "@tappafurba/core";
import type { LonLat } from "@tappafurba/shared";
import type { RouteOptions, RouteResult, RoutingProvider } from "./RoutingProvider";

export interface MockRoutingProviderOptions {
  /** Rapporto strada/linea d'aria applicato alla distanza. */
  circuity?: number;
  speedKmh?: number;
  /** Distanza massima tra due punti consecutivi della geometria generata, km. */
  maxSegmentKm?: number;
}

function haversineKm(a: LonLat, b: LonLat): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371.0088 * Math.asin(Math.sqrt(h));
}

/**
 * Routing deterministico e a zero rete: collega i waypoint con segmenti
 * rettilinei interpolati. Serve a sviluppare e testare l'intera pipeline di
 * ricerca senza chiavi Mapbox; i valori NON rappresentano strade reali.
 */
export class MockRoutingProvider implements RoutingProvider {
  /** Storico delle richieste ricevute, utile per le asserzioni nei test. */
  readonly calls: LonLat[][] = [];
  /** Opzioni ricevute da ogni richiesta, nello stesso ordine di `calls`. */
  readonly callOptions: RouteOptions[] = [];

  private readonly circuity: number;
  private readonly speedKmh: number;
  private readonly maxSegmentKm: number;

  constructor(options: MockRoutingProviderOptions = {}) {
    this.circuity = options.circuity ?? 1.2;
    this.speedKmh = options.speedKmh ?? 70;
    this.maxSegmentKm = options.maxSegmentKm ?? 5;
  }

  async getRoute(waypoints: readonly LonLat[], options: RouteOptions = {}): Promise<RouteResult | null> {
    if (waypoints.length < 2) {
      throw new RangeError("Servono almeno 2 waypoint");
    }
    this.calls.push([...waypoints]);
    this.callOptions.push({ ...options });

    const geometry: Coordinate[] = [[waypoints[0]!.lon, waypoints[0]!.lat]];
    let crowKm = 0;

    for (let i = 1; i < waypoints.length; i++) {
      const from = waypoints[i - 1]!;
      const to = waypoints[i]!;
      const legKm = haversineKm(from, to);
      crowKm += legKm;

      const steps = Math.max(1, Math.ceil(legKm / this.maxSegmentKm));
      for (let step = 1; step <= steps; step++) {
        const t = step / steps;
        geometry.push([from.lon + (to.lon - from.lon) * t, from.lat + (to.lat - from.lat) * t]);
      }
    }

    const distanceKm = crowKm * this.circuity;
    return { distanceKm, durationMinutes: (distanceKm / this.speedKmh) * 60, geometry };
  }
}

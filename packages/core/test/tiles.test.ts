import { describe, expect, it } from "vitest";
import { TILE_QUERY_RADIUS_KM, tileForPoint, tilesCoveringRoute, type Coordinate } from "../src";

const KM_PER_DEGREE = 111.32;

function distanceKm(a: Coordinate, b: Coordinate): number {
  const meanLat = (((a[1] + b[1]) / 2) * Math.PI) / 180;
  return Math.hypot((b[0] - a[0]) * KM_PER_DEGREE * Math.cos(meanLat), (b[1] - a[1]) * KM_PER_DEGREE);
}

describe("tileForPoint", () => {
  it("è deterministico e punti vicini cadono nello stesso riquadro", () => {
    const a = tileForPoint(9.0548, 45.686);
    expect(tileForPoint(9.0548, 45.686)).toEqual(a);
    expect(tileForPoint(9.0549, 45.6861).id).toBe(a.id);
  });

  it("il cerchio di query (10 km) dal centro contiene ogni punto del riquadro, a varie latitudini", () => {
    for (const [lon, lat] of [
      [13.36, 38.11], // Palermo
      [9.19, 45.46], // Milano
      [7.68, 45.07], // Torino
      [12.49, 41.9], // Roma
      [16.87, 41.12], // Bari
    ] as Coordinate[]) {
      const tile = tileForPoint(lon, lat);
      let farthest = 0;
      // Scansione fine di punti dentro lo stesso riquadro attorno al punto di prova.
      for (let dx = -0.2; dx <= 0.2; dx += 0.01) {
        for (let dy = -0.15; dy <= 0.15; dy += 0.01) {
          const candidate: Coordinate = [lon + dx, lat + dy];
          if (tileForPoint(candidate[0], candidate[1]).id !== tile.id) continue;
          farthest = Math.max(farthest, distanceKm(tile.center, candidate));
        }
      }
      expect(farthest).toBeGreaterThan(0);
      expect(farthest).toBeLessThanOrEqual(TILE_QUERY_RADIUS_KM);
    }
  });
});

describe("tilesCoveringRoute", () => {
  const line = (a: Coordinate, b: Coordinate, n: number): Coordinate[] =>
    Array.from({ length: n + 1 }, (_, i) => [a[0] + ((b[0] - a[0]) * i) / n, a[1] + ((b[1] - a[1]) * i) / n] as Coordinate);

  it("percorso vuoto → nessun riquadro", () => {
    expect(tilesCoveringRoute([], { bufferKm: 5 })).toEqual([]);
  });

  it("nessun duplicato e ordine lungo il percorso (il primo riquadro contiene la partenza)", () => {
    const route = line([9.204, 45.4864], [11.3426, 44.5058], 40);
    const tiles = tilesCoveringRoute(route, { bufferKm: 5 });
    expect(new Set(tiles.map((t) => t.id)).size).toBe(tiles.length);
    const start = tileForPoint(route[0]![0], route[0]![1]);
    expect(tiles.slice(0, 9).some((t) => t.id === start.id)).toBe(true);
  });

  it("ogni punto entro bufferKm dal tracciato cade in un riquadro restituito", () => {
    const route = line([9.204, 45.4864], [11.3426, 44.5058], 40);
    for (const bufferKm of [1, 5, 15]) {
      const tiles = new Set(tilesCoveringRoute(route, { bufferKm }).map((t) => t.id));
      const missing: string[] = [];
      // Punti di prova a distanza laterale nota dal tracciato (spostamenti N-S e E-O).
      for (let i = 0; i <= 200; i++) {
        const t = i / 200;
        const base: Coordinate = [9.204 + (11.3426 - 9.204) * t, 45.4864 + (44.5058 - 45.4864) * t];
        const cosLat = Math.cos((base[1] * Math.PI) / 180);
        for (const [dx, dy] of [
          [bufferKm, 0],
          [-bufferKm, 0],
          [0, bufferKm],
          [0, -bufferKm],
          [0, 0],
        ] as Array<[number, number]>) {
          const p: Coordinate = [base[0] + (dx * 0.98) / (KM_PER_DEGREE * cosLat), base[1] + (dy * 0.98) / KM_PER_DEGREE];
          const id = tileForPoint(p[0], p[1]).id;
          if (!tiles.has(id)) missing.push(id);
        }
      }
      expect(missing).toEqual([]);
    }
  });

  it("il numero di riquadri cresce con il corridoio ma resta contenuto (Milano→Bologna, ±5 km)", () => {
    const route = line([9.204, 45.4864], [11.3426, 44.5058], 40);
    const narrow = tilesCoveringRoute(route, { bufferKm: 1 }).length;
    const wide = tilesCoveringRoute(route, { bufferKm: 5 }).length;
    expect(narrow).toBeLessThanOrEqual(wide);
    expect(wide).toBeLessThan(45);
  });

  it("segmenti molto lunghi (due soli vertici) vengono campionati comunque", () => {
    const tiles = tilesCoveringRoute([[9.204, 45.4864], [11.3426, 44.5058]], { bufferKm: 2 });
    // ~200 km / 14 km per riquadro: servono più riquadri che i soli due estremi.
    expect(tiles.length).toBeGreaterThan(12);
  });
});

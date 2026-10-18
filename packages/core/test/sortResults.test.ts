import type { StationResult } from "@tappafurba/shared";
import { describe, expect, it } from "vitest";
import { createRouteProjector, sortResults, type Coordinate } from "../src";

/**
 * Le stazioni sono posizionate con coordinate reali lungo un tracciato e la loro posizione (`alongRouteKm`) e
 * distanza laterale vengono calcolate dallo stesso proiettore usato dalla ricerca: si verifica quindi che i criteri
 * di spareggio seguano davvero la geografia, non valori inventati a mano.
 *
 * Tracciato lineare: meridiano lon 9.0 da lat 45.0 a 46.0 (~111 km, verso nord). 1° di latitudine ≈ 111.19 km;
 * a lat 45 lo scostamento di 0.01° di longitudine ≈ 0.79 km.
 */
const LINE: Coordinate[] = [
  [9.0, 45.0],
  [9.0, 46.0],
];

interface Spot {
  id: number;
  lon: number;
  lat: number;
  netSavings?: number;
  detourKm?: number;
  detourSource?: "proxy" | "routing";
  /** Forza la distanza laterale (per i pareggi: geometricamente due stazioni non hanno mai la stessa distanza esatta). */
  lateralKm?: number;
}

function stationsAlong(route: Coordinate[], spots: Spot[]): StationResult[] {
  const project = createRouteProjector(route);
  return spots.map((spot) => {
    const projected = project([spot.lon, spot.lat]);
    const lateralDistanceKm = spot.lateralKm ?? projected.lateralDistanceKm;
    return {
      station: {
        id: spot.id,
        nomeImpianto: `Stazione ${spot.id}`,
        bandiera: "Test",
        gestore: "Test",
        indirizzo: "",
        comune: "",
        provincia: "",
        tipoImpianto: "stradale",
        lat: spot.lat,
        lon: spot.lon,
      },
      price: 2,
      isSelf: true,
      servitoOnly: false,
      priceUpdatedAt: "2026-09-28T10:00:00.000Z",
      lateralDistanceKm,
      alongRouteKm: projected.alongRouteKm,
      detourKm: spot.detourKm ?? 2 * lateralDistanceKm,
      detourMinutes: 1,
      detourSource: spot.detourSource ?? "proxy",
      grossSavings: 0,
      detourCost: 0,
      netSavings: spot.netSavings ?? 0,
    };
  });
}

const ids = (results: StationResult[]) => results.map((r) => r.station.id);

describe("sortResults — «Minor deviazione»: km extra crescenti", () => {
  it("ordina per km di deviazione, verificati o stimati, indipendentemente da distanza laterale e posizione", () => {
    const results = stationsAlong(LINE, [
      { id: 1, lat: 45.1, lon: 9.0, lateralKm: 0.1, detourKm: 4.2, detourSource: "routing" }, // vicina alla strada ma verificata a 4,2 km
      { id: 2, lat: 45.4, lon: 9.0, lateralKm: 2.0, detourKm: 1.1, detourSource: "routing" },
      { id: 3, lat: 45.7, lon: 9.0, lateralKm: 0.5, detourKm: 2.6, detourSource: "proxy" },
    ]);
    expect(ids(sortResults(results, "detour"))).toEqual([2, 3, 1]);
  });

  it("l'ordine non dipende da quello di arrivo dei risultati né modifica l'input", () => {
    const results = stationsAlong(LINE, [
      { id: 1, lat: 45.1, lon: 9.0, detourKm: 3 },
      { id: 2, lat: 45.4, lon: 9.0, detourKm: 1 },
      { id: 3, lat: 45.7, lon: 9.0, detourKm: 2 },
    ]);
    const before = ids(results);
    expect(ids(sortResults([...results].reverse(), "detour"))).toEqual([2, 3, 1]);
    expect(ids(sortResults(results, "detour"))).toEqual([2, 3, 1]);
    expect(ids(results)).toEqual(before);
  });
});

describe("sortResults — «Minor deviazione»: spareggi", () => {
  it("a pari km prima la stazione più vicina al tracciato (distanza laterale crescente)", () => {
    const results = stationsAlong(LINE, [
      { id: 1, lat: 45.1, lon: 9.02, lateralKm: 1.6, detourKm: 3 },
      { id: 2, lat: 45.5, lon: 9.005, lateralKm: 0.3, detourKm: 3 },
      { id: 3, lat: 45.9, lon: 9.01, lateralKm: 0.8, detourKm: 3 },
    ]);
    expect(ids(sortResults(results, "detour"))).toEqual([2, 3, 1]);
  });

  // Quattro stazioni a pari km e pari distanza laterale (0.3 km), in posizioni diverse lungo il tracciato lineare.
  const aligned: Spot[] = [
    { id: 30, lat: 45.9, lon: 9.004, lateralKm: 0.3, detourKm: 2, netSavings: 50 },
    { id: 10, lat: 45.1, lon: 9.004, lateralKm: 0.3, detourKm: 2, netSavings: 1 },
    { id: 40, lat: 45.95, lon: 9.004, lateralKm: 0.3, detourKm: 2, netSavings: 7 },
    { id: 20, lat: 45.5, lon: 9.004, lateralKm: 0.3, detourKm: 2, netSavings: 9 },
  ];

  it("a pari km e distanza laterale vale l'ordine di incontro partendo da A (tracciato lineare)", () => {
    expect(ids(sortResults(stationsAlong(LINE, aligned), "detour"))).toEqual([10, 20, 30, 40]);
  });

  it("percorrendo lo stesso tratto in senso opposto l'ordine di incontro si inverte", () => {
    expect(ids(sortResults(stationsAlong([...LINE].reverse(), aligned), "detour"))).toEqual([40, 30, 20, 10]);
  });

  it("tracciato a «U»: conta la posizione lungo il percorso, non la distanza in linea d'aria da A", () => {
    // Nord per ~56 km, poi est ~9 km, poi di nuovo sud fino quasi al punto di partenza.
    const U: Coordinate[] = [
      [9.0, 45.0],
      [9.0, 45.5],
      [9.12, 45.5],
      [9.12, 45.05],
    ];
    const results = stationsAlong(U, [
      { id: 3, lat: 45.08, lon: 9.12, lateralKm: 0.2, detourKm: 1 }, // gamba sud: vicinissima ad A in linea d'aria ma ~100 km di percorso
      { id: 1, lat: 45.2, lon: 9.0, lateralKm: 0.2, detourKm: 1 }, // gamba nord, ~22 km
      { id: 2, lat: 45.5, lon: 9.06, lateralKm: 0.2, detourKm: 1 }, // tratto est, ~57 km
    ]);
    expect(ids(sortResults(results, "detour"))).toEqual([1, 2, 3]);
    expect(results.find((r) => r.station.id === 3)!.alongRouteKm).toBeGreaterThan(
      results.find((r) => r.station.id === 2)!.alongRouteKm,
    );
  });

  it("tracciato a «U» percorso al contrario: l'ordine di incontro si inverte", () => {
    const U: Coordinate[] = [
      [9.12, 45.05],
      [9.12, 45.5],
      [9.0, 45.5],
      [9.0, 45.0],
    ];
    const results = stationsAlong(U, [
      { id: 3, lat: 45.08, lon: 9.12, lateralKm: 0.2, detourKm: 1 }, // ora è la prima
      { id: 1, lat: 45.2, lon: 9.0, lateralKm: 0.2, detourKm: 1 }, // ora è l'ultima
      { id: 2, lat: 45.5, lon: 9.06, lateralKm: 0.2, detourKm: 1 },
    ]);
    expect(ids(sortResults(results, "detour"))).toEqual([3, 2, 1]);
  });

  it("la distanza laterale ha la precedenza sull'ordine di incontro", () => {
    const results = stationsAlong(LINE, [
      { id: 1, lat: 45.1, lon: 9.0, lateralKm: 0.6, detourKm: 2 }, // incontrata prima, ma più lontana dalla strada
      { id: 2, lat: 45.8, lon: 9.0, lateralKm: 0.1, detourKm: 2 },
    ]);
    expect(ids(sortResults(results, "detour"))).toEqual([2, 1]);
  });

  it("i km hanno la precedenza sulla distanza laterale", () => {
    const results = stationsAlong(LINE, [
      { id: 1, lat: 45.1, lon: 9.0, lateralKm: 0.1, detourKm: 2.5 },
      { id: 2, lat: 45.8, lon: 9.0, lateralKm: 1.9, detourKm: 2.4 },
    ]);
    expect(ids(sortResults(results, "detour"))).toEqual([2, 1]);
  });

  it("a pari km, distanza laterale e posizione decide il risparmio netto", () => {
    const results = stationsAlong(LINE, [
      { id: 1, lat: 45.5, lon: 9.004, lateralKm: 0.3, detourKm: 2, netSavings: 1 },
      { id: 2, lat: 45.5, lon: 9.004, lateralKm: 0.3, detourKm: 2, netSavings: 9 },
      { id: 3, lat: 45.5, lon: 9.004, lateralKm: 0.3, detourKm: 2, netSavings: 5 },
    ]);
    expect(ids(sortResults(results, "detour"))).toEqual([2, 3, 1]);
  });
});

describe("sortResults — «Più conveniente»", () => {
  it("risparmio netto decrescente", () => {
    const results = stationsAlong(LINE, [
      { id: 1, lat: 45.1, lon: 9.0, netSavings: 5, detourKm: 3 },
      { id: 2, lat: 45.3, lon: 9.0, netSavings: 12, detourKm: 3 },
      { id: 3, lat: 45.5, lon: 9.0, netSavings: -1, detourKm: 0.4 },
    ]);
    expect(ids(sortResults(results, "savings"))).toEqual([2, 1, 3]);
  });

  it("i due ordinamenti possono divergere del tutto", () => {
    const results = stationsAlong(LINE, [
      { id: 1, lat: 45.1, lon: 9.0, netSavings: 10, detourKm: 4 },
      { id: 2, lat: 45.3, lon: 9.0, netSavings: 6, detourKm: 1 },
    ]);
    expect(ids(sortResults(results, "savings"))).toEqual([1, 2]);
    expect(ids(sortResults(results, "detour"))).toEqual([2, 1]);
  });
});

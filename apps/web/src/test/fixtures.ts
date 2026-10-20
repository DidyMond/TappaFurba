import type { NearbyRequest, NearbyResponse, SearchRequest, SearchResponse, StationDetailResponse, StationResult } from "@tappafurba/shared";

let nextId = 100;

/** Risultato di ricerca con valori sensati; sovrascrivi solo ciò che serve al test. */
export function makeResult(
  overrides: Partial<Omit<StationResult, "station">> & { station?: Partial<StationResult["station"]> } = {},
): StationResult {
  const id = overrides.station?.id ?? nextId++;
  const { station, ...rest } = overrides;
  return {
    station: {
      id,
      nomeImpianto: `Stazione ${id}`,
      bandiera: "Agip Eni",
      gestore: "ENIMOOV S.P.A.",
      indirizzo: "Via Roma 1",
      comune: "Bregnano",
      provincia: "CO",
      tipoImpianto: "stradale",
      lat: 45.68,
      lon: 9.05,
      ...station,
    },
    price: 1.99,
    isSelf: true,
    servitoOnly: false,
    priceUpdatedAt: "2026-09-28T09:11:43.000Z",
    lateralDistanceKm: 1,
    alongRouteKm: 5,
    detourKm: 2,
    detourMinutes: 3,
    detourSource: "proxy",
    grossSavings: 8,
    detourCost: 1,
    netSavings: 7,
    ...rest,
  };
}

export const REQUEST: SearchRequest = {
  origin: { lon: 9.204, lat: 45.4864 },
  destination: { lon: 11.3426, lat: 44.5058 },
  fuelType: "benzina",
  liters: 45,
  maxDetourKm: 5,
  consumptionKmPerLiter: 15,
  valueOfTimePerMinute: 0.15,
  onlySelf: false,
  maxPriceAgeHours: 72,
  avoidMotorway: false,
  avoidTolls: false,
  avoidFerries: false,
};

/** «Intorno a me»: stesso veicolo e stessi parametri di REQUEST, un solo punto e un raggio. */
export const NEARBY_REQUEST: NearbyRequest = {
  origin: { lon: 9.204, lat: 45.4864 },
  radiusKm: 5,
  fuelType: "benzina",
  liters: 45,
  consumptionKmPerLiter: 15,
  valueOfTimePerMinute: 0.15,
  onlySelf: false,
  maxPriceAgeHours: 72,
  avoidMotorway: false,
  avoidTolls: false,
  avoidFerries: false,
};

/** Tre stazioni con ordinamenti diversi per risparmio, deviazione e distanza dal tracciato. */
export function makeResults(): StationResult[] {
  return [
    makeResult({
      station: { id: 1, nomeImpianto: "Alfa Autostrada", bandiera: "Agip Eni", tipoImpianto: "autostradale" },
      netSavings: 12,
      detourKm: 3,
      lateralDistanceKm: 0.2,
      alongRouteKm: 90,
      price: 1.89,
    }),
    makeResult({
      station: { id: 2, nomeImpianto: "Beta Strada", bandiera: "Q8", tipoImpianto: "stradale" },
      netSavings: 5,
      detourKm: 0.4,
      lateralDistanceKm: 0.1,
      alongRouteKm: 20,
      price: 1.95,
    }),
    makeResult({
      station: { id: 3, nomeImpianto: "Gamma Servito", bandiera: "Pompe Bianche", tipoImpianto: "stradale" },
      netSavings: -2,
      detourKm: 1.5,
      lateralDistanceKm: 0.9,
      alongRouteKm: 50,
      price: 2.2,
      isSelf: false,
      servitoOnly: true,
      detourSource: "routing",
    }),
  ];
}

/**
 * Quattro stazioni per cui risparmio netto e deviazione danno due ordini completamente diversi:
 * risparmio → [11, 12, 13, 14] · deviazione → [12, 13, 14, 11].
 */
export function makeDivergingResults(): StationResult[] {
  const at = (id: number, netSavings: number, detourKm: number, lateralDistanceKm: number, alongRouteKm: number) =>
    makeResult({ station: { id, nomeImpianto: `Stazione ${id}` }, netSavings, detourKm, lateralDistanceKm, alongRouteKm });
  return [at(11, 10, 4, 0.5, 10), at(12, 8, 1, 2.0, 40), at(13, 6, 2, 0.1, 70), at(14, 4, 3, 1.0, 25)];
}

/**
 * Quattro stazioni con gli stessi km di deviazione: «Minor deviazione» decide con gli spareggi
 * (distanza laterale, ordine di incontro, risparmio) → [24, 23, 22, 21]; «Più conveniente» → [24, 21, 23, 22].
 */
export function makeTiedDetourResults(): StationResult[] {
  const at = (id: number, netSavings: number, lateralDistanceKm: number, alongRouteKm: number) =>
    makeResult({ station: { id, nomeImpianto: `Stazione ${id}` }, netSavings, detourKm: 2, lateralDistanceKm, alongRouteKm });
  return [at(21, 3, 0.5, 30), at(22, 1, 0.2, 60), at(23, 2, 0.2, 10), at(24, 9, 0.2, 10)];
}

export function makeResponse(overrides: Partial<SearchResponse> = {}): SearchResponse {
  return {
    searchId: "s1",
    route: {
      distanceKm: 216.6,
      durationMinutes: 153,
      geometry: [
        [9.204, 45.4864],
        [10.3, 45.0],
        [11.3426, 44.5058],
      ],
    },
    referencePrice: { value: 2.15, level: "on_route", sampleSize: 40 },
    costPerKm: 0.143,
    results: makeResults(),
    candidatesEvaluated: 549,
    pricesUpdatedAt: "2026-09-28T19:13:47.000Z",
    livePrices: { status: "live", tilesTotal: 37, tilesLive: 37, oldestLiveAgeMinutes: 4 },
    refinement: { status: "done" },
    staleStations: { count: 0, maxAgeHours: 72 },
    ...overrides,
  };
}

/** Risposta di «Intorno a me»: come `makeResponse` ma senza percorso, con il punto di partenza e il raggio. */
export function makeNearbyResponse(overrides: Partial<NearbyResponse> = {}): NearbyResponse {
  const { route: _route, ...base } = makeResponse();
  return {
    ...base,
    referencePrice: { value: 2.15, level: "area", sampleSize: 12 },
    nearby: { origin: { lon: 9.204, lat: 45.4864 }, radiusKm: 5 },
    ...overrides,
  };
}

/** Dettaglio stazione (Screen 3) con valori sensati: stazione verificata, Benzina Self scelta, listino con Servito e Diesel. */
export function makeDetail(overrides: Partial<StationDetailResponse> = {}): StationDetailResponse {
  return {
    searchId: "s1",
    mode: "route",
    station: {
      id: 2,
      nomeImpianto: "1858 BREGNANO",
      bandiera: "Agip Eni",
      gestore: "ENIMOOV S.P.A.",
      indirizzo: "S.P. 31  DELLA PIODA - VIA MILANO  79",
      comune: "BREGNANO",
      provincia: "CO",
      tipoImpianto: "stradale",
      lat: 45.685986,
      lon: 9.054773,
    },
    selected: { fuelType: "benzina", isSelf: true, servitoOnly: false, price: 1.99, priceUpdatedAt: "2026-09-29T08:00:00.000Z" },
    prices: [
      { fuelType: "benzina", isSelf: true, price: 1.99, communicatedAt: "2026-09-29T08:00:00.000Z" },
      { fuelType: "benzina", isSelf: false, price: 2.2, communicatedAt: "2026-09-29T08:00:00.000Z" },
      { fuelType: "diesel", isSelf: true, price: 2.19, communicatedAt: "2026-09-28T08:00:00.000Z" },
      { fuelType: "diesel", isSelf: false, price: 2.4, communicatedAt: "2026-09-28T08:00:00.000Z" },
    ],
    liters: 45,
    referencePrice: { value: 2.139, level: "on_route", sampleSize: 63 },
    detour: { km: 1.6, minutes: 2.9, source: "routing" },
    impact: { grossSavings: 6.71, detourCost: 0.75, netSavings: 5.96, priceDifferencePerLiter: -0.149, priceDifferencePercent: -7 },
    lateralDistanceKm: 0.8,
    alongRouteKm: 9.3,
    ...overrides,
  };
}

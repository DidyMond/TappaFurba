import { createRouteProjector, distanceKm, type Coordinate, type NationalPrice } from "@tappafurba/core";
import type { StationPriceEntry } from "@tappafurba/shared";
import type { CorridorPriceRow, CorridorQuery, StaleStation, StationRepository } from "../search/StationRepository";

/**
 * Stazioni FITTIZIE lungo la tratta Milano Centrale → Bologna Centrale (luoghi pubblici noti del geocoding di prova), per i
 * test end-to-end senza database né rete. I nomi sono generici («Stazione di prova N»): nessun dato reale. I prezzi sono
 * comunicati «un'ora fa» rispetto all'avvio del server, così restano freschi quale che sia la soglia scelta.
 */
const FROM: Coordinate = [9.204, 45.4864];
const TO: Coordinate = [11.3426, 44.5058];

const SPEC: ReadonlyArray<{ t: number; offset: number; price: number; isSelf: boolean; tipo: "stradale" | "autostradale"; comune: string }> = [
  { t: 0.08, offset: 0.004, price: 1.969, isSelf: true, tipo: "stradale", comune: "Lodi" },
  { t: 0.16, offset: -0.006, price: 1.899, isSelf: true, tipo: "stradale", comune: "Casalpusterlengo" },
  { t: 0.24, offset: 0.002, price: 2.049, isSelf: false, tipo: "autostradale", comune: "Piacenza" },
  { t: 0.33, offset: 0.008, price: 1.879, isSelf: true, tipo: "stradale", comune: "Fiorenzuola" },
  { t: 0.42, offset: -0.003, price: 1.929, isSelf: true, tipo: "stradale", comune: "Fidenza" },
  { t: 0.5, offset: 0.005, price: 1.859, isSelf: true, tipo: "stradale", comune: "Parma" },
  { t: 0.58, offset: -0.009, price: 1.989, isSelf: false, tipo: "autostradale", comune: "Reggio Emilia" },
  { t: 0.66, offset: 0.003, price: 1.909, isSelf: true, tipo: "stradale", comune: "Rubiera" },
  { t: 0.74, offset: -0.004, price: 1.939, isSelf: true, tipo: "stradale", comune: "Modena" },
  { t: 0.82, offset: 0.007, price: 1.889, isSelf: true, tipo: "stradale", comune: "Castelfranco Emilia" },
  { t: 0.9, offset: -0.002, price: 1.959, isSelf: true, tipo: "stradale", comune: "Anzola dell'Emilia" },
];

const COMMUNICATED_AT = new Date(Date.now() - 3_600_000).toISOString();

const CORRIDOR_ROWS: readonly CorridorPriceRow[] = SPEC.map((s, index) => {
  const id = 9001 + index;
  return {
    stationId: id,
    nomeImpianto: `Stazione di prova ${index + 1}`,
    bandiera: index % 3 === 0 ? "Marca A" : index % 3 === 1 ? "Marca B" : "Marca C",
    gestore: "Gestore di prova",
    indirizzo: `Via di Prova ${index + 1}`,
    comune: s.comune,
    provincia: "XX",
    tipoImpianto: s.tipo,
    lat: FROM[1] + (TO[1] - FROM[1]) * s.t + s.offset,
    lon: FROM[0] + (TO[0] - FROM[0]) * s.t,
    isSelf: s.isSelf,
    price: s.price,
    communicatedAt: COMMUNICATED_AT,
  };
});

/**
 * Stazioni FITTIZIE attorno a Torino Porta Nuova (luogo noto del geocoding di prova), per provare «Intorno a me»: sono a circa
 * 1,2 / 2,5 / 3,8 / 6 km dal punto. Stanno lontane dal corridoio Milano–Bologna, quindi le ricerche «In viaggio» non le vedono.
 */
const AROUND: Coordinate = [7.6784, 45.0621];
const AROUND_SPEC: ReadonlyArray<{ dLon: number; dLat: number; price: number; comune: string }> = [
  { dLon: 0, dLat: 0.011, price: 1.929, comune: "Torino" },
  { dLon: 0, dLat: 0.0225, price: 1.869, comune: "Torino" },
  { dLon: 0.0483, dLat: 0, price: 1.959, comune: "Moncalieri" },
  { dLon: 0, dLat: -0.054, price: 1.899, comune: "Beinasco" },
];

const NEARBY_ROWS: readonly CorridorPriceRow[] = AROUND_SPEC.map((s, index) => {
  const id = 9101 + index;
  return {
    stationId: id,
    nomeImpianto: `Stazione di prova T${index + 1}`,
    bandiera: index % 2 === 0 ? "Marca A" : "Marca B",
    gestore: "Gestore di prova",
    indirizzo: `Via di Prova ${index + 1}`,
    comune: s.comune,
    provincia: "XX",
    tipoImpianto: "stradale",
    lat: AROUND[1] + s.dLat,
    lon: AROUND[0] + s.dLon,
    isSelf: true,
    price: s.price,
    communicatedAt: COMMUNICATED_AT,
  };
});

export const FIXTURE_ROWS: readonly CorridorPriceRow[] = [...CORRIDOR_ROWS, ...NEARBY_ROWS];

/** Estrae le coordinate da un WKT `LINESTRING(lon lat, ...)` o `POINT(lon lat)`. */
function parseWkt(wkt: string): Coordinate[] {
  const inner = wkt.slice(wkt.indexOf("(") + 1, wkt.lastIndexOf(")"));
  return inner.split(",").map((pair) => {
    const [lon, lat] = pair.trim().split(/\s+/).map(Number);
    return [lon!, lat!] as Coordinate;
  });
}

/** Distanza dal tracciato (LINESTRING) o dal punto (POINT) di un WKT, come la calcolerebbe `ST_DWithin`. */
function distanceFromWkt(wkt: string): (target: Coordinate) => number {
  const coords = parseWkt(wkt);
  if (coords.length === 1) {
    const center = coords[0]!;
    return (target) => distanceKm(center, target);
  }
  const project = createRouteProjector(coords);
  return (target) => project(target).lateralDistanceKm;
}

/** Repository in memoria per i test end-to-end: filtra per distanza dal tracciato come farebbe PostGIS. */
export class FixtureStationRepository implements StationRepository {
  constructor(private readonly rows: readonly CorridorPriceRow[] = FIXTURE_ROWS) {}

  async findCorridorPrices(query: CorridorQuery): Promise<CorridorPriceRow[]> {
    const distance = distanceFromWkt(query.routeWkt);
    return this.rows.filter((row) => distance([row.lon, row.lat]) * 1000 <= query.radiusMeters).map((row) => ({ ...row }));
  }

  async findStaleStations(): Promise<StaleStation[]> {
    return [];
  }

  async getNationalPrice(): Promise<NationalPrice | null> {
    return { median: 1.95, sampleSize: 500 };
  }

  async getStationPrices(stationId: number): Promise<StationPriceEntry[]> {
    const row = this.rows.find((r) => r.stationId === stationId);
    if (!row) return [];
    const entries: StationPriceEntry[] = [
      { fuelType: "benzina", isSelf: row.isSelf, price: row.price, communicatedAt: row.communicatedAt },
      { fuelType: "diesel", isSelf: row.isSelf, price: Number((row.price + 0.08).toFixed(3)), communicatedAt: row.communicatedAt },
    ];
    if (row.isSelf) entries.push({ fuelType: "benzina", isSelf: false, price: Number((row.price + 0.18).toFixed(3)), communicatedAt: row.communicatedAt });
    return entries;
  }

  async getLastIngestionAt(): Promise<Date | null> {
    return new Date(COMMUNICATED_AT);
  }
}

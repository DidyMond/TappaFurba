import { createRouteProjector, isPriceFresh, tileForPoint, type Coordinate, type NationalPrice } from "@tappafurba/core";
import type { StationPriceEntry } from "@tappafurba/shared";
import type { CorridorPriceRow, CorridorQuery, StaleStation, StationRepository } from "../../src/search/StationRepository";

/** Estrae le coordinate da un WKT `LINESTRING(lon lat, ...)` generato da routeToWkt. */
function parseWkt(wkt: string): Coordinate[] {
  const inner = wkt.slice(wkt.indexOf("(") + 1, wkt.lastIndexOf(")"));
  return inner.split(",").map((pair) => {
    const [lon, lat] = pair.trim().split(/\s+/).map(Number);
    return [lon!, lat!] as Coordinate;
  });
}

/**
 * Repository fittizio: filtra per distanza dal tracciato come farebbe PostGIS
 * (ST_DWithin) e per fuel type; NON applica il filtro di freschezza, salvo che si imposti
 * `freshness` (vedi sotto). La regola vera è coperta dal test di integrazione su PostgreSQL.
 */
export class InMemoryStationRepository implements StationRepository {
  lastQuery: CorridorQuery | null = null;

  constructor(
    private readonly rows: CorridorPriceRow[],
    private readonly national: NationalPrice | null = null,
    private readonly lastIngestionAt: Date | null = new Date("2026-09-28T07:00:00.000Z"),
    /** Prezzi per stazione (tutte le combinazioni carburante × modalità) per il dettaglio. */
    private readonly stationPrices: Record<number, StationPriceEntry[]> = {},
    /** Stazioni «scartate per età» che il repository restituisce a findStaleStations (con la posizione). */
    private readonly staleStations: StaleStation[] = [],
  ) {}

  /** Ultima richiesta di findStaleStations, per le asserzioni. */
  lastStaleQuery: (CorridorQuery & { onlySelf: boolean }) | null = null;

  /**
   * Se impostato, applica la freschezza «ultima conferma della fonte» come fa PostGIS: un prezzo è fresco se
   * è stato comunicato entro la soglia OPPURE se il riquadro che contiene la stazione è stato aggiornato entro la soglia
   * (`tileRefreshedAt`: id riquadro → ISO 8601). In quel caso le stazioni «stantie» si ricavano dalle righe, non dall'elenco fisso.
   */
  freshness: { now: Date; tileRefreshedAt: Record<string, string> } | null = null;

  private isFresh(row: CorridorPriceRow, maxAgeHours: number): boolean {
    if (!this.freshness) return true;
    const tile = this.freshness.tileRefreshedAt[tileForPoint(row.lon, row.lat).id];
    return isPriceFresh(row.communicatedAt, tile, this.freshness.now, maxAgeHours);
  }

  async findStaleStations(query: CorridorQuery & { onlySelf: boolean }): Promise<StaleStation[]> {
    this.lastStaleQuery = query;
    const project = createRouteProjector(parseWkt(query.routeWkt));
    const near = (s: { lon: number; lat: number }) => project([s.lon, s.lat]).lateralDistanceKm * 1000 <= query.radiusMeters;
    if (!this.freshness) return this.staleStations.filter(near);
    // Stazioni del corridoio con almeno un prezzo (Self, se «solo Self») e nessuno fresco.
    const byStation = new Map<number, CorridorPriceRow[]>();
    for (const row of this.rows.filter((r) => near(r) && (!query.onlySelf || r.isSelf))) byStation.set(row.stationId, [...(byStation.get(row.stationId) ?? []), row]);
    return [...byStation.values()]
      .filter((rows) => rows.every((r) => !this.isFresh(r, query.maxAgeHours)))
      .map((rows) => ({ stationId: rows[0]!.stationId, lat: rows[0]!.lat, lon: rows[0]!.lon }));
  }

  /** Ultima richiesta di getStationPrices, per le asserzioni. */
  lastStationPricesQuery: { stationId: number; maxAgeHours: number } | null = null;

  async getStationPrices(stationId: number, maxAgeHours: number): Promise<StationPriceEntry[]> {
    this.lastStationPricesQuery = { stationId, maxAgeHours };
    return this.stationPrices[stationId] ?? [];
  }

  async findCorridorPrices(query: CorridorQuery): Promise<CorridorPriceRow[]> {
    this.lastQuery = query;
    const project = createRouteProjector(parseWkt(query.routeWkt));
    return this.rows.filter(
      (row) => project([row.lon, row.lat]).lateralDistanceKm * 1000 <= query.radiusMeters && this.isFresh(row, query.maxAgeHours),
    );
  }

  async getNationalPrice(): Promise<NationalPrice | null> {
    return this.national;
  }

  async getLastIngestionAt(): Promise<Date | null> {
    return this.lastIngestionAt;
  }
}

let nextId = 1000;

/** Riga di prezzo con valori di default sensati per i test. */
export function row(overrides: Partial<CorridorPriceRow> & Pick<CorridorPriceRow, "lon" | "lat" | "price">): CorridorPriceRow {
  const id = overrides.stationId ?? nextId++;
  return {
    stationId: id,
    nomeImpianto: `Stazione ${id}`,
    bandiera: "Test",
    gestore: "Gestore Test",
    indirizzo: "Via Test 1",
    comune: "Comune",
    provincia: "XX",
    tipoImpianto: "stradale",
    isSelf: true,
    communicatedAt: "2026-09-27T10:00:00.000Z",
    ...overrides,
  };
}

import type { NationalPrice } from "@tappafurba/core";
import type { SearchFuelType, StationPriceEntry, TipoImpianto } from "@tappafurba/shared";

/** Una riga per (stazione, modalità Self/Servito) con il prezzo fresco per il carburante cercato. */
export interface CorridorPriceRow {
  stationId: number;
  nomeImpianto: string;
  bandiera: string;
  gestore: string;
  indirizzo: string;
  comune: string;
  provincia: string;
  tipoImpianto: TipoImpianto;
  lat: number;
  lon: number;
  isSelf: boolean;
  price: number;
  /** ISO 8601. */
  communicatedAt: string;
}

export interface CorridorQuery {
  /** Tracciato (semplificato) in WKT, coordinate lon lat. */
  routeWkt: string;
  /** Raggio one-way del corridoio attorno al tracciato. */
  radiusMeters: number;
  fuelType: SearchFuelType;
  /**
   * Prezzi non aggiornati da più di N ore vengono esclusi. «Aggiornato» = ultima conferma della fonte: il più recente
   * tra la data di comunicazione e l'ultimo aggiornamento del riquadro in tempo reale che contiene la stazione.
   */
  maxAgeHours: number;
}

/** Una stazione del corridoio con la posizione, per calcolare la distanza dal tracciato. */
export interface StaleStation {
  stationId: number;
  lat: number;
  lon: number;
}

/** Accesso ai dati delle stazioni: porta astratta, l'unica implementazione di produzione usa PostGIS. */
export interface StationRepository {
  findCorridorPrices(query: CorridorQuery): Promise<CorridorPriceRow[]>;
  /**
   * Stazioni del corridoio escluse SOLO per età: hanno un prezzo del carburante cercato (se `onlySelf`, un prezzo
   * Self) ma nessuno aggiornato (comunicato o confermato dalla fonte) entro `maxAgeHours`. Le stesse stazioni che `findCorridorPrices` non restituisce
   * per questo motivo; non scrive nulla.
   */
  findStaleStations(query: CorridorQuery & { onlySelf: boolean }): Promise<StaleStation[]>;
  /** Mediana nazionale per la combinazione carburante/modalità (ultimo livello della cascata di P_avg). */
  getNationalPrice(query: { fuelType: SearchFuelType; onlySelf: boolean; maxAgeHours: number }): Promise<NationalPrice | null>;
  /**
   * Tutte le combinazioni carburante × modalità della stazione con prezzo fresco (solo i 4 carburanti dell'MVP:
   * benzina, diesel, GPL, metano), per il dettaglio stazione.
   */
  getStationPrices(stationId: number, maxAgeHours: number): Promise<StationPriceEntry[]>;
  /** Fine dell'ultima ingestione MIMIT riuscita, o null se non ne esiste alcuna. */
  getLastIngestionAt(): Promise<Date | null>;
}

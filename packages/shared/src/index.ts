/**
 * Tipi condivisi tra apps/api e apps/web, e usati dalla pipeline di ingestione
 * in packages/core. Solo definizioni di tipo: nessuna logica qui.
 */

/** Tipo carburante normalizzato. */
export type FuelType = "benzina" | "diesel" | "gpl" | "metano" | "hvo" | "other" | "unknown";

/** Tipi carburante mostrati nella UI e usati nel calcolo del Net Savings Index. */
export const MVP_VISIBLE_FUEL_TYPES: readonly FuelType[] = ["benzina", "diesel", "gpl", "metano"];

export type TipoImpianto = "stradale" | "autostradale";

/** Stazione di servizio, normalizzata da anagrafica_impianti_attivi.csv (MIMIT). */
export interface Station {
  id: number;
  gestore: string;
  bandiera: string;
  tipoImpianto: TipoImpianto;
  nomeImpianto: string;
  indirizzo: string;
  comune: string;
  provincia: string;
  lat: number;
  lon: number;
}

/** Prezzo carburante, normalizzato da prezzo_alle_8.csv (MIMIT). */
export interface FuelPrice {
  stationId: number;
  fuelType: FuelType;
  /** Valore originale non normalizzato del campo descCarburante, sempre conservato. */
  rawDescCarburante: string;
  isSelf: boolean;
  price: number;
  /** ISO 8601, derivato dal campo dtComu (GG/MM/AAAA HH:MM:SS). */
  communicatedAt: string;
}

export interface HealthStatus {
  status: "ok" | "degraded";
  database: "ok" | "error";
  timestamp: string;
}

// ---------------------------------------------------------------------------
// Contratto API — ricerca e geocoding
// ---------------------------------------------------------------------------

export interface LonLat {
  lon: number;
  lat: number;
}

/** Carburanti selezionabili in ricerca (MVP: solo i 4 tipi base, vedi MVP_VISIBLE_FUEL_TYPES). */
export type SearchFuelType = "benzina" | "diesel" | "gpl" | "metano";

/** Le due modalità di ricerca: «In viaggio» (lungo un percorso A→B) e «Intorno a me» (attorno a un punto). */
export type SearchMode = "route" | "nearby";

/** Parametri di calcolo comuni a entrambe le modalità (veicolo, prezzi, esclusioni del percorso). */
export interface SearchOptions {
  fuelType: SearchFuelType;
  /** Litri da rifornire (V_refill). */
  liters: number;
  /** Consumo del veicolo, km/L. */
  consumptionKmPerLiter: number;
  /** Valore del tempo, €/minuto. */
  valueOfTimePerMinute: number;
  /** true = solo stazioni con prezzo Self; false = include anche le solo-Servito. */
  onlySelf: boolean;
  /** Prezzi non aggiornati (né comunicati né confermati dalla fonte) da più di N ore sono esclusi dai risultati. */
  maxPriceAgeHours: number;
  /**
   * true = «Evita autostrada»: Directions con `exclude=motorway` sia per il percorso diretto sia per le verifiche. La
   * deviazione si misura sempre contro il diretto dello stesso tipo (senza autostrada, in questo caso).
   */
  avoidMotorway: boolean;
  /** true = «Evita pedaggi»: Directions con `exclude=toll`; stessa regola di baseline di `avoidMotorway`. Il pedaggio non entra in S_net. */
  avoidTolls: boolean;
  /** true = «Evita traghetti»: Directions con `exclude=ferry`; stessa regola di baseline di `avoidMotorway`. */
  avoidFerries: boolean;
  /**
   * Prezzo di riferimento impostato dall'utente (€/L, per il carburante cercato). Se presente sostituisce del tutto la
   * cascata di P_avg (livello `manual`); se assente si usa il calcolo automatico.
   */
  referencePriceOverride?: number;
}

/** «In viaggio»: ricerca lungo il percorso da `origin` a `destination`. */
export interface SearchRequest extends SearchOptions {
  origin: LonLat;
  destination: LonLat;
  /** Deviazione massima, km extra di A→stazione→B rispetto ad A→B (round-trip). */
  maxDetourKm: number;
}

/**
 * «Intorno a me»: ricerca attorno a un punto (GPS o indirizzo). Non c'è un percorso di riferimento: il costo del
 * tragitto è quello del giro completo origin→stazione→origin.
 */
export interface NearbyRequest extends SearchOptions {
  origin: LonLat;
  /** Raggio di ricerca, km in linea d'aria dal punto (come il MIMIT: predefinito 5, massimo 10). */
  radiusKm: number;
}

/** 'proxy' = stima geometrica; 'routing' = verificata con il provider di routing. */
export type DetourSource = "proxy" | "routing";

export interface StationSummary {
  id: number;
  nomeImpianto: string;
  bandiera: string;
  gestore: string;
  indirizzo: string;
  comune: string;
  provincia: string;
  tipoImpianto: TipoImpianto;
  lat: number;
  lon: number;
}

export interface StationResult {
  station: StationSummary;
  /** Prezzo effettivo usato (€/L). */
  price: number;
  isSelf: boolean;
  /** true se la stazione non ha un prezzo Self e si usa il Servito. */
  servitoOnly: boolean;
  /** ISO 8601, data di comunicazione del prezzo usato. */
  priceUpdatedAt: string;
  /** Distanza one-way dal tracciato, km (in «Intorno a me»: in linea d'aria dal punto di partenza). */
  lateralDistanceKm: number;
  /** Posizione lungo il tracciato, km dall'origine (in «Intorno a me»: sempre 0). */
  alongRouteKm: number;
  /** Km extra di A→stazione→B rispetto ad A→B (in «Intorno a me»: il giro completo A→stazione→A). */
  detourKm: number;
  detourMinutes: number;
  detourSource: DetourSource;
  /** (P_avg − P_station) × litri, €. */
  grossSavings: number;
  /** Costo carburante + tempo della deviazione, €. */
  detourCost: number;
  /** Net Savings Index, €. */
  netSavings: number;
}

/**
 * `manual` = prezzo di riferimento impostato dall'utente nelle Impostazioni (sostituisce la cascata automatica);
 * `area` = mediana delle stazioni entro il raggio di «Intorno a me».
 */
export type ReferencePriceLevel = "on_route" | "corridor" | "national" | "area" | "manual";

export interface ReferencePriceInfo {
  value: number;
  level: ReferencePriceLevel;
  sampleSize: number;
}

export type RefinementStatus = "pending" | "done" | "skipped" | "failed";

export interface RefinementInfo {
  status: RefinementStatus;
  /** Motivo quando status è 'skipped' o 'failed'. */
  reason?: "budget_soft_limit" | "budget_hard_limit" | "routing_error";
}

/** Campi della risposta comuni a «In viaggio» e «Intorno a me». */
export interface SearchResponseBase {
  searchId: string;
  referencePrice: ReferencePriceInfo;
  /** Costo marginale al km (€/km) usato nel calcolo. */
  costPerKm: number;
  /** Ordinati per netSavings decrescente. */
  results: StationResult[];
  /** Stazioni candidate valutate prima del limite di risposta. */
  candidatesEvaluated: number;
  /** Data dell'ultima ingestione del file MIMIT giornaliero (ISO 8601): è la base dei prezzi, indietro di 1-2 giorni. */
  pricesUpdatedAt: string | null;
  /** Stato dell'aggiornamento in tempo reale dei prezzi lungo il percorso (sito ufficiale Osservaprezzi). */
  livePrices: LivePricesInfo;
  refinement: RefinementInfo;
  /** Stazioni escluse SOLO per l'età del prezzo (vedi `StaleStationsInfo`). Campo additivo. */
  staleStations: StaleStationsInfo;
}

/** Risposta di POST /search («In viaggio»). */
export interface SearchResponse extends SearchResponseBase {
  route: {
    distanceKm: number;
    durationMinutes: number;
    /** Tracciato semplificato (~50 m) per la mappa: coordinate [lon, lat] con 5 decimali. */
    geometry: Array<[number, number]>;
  };
}

/** Risposta di POST /nearby («Intorno a me»): niente percorso, ma il punto di partenza e il raggio usati. */
export interface NearbyResponse extends SearchResponseBase {
  nearby: {
    origin: LonLat;
    radiusKm: number;
  };
}

/**
 * Stazioni del corridoio che avrebbero potuto comparire (hanno un prezzo del carburante cercato, rispettando «Solo
 * Self», e starebbero entro la deviazione massima secondo la stima geometrica) ma sono escluse perché il loro prezzo è
 * aggiornato (né comunicato né confermato dalla fonte) da più di `maxAgeHours` ore. Serve all'avviso «N stazioni non mostrate» nei Risultati.
 */
export interface StaleStationsInfo {
  count: number;
  /** La soglia di validità dei prezzi usata dalla ricerca (ore). */
  maxAgeHours: number;
}

/**
 * - `live`: tutti i riquadri del corridoio hanno prezzi aggiornati in tempo reale;
 * - `partial`: solo una parte (tempo o limite di chiamate esauriti): il resto usa il file giornaliero;
 * - `unavailable`: la fonte in tempo reale non ha risposto, si usano solo i prezzi del file giornaliero;
 * - `disabled`: aggiornamento in tempo reale non attivo (configurazione).
 */
export type LivePricesStatus = "live" | "partial" | "unavailable" | "disabled";

export interface LivePricesInfo {
  status: LivePricesStatus;
  /** Riquadri geografici che coprono il corridoio. */
  tilesTotal: number;
  /** Riquadri con prezzi live (appena scaricati o in cache recente). */
  tilesLive: number;
  /** Età in minuti del riquadro live meno recente tra quelli usati, null se nessuno. */
  oldestLiveAgeMinutes: number | null;
}

/** Risposta di GET /search/:id — risultati riordinati dopo il ricalcolo con routing reale. */
export interface SearchRefinementResponse {
  searchId: string;
  refinement: RefinementInfo;
  results: StationResult[];
}

/**
 * Risposta di GET /search/:id/stations/:stationId/route — il percorso A→stazione→B (route con sosta) della stazione
 * scelta. Stessa chiamata di routing della verifica della deviazione: per le prime stazioni è già in cache.
 */
export interface StationRouteResponse {
  searchId: string;
  stationId: number;
  distanceKm: number;
  durationMinutes: number;
  /** Deviazione coerente rispetto al percorso diretto (vedi computeRoutedDetour). */
  detourKm: number;
  detourMinutes: number;
  /** Tracciato A→stazione→B, [lon, lat], semplificato come quello del percorso diretto. */
  geometry: Array<[number, number]>;
}

/** Un prezzo della stazione: una combinazione carburante × modalità (Self/Servito), dalla stessa fonte dei risultati. */
export interface StationPriceEntry {
  fuelType: SearchFuelType;
  isSelf: boolean;
  /** €/L. */
  price: number;
  /** ISO 8601, data di comunicazione del prezzo. */
  communicatedAt: string;
}

/**
 * Risposta di GET /search/:id/stations/:stationId — dettaglio di una stazione per quella ricerca (Screen 3).
 * La deviazione è verificata col routing reale (riuso della cache o di una verifica già fatta); se il routing non è
 * disponibile resta la stima geometrica e `detour.source` è `proxy`: il client deve mostrarla come stima.
 */
export interface StationDetailResponse {
  searchId: string;
  /** Modalità della ricerca: in «Intorno a me» `detour` è il giro completo A→stazione→A e `alongRouteKm` vale 0. */
  mode: SearchMode;
  station: StationSummary;
  /** Combinazione scelta nella ricerca (carburante e modalità), con il prezzo usato nei risultati. */
  selected: {
    fuelType: SearchFuelType;
    isSelf: boolean;
    servitoOnly: boolean;
    price: number;
    priceUpdatedAt: string;
  };
  /** Tutte le combinazioni carburante × modalità disponibili e fresche per la stazione (solo i 4 carburanti MVP). */
  prices: StationPriceEntry[];
  /** Litri della ricerca (V_refill). */
  liters: number;
  referencePrice: ReferencePriceInfo;
  detour: { km: number; minutes: number; source: DetourSource };
  impact: {
    /** (P_avg − P_station) × litri, €. */
    grossSavings: number;
    /** Costo carburante + tempo della deviazione, €. */
    detourCost: number;
    /** Net Savings Index, €. */
    netSavings: number;
    /** Prezzo stazione − riferimento, €/L (negativo = più economica). */
    priceDifferencePerLiter: number;
    /** Stessa differenza in % del prezzo di riferimento. */
    priceDifferencePercent: number;
  };
  /** Distanza one-way dal tracciato, km. */
  lateralDistanceKm: number;
  /** Posizione lungo il tracciato, km dall'origine. */
  alongRouteKm: number;
}

export interface GeocodeSuggestion {
  id: string;
  /** Testo principale, es. "Via Roma 10". */
  name: string;
  /** Testo completo da mostrare/inserire nel campo. */
  label: string;
  lon: number;
  lat: number;
}

export interface GeocodeAutocompleteResponse {
  suggestions: GeocodeSuggestion[];
}

export interface GeocodeReverseResponse {
  label: string;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
  };
}

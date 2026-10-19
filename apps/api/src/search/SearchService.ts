import { randomUUID } from "node:crypto";
import {
  type Coordinate,
  computeAreaReferencePrice,
  computeNetSavings,
  computeReferencePrice,
  DISPLAY_SIMPLIFY_TOLERANCE_DEG,
  computeRoutedDetour,
  computeStationDetail,
  costPerKm,
  createRouteProjector,
  distanceKm,
  estimateProxyDetour,
  pointToWkt,
  resolveDetour,
  routeToWkt,
  selectStationPrice,
  simplifyRoute,
  type Detour,
  type NationalPrice,
  type PriceSample,
  type ReferencePrice,
  type RouteProjection,
  type SelectedPrice,
  type StationPriceOption,
} from "@tappafurba/core";
import type {
  DetourSource,
  NearbyRequest,
  NearbyResponse,
  RefinementInfo,
  SearchOptions,
  SearchRefinementResponse,
  SearchRequest,
  SearchResponse,
  SearchResponseBase,
  StationDetailResponse,
  StationPriceEntry,
  StationRouteResponse,
  LivePricesInfo,
  StationResult,
  StationSummary,
} from "@tappafurba/shared";
import { AppError, BudgetExhaustedError } from "../errors";
import type { BudgetGate } from "../providers/routing/DirectionsBudget";
import type { RouteOptions, RouteResult, RoutingProvider } from "../providers/routing/RoutingProvider";
import { MAX_NEARBY_RADIUS_KM, MIN_NEARBY_RADIUS_KM } from "./schemas";
import type { CorridorPriceRow, StationRepository } from "./StationRepository";
import type { SearchSession, SearchSessionStore } from "./SearchSessionStore";

/** Il raggio del corridoio segue lo slider della deviazione massima, ma entro questi limiti. */
export const MIN_CORRIDOR_RADIUS_KM = 1;
export const MAX_CORRIDOR_RADIUS_KM = 15;
/** Massimo di stazioni restituite (le migliori per risparmio netto). */
export const RESULT_LIMIT = 50;
/** Quante stazioni in testa alla classifica proxy vengono verificate con il routing reale. */
export const REFINE_TOP_N = 5;
/** Tetto di chiamate di routing extra, oltre il primo giro, per portare la testa dell'elenco a 5 stazioni confermate. */
export const REFINE_EXTRA_CALLS_CAP = 10;

/** Porta i prezzi del corridoio in tempo reale prima della lettura dal DB. Opzionale: senza, restano i prezzi del file giornaliero. */
export interface LivePricesGate {
  ensureFresh(route: readonly Coordinate[], bufferKm: number): Promise<LivePricesInfo>;
}

const LIVE_PRICES_DISABLED: LivePricesInfo = { status: "disabled", tilesTotal: 0, tilesLive: 0, oldestLiveAgeMinutes: null };

export interface SearchServiceDeps {
  routing: RoutingProvider;
  livePrices?: LivePricesGate;
  repository: StationRepository;
  budget: BudgetGate;
  sessions: SearchSessionStore;
  now?: () => number;
  logger?: { warn(details: object, message: string): void };
}

interface Candidate {
  station: StationSummary;
  price: SelectedPrice;
  lateralDistanceKm: number;
  alongRouteKm: number;
}

interface ScoringContext {
  request: SearchOptions;
  referencePrice: number;
}

/**
 * Ciò che distingue le due modalità: dove cercare e come misurare le stazioni. «In viaggio» cerca lungo un tracciato
 * (distanza laterale e posizione lungo il percorso); «Intorno a me» attorno a un punto (distanza in linea d'aria).
 */
interface SearchArea {
  /** Tracciato (LINESTRING) o punto (POINT) in WKT, per `ST_DWithin`. */
  wkt: string;
  radiusKm: number;
  /** Punti che coprono l'area per l'aggiornamento in tempo reale: il tracciato semplificato, o il solo punto. */
  livePricesPath: readonly Coordinate[];
  project(point: Coordinate): RouteProjection;
  /** Km extra massimi del giro (`Infinity` in «Intorno a me»: lì conta solo il raggio). */
  detourLimitKm: number;
  referencePrice(samples: readonly PriceSample[], national: NationalPrice | null): ReferencePrice | null;
}

interface SearchOutcome {
  candidatesEvaluated: number;
  lastIngestionAt: Date | null;
  livePrices: LivePricesInfo;
  staleCount: number;
}

export class SearchService {
  private readonly now: () => number;

  constructor(private readonly deps: SearchServiceDeps) {
    this.now = deps.now ?? Date.now;
  }

  /**
   * «In viaggio». Fase 1 (sincrona): percorso A→B, corridoio PostGIS, prezzo di riferimento,
   * ranking con deviazione stimata (proxy geometrico). Risponde subito.
   * Fase 2 (in background): verifica con routing reale delle prime
   * REFINE_TOP_N stazioni (e di quelle che le sostituiscono in testa, entro REFINE_EXTRA_CALLS_CAP chiamate extra);
   * il client legge l'esito con getRefinement().
   */
  async search(request: SearchRequest): Promise<SearchResponse> {
    const route = await this.deps.routing.getRoute([request.origin, request.destination], routeOptions(request));
    if (!route) {
      throw new AppError("NO_ROUTE", 422, "Nessun percorso stradale trovato tra origine e destinazione.");
    }

    const simplified = simplifyRoute(route.geometry);
    const project = createRouteProjector(simplified);
    const routeMetrics = { distanceKm: route.distanceKm, durationMinutes: route.durationMinutes };

    const base = await this.runSearch(
      {
        wkt: routeToWkt(simplified),
        radiusKm: clamp(request.maxDetourKm, MIN_CORRIDOR_RADIUS_KM, MAX_CORRIDOR_RADIUS_KM),
        livePricesPath: simplified,
        project: ([lon, lat]) => project([lon, lat]),
        detourLimitKm: request.maxDetourKm,
        referencePrice: computeReferencePrice,
      },
      request,
      { mode: "route", origin: request.origin, destination: request.destination, route: routeMetrics },
    );

    return {
      ...base,
      route: {
        distanceKm: round(route.distanceKm, 1),
        durationMinutes: round(route.durationMinutes, 0),
        // Al client va il tracciato fine (~1 m), non quello semplificato a ~50 m che serve solo ai calcoli sul corridoio.
        geometry: simplifyRoute(route.geometry, DISPLAY_SIMPLIFY_TOLERANCE_DEG).map(([lon, lat]) => [round(lon, 5), round(lat, 5)] as [number, number]),
      },
    };
  }

  /**
   * «Intorno a me»: stesse due fasi di `search`, ma attorno a un punto invece che lungo un tracciato. Nessuna chiamata di
   * routing in fase 1 (non c'è un percorso A→B); la fase 2 verifica con il routing reale il giro completo
   * origine→stazione→origine delle prime stazioni. Il raggio è la distanza in linea d'aria dal punto, non un limite ai km extra.
   */
  async searchNearby(request: NearbyRequest): Promise<NearbyResponse> {
    const origin: Coordinate = [request.origin.lon, request.origin.lat];
    const radiusKm = clamp(request.radiusKm, MIN_NEARBY_RADIUS_KM, MAX_NEARBY_RADIUS_KM);

    const base = await this.runSearch(
      {
        wkt: pointToWkt(origin),
        radiusKm,
        livePricesPath: [origin],
        project: (point) => ({ lateralDistanceKm: distanceKm(origin, point), alongRouteKm: 0 }),
        detourLimitKm: Number.POSITIVE_INFINITY,
        referencePrice: computeAreaReferencePrice,
      },
      request,
      { mode: "nearby", origin: request.origin, destination: request.origin, route: { distanceKm: 0, durationMinutes: 0 } },
    );

    return { ...base, nearby: { origin: request.origin, radiusKm } };
  }

  /** Parte comune alle due modalità: dati del corridoio (o dell'area), candidati, prezzo di riferimento, classifica, sessione. */
  private async runSearch(
    area: SearchArea,
    options: SearchOptions,
    base: Pick<SearchSession, "mode" | "origin" | "destination" | "route">,
  ): Promise<SearchResponseBase> {
    // Prima dei dati: aggiorna in tempo reale i riquadri dell'area (non fallisce mai, degrada al file giornaliero).
    const livePrices = this.deps.livePrices ? await this.deps.livePrices.ensureFresh(area.livePricesPath, area.radiusKm) : LIVE_PRICES_DISABLED;

    const corridor = {
      routeWkt: area.wkt,
      radiusMeters: area.radiusKm * 1000,
      fuelType: options.fuelType,
      maxAgeHours: options.maxPriceAgeHours,
    };
    const [rows, national, lastIngestionAt, staleRows] = await Promise.all([
      this.deps.repository.findCorridorPrices({ ...corridor }),
      this.deps.repository.getNationalPrice({
        fuelType: options.fuelType,
        onlySelf: options.onlySelf,
        maxAgeHours: options.maxPriceAgeHours,
      }),
      this.deps.repository.getLastIngestionAt(),
      this.deps.repository.findStaleStations({ ...corridor, onlySelf: options.onlySelf }),
    ]);

    const candidates: Candidate[] = [];
    for (const { summary, options: priceOptions } of groupByStation(rows)) {
      const price = selectStationPrice(priceOptions, { onlySelf: options.onlySelf });
      if (!price) continue;
      const { lateralDistanceKm, alongRouteKm } = area.project([summary.lon, summary.lat]);
      candidates.push({ station: summary, price, lateralDistanceKm, alongRouteKm });
    }

    // Stazioni scartate SOLO per l'età del prezzo che, per la stima geometrica, starebbero entro la deviazione massima.
    const staleCount = staleRows.filter((stale) => {
      const { lateralDistanceKm } = area.project([stale.lon, stale.lat]);
      return estimateProxyDetour(lateralDistanceKm).km <= area.detourLimitKm;
    }).length;

    const samples: PriceSample[] = candidates.map((c) => ({
      lateralDistanceKm: c.lateralDistanceKm,
      price: c.price.price,
    }));
    // Prezzo di riferimento impostato dall'utente: sostituisce del tutto la cascata automatica (nessun blending).
    const reference =
      options.referencePriceOverride !== undefined
        ? { value: options.referencePriceOverride, level: "manual" as const, sampleSize: 0 }
        : area.referencePrice(samples, national);
    if (!reference) {
      throw new AppError(
        "NO_PRICE_DATA",
        422,
        "Prezzi aggiornati insufficienti per questo carburante: riprova più tardi o aumenta la soglia di validità dei prezzi.",
      );
    }

    const context: ScoringContext = { request: options, referencePrice: reference.value };
    const scored: StationResult[] = [];
    for (const candidate of candidates) {
      const detour = estimateProxyDetour(candidate.lateralDistanceKm);
      if (detour.km > area.detourLimitKm) continue;
      scored.push(scoreCandidate(candidate, detour, "proxy", context));
    }
    scored.sort(byNetSavings);

    const budget = await this.deps.budget.status();
    const results = scored.slice(0, RESULT_LIMIT);

    const session: SearchSession = {
      id: randomUUID(),
      ...base,
      request: options,
      detourLimitKm: area.detourLimitKm,
      referencePrice: { value: reference.value, level: reference.level, sampleSize: reference.sampleSize },
      costPerKm: costPerKm(reference.value, options.consumptionKmPerLiter),
      results,
      refinement: initialRefinement(budget, results.length),
      createdAt: this.now(),
    };
    this.deps.sessions.set(session);

    // La risposta si compone PRIMA di avviare il ricalcolo: fotografa lo stato «pending» e l'elenco con le stime.
    const response = presentBase(session, { candidatesEvaluated: candidates.length, lastIngestionAt, livePrices, staleCount });
    if (session.refinement.status === "pending") {
      session.refinementPromise = this.refine(session);
    }
    return response;
  }

  getRefinement(searchId: string): SearchRefinementResponse | null {
    const session = this.deps.sessions.get(searchId);
    if (!session) return null;
    return { searchId, refinement: session.refinement, results: session.results.map(present) };
  }

  private findStation(searchId: string, stationId: number): { session: SearchSession; result: StationResult } {
    const session = this.deps.sessions.get(searchId);
    if (!session) throw new AppError("SEARCH_NOT_FOUND", 404, "Ricerca non trovata o scaduta.");
    const result = session.results.find((r) => r.station.id === stationId);
    if (!result) throw new AppError("NOT_FOUND", 404, "Stazione non presente tra i risultati della ricerca.");
    return { session, result };
  }

  /** Routing A→stazione→B e deviazione coerente rispetto al diretto. Una nuova richiesta Directions (nessuna cache dei risultati, vedi InFlightRoutingProvider). */
  private async routeViaStation(session: SearchSession, result: StationResult): Promise<{ via: RouteResult; detour: Detour }> {
    const { request, route, origin, destination } = session;
    const via = await this.deps.routing.getRoute(
      [origin, { lon: result.station.lon, lat: result.station.lat }, destination],
      viaRouteOptions(session),
    );
    if (!via) throw new AppError("NO_ROUTE", 422, "Nessun percorso stradale trovato passando da questa stazione.");
    return { via, detour: computeRoutedDetour(route, via, result.lateralDistanceKm) };
  }

  /**
   * Percorso A→stazione→B di una stazione tra i risultati della ricerca. Fa una nuova richiesta Directions A→stazione→B
   * (i risultati di Directions non si riusano: vedi InFlightRoutingProvider); se il routing non è disponibile (kill switch, rete) lancia l'errore
   * e il client non disegna nulla.
   */
  async getStationRoute(searchId: string, stationId: number): Promise<StationRouteResponse> {
    const { session, result } = this.findStation(searchId, stationId);
    const { via, detour } = await this.routeViaStation(session, result);
    return {
      searchId,
      stationId,
      distanceKm: round(via.distanceKm, 1),
      durationMinutes: round(via.durationMinutes, 0),
      detourKm: round(detour.km, 2),
      detourMinutes: round(detour.minutes, 1),
      geometry: simplifyRoute(via.geometry, DISPLAY_SIMPLIFY_TOLERANCE_DEG).map(([lon, lat]) => [round(lon, 5), round(lat, 5)] as [number, number]),
    };
  }

  /**
   * Dettaglio di una stazione (Screen 3). La deviazione è sempre quella verificata col routing reale: se la stazione
   * è già stata verificata dal ricalcolo in background si riusa quel valore (nessuna chiamata), altrimenti si fa una
   * singola chiamata on-demand (kill switch e rate limit come per le altre). Se il routing non è disponibile
   * non si inventa nulla: resta la stima geometrica e `detour.source` vale `proxy`, così il client la mostra come stima.
   */
  async getStationDetail(searchId: string, stationId: number): Promise<StationDetailResponse> {
    const { session, result } = this.findStation(searchId, stationId);
    const { request } = session;

    const proxy: Detour = { km: result.detourKm, minutes: result.detourMinutes };
    let verified: Detour | null = result.detourSource === "routing" ? proxy : null;
    if (!verified) {
      try {
        verified = (await this.routeViaStation(session, result)).detour;
      } catch (error) {
        if (!(error instanceof BudgetExhaustedError)) {
          this.deps.logger?.warn({ stationId }, "Verifica routing on-demand del dettaglio non riuscita");
        }
      }
    }
    const { detour, source } = resolveDetour(verified, proxy);

    const impact = computeStationDetail({
      referencePrice: session.referencePrice.value,
      stationPrice: result.price,
      liters: request.liters,
      detour,
      consumptionKmPerLiter: request.consumptionKmPerLiter,
      valueOfTimePerMinute: request.valueOfTimePerMinute,
    });

    const prices = sortPrices(await this.deps.repository.getStationPrices(stationId, request.maxPriceAgeHours));

    return {
      searchId,
      mode: session.mode,
      station: result.station,
      selected: {
        fuelType: request.fuelType,
        isSelf: result.isSelf,
        servitoOnly: result.servitoOnly,
        price: round(result.price, 3),
        priceUpdatedAt: result.priceUpdatedAt,
      },
      prices: prices.map((p) => ({ ...p, price: round(p.price, 3) })),
      liters: request.liters,
      referencePrice: { ...session.referencePrice, value: round(session.referencePrice.value, 3) },
      detour: { km: round(detour.km, 2), minutes: round(detour.minutes, 1), source },
      impact: {
        grossSavings: round(impact.grossSavings, 2),
        detourCost: round(impact.detourCost, 2),
        netSavings: round(impact.netSavings, 2),
        priceDifferencePerLiter: round(impact.priceDifferencePerLiter, 3),
        priceDifferencePercent: round(impact.priceDifferencePercent, 1),
      },
      lateralDistanceKm: round(result.lateralDistanceKm, 2),
      alongRouteKm: round(result.alongRouteKm, 1),
    };
  }

  /** Solo per i test: attende la fine del ricalcolo in background. */
  async waitForRefinement(searchId: string): Promise<void> {
    await this.deps.sessions.get(searchId)?.refinementPromise;
  }

  /**
   * Verifica col routing reale finché la testa dell'elenco (le prime REFINE_TOP_N stazioni) è tutta confermata:
   * il primo giro riguarda le prime REFINE_TOP_N, poi ogni stazione ancora solo stimata che entra in testa
   * (perché una verificata è scesa o è stata esclusa) viene verificata anch'essa, fino a REFINE_EXTRA_CALLS_CAP
   * chiamate extra per ricerca. Oltre il tetto restano le stime, con il badge «stima» nell'interfaccia.
   */
  private async refine(session: SearchSession): Promise<void> {
    try {
      const { request, route, origin, destination } = session;
      const context: ScoringContext = { request, referencePrice: session.referencePrice.value };

      const attempted = new Set<number>(); // verificate o non verificabili: non si riprovano
      let extraCallsLeft = REFINE_EXTRA_CALLS_CAP;
      let budgetReached = false;
      let failures = 0;
      let verified = 0;
      let firstRound = true;

      while (!budgetReached) {
        let batch = session.results.slice(0, REFINE_TOP_N).filter((result) => !attempted.has(result.station.id));
        if (!firstRound) batch = batch.slice(0, extraCallsLeft);
        if (batch.length === 0) break;
        if (!firstRound) extraCallsLeft -= batch.length;
        firstRound = false;

        const outcomes = await Promise.all(
          batch.map(async (result) => {
            attempted.add(result.station.id);
            try {
              const via = await this.deps.routing.getRoute(
                [origin, { lon: result.station.lon, lat: result.station.lat }, destination],
                viaRouteOptions(session),
              );
              if (!via) {
                failures += 1;
                return { result, detour: null };
              }
              return { result, detour: computeRoutedDetour(route, via, result.lateralDistanceKm) };
            } catch (error) {
              failures += 1;
              if (error instanceof BudgetExhaustedError) {
                budgetReached = true;
              } else {
                this.deps.logger?.warn({ stationId: result.station.id }, "Verifica routing della stazione non riuscita");
              }
              return { result, detour: null };
            }
          }),
        );

        const replacements = new Map<number, StationResult | null>(); // null = esclusa dal routing reale
        for (const { result, detour } of outcomes) {
          if (!detour) continue;
          verified += 1;
          // Con i dati reali la deviazione massima resta il criterio finale di esclusione.
          replacements.set(result.station.id, detour.km > session.detourLimitKm ? null : rescore(result, detour, context));
        }

        session.results = session.results
          .flatMap((result) => {
            const replacement = replacements.get(result.station.id);
            if (replacement === undefined) return [result];
            return replacement === null ? [] : [replacement];
          })
          .sort(byNetSavings);
      }

      session.refinement = finalRefinement({ topCount: attempted.size, verified, failures, budgetReached });
    } catch (error) {
      this.deps.logger?.warn({ error: error instanceof Error ? error.message : String(error) }, "Ricalcolo in background fallito");
      session.refinement = { status: "failed", reason: "routing_error" };
    }
  }
}

/** Campi della risposta comuni alle due modalità, ricavati dalla sessione appena creata. */
function presentBase(session: SearchSession, outcome: SearchOutcome): SearchResponseBase {
  return {
    searchId: session.id,
    referencePrice: { ...session.referencePrice, value: round(session.referencePrice.value, 3) },
    costPerKm: round(session.costPerKm, 4),
    results: session.results.map(present),
    candidatesEvaluated: outcome.candidatesEvaluated,
    pricesUpdatedAt: outcome.lastIngestionAt ? outcome.lastIngestionAt.toISOString() : null,
    livePrices: outcome.livePrices,
    refinement: session.refinement,
    staleStations: { count: outcome.staleCount, maxAgeHours: session.request.maxPriceAgeHours },
  };
}

function initialRefinement(budget: "ok" | "soft_limit" | "hard_limit", resultCount: number): RefinementInfo {
  if (budget === "soft_limit") return { status: "skipped", reason: "budget_soft_limit" };
  if (budget === "hard_limit") return { status: "skipped", reason: "budget_hard_limit" };
  if (resultCount === 0) return { status: "done" };
  return { status: "pending" };
}

function finalRefinement(outcome: {
  topCount: number;
  verified: number;
  failures: number;
  budgetReached: boolean;
}): RefinementInfo {
  if (outcome.budgetReached && outcome.verified === 0) {
    return { status: "skipped", reason: "budget_hard_limit" };
  }
  if (outcome.verified === 0 && outcome.failures > 0) {
    return { status: "failed", reason: "routing_error" };
  }
  return { status: "done" };
}

function scoreCandidate(
  candidate: Candidate,
  detour: Detour,
  source: DetourSource,
  context: ScoringContext,
): StationResult {
  const breakdown = computeNetSavings({
    referencePrice: context.referencePrice,
    stationPrice: candidate.price.price,
    liters: context.request.liters,
    detourKm: detour.km,
    detourMinutes: detour.minutes,
    consumptionKmPerLiter: context.request.consumptionKmPerLiter,
    valueOfTimePerMinute: context.request.valueOfTimePerMinute,
  });

  return {
    station: candidate.station,
    price: candidate.price.price,
    isSelf: candidate.price.isSelf,
    servitoOnly: candidate.price.servitoOnly,
    priceUpdatedAt: candidate.price.communicatedAt,
    lateralDistanceKm: candidate.lateralDistanceKm,
    alongRouteKm: candidate.alongRouteKm,
    detourKm: detour.km,
    detourMinutes: detour.minutes,
    detourSource: source,
    grossSavings: breakdown.grossSavings,
    detourCost: breakdown.detourFuelCost + breakdown.detourTimeCost,
    netSavings: breakdown.netSavings,
  };
}

/** Ricalcola risparmio e costi con la deviazione verificata, mantenendo prezzo e posizione. */
function rescore(result: StationResult, detour: Detour, context: ScoringContext): StationResult {
  const breakdown = computeNetSavings({
    referencePrice: context.referencePrice,
    stationPrice: result.price,
    liters: context.request.liters,
    detourKm: detour.km,
    detourMinutes: detour.minutes,
    consumptionKmPerLiter: context.request.consumptionKmPerLiter,
    valueOfTimePerMinute: context.request.valueOfTimePerMinute,
  });

  return {
    ...result,
    detourKm: detour.km,
    detourMinutes: detour.minutes,
    detourSource: "routing",
    grossSavings: breakdown.grossSavings,
    detourCost: breakdown.detourFuelCost + breakdown.detourTimeCost,
    netSavings: breakdown.netSavings,
  };
}

function groupByStation(rows: readonly CorridorPriceRow[]) {
  const grouped = new Map<number, { summary: StationSummary; options: StationPriceOption[] }>();
  for (const row of rows) {
    let entry = grouped.get(row.stationId);
    if (!entry) {
      entry = {
        summary: {
          id: row.stationId,
          nomeImpianto: row.nomeImpianto,
          bandiera: row.bandiera,
          gestore: row.gestore,
          indirizzo: row.indirizzo,
          comune: row.comune,
          provincia: row.provincia,
          tipoImpianto: row.tipoImpianto,
          lat: row.lat,
          lon: row.lon,
        },
        options: [],
      };
      grouped.set(row.stationId, entry);
    }
    entry.options.push({ isSelf: row.isSelf, price: row.price, communicatedAt: row.communicatedAt });
  }
  return grouped.values();
}

function byNetSavings(a: StationResult, b: StationResult): number {
  return b.netSavings - a.netSavings || a.detourKm - b.detourKm || a.station.id - b.station.id;
}

const FUEL_ORDER: Record<StationPriceEntry["fuelType"], number> = { benzina: 0, diesel: 1, gpl: 2, metano: 3 };

/** Ordine stabile della matrice prezzi: benzina, diesel, GPL, metano; per ciascuno prima il Self. */
function sortPrices(prices: readonly StationPriceEntry[]): StationPriceEntry[] {
  return [...prices].sort((a, b) => FUEL_ORDER[a.fuelType] - FUEL_ORDER[b.fuelType] || Number(b.isSelf) - Number(a.isSelf));
}

/** «Evita autostrada»: lo stesso tipo di percorso per il diretto e per le verifiche, così la deviazione è confrontabile. */
function routeOptions(request: SearchOptions): RouteOptions {
  return { avoidMotorway: request.avoidMotorway, avoidTolls: request.avoidTolls, avoidFerries: request.avoidFerries };
}

/**
 * Opzioni delle richieste «via stazione». In «Intorno a me» il giro è andata e ritorno dallo stesso punto: alla stazione si
 * può invertire la marcia (come fa un navigatore e come mostra Google Maps); senza, Directions ci fa girare attorno a un
 * isolato e il giro risulta più lungo di quello vero. In «In viaggio» resta il comportamento predefinito.
 */
function viaRouteOptions(session: SearchSession): RouteOptions {
  const options = routeOptions(session.request);
  return session.mode === "nearby" ? { ...options, continueStraight: false } : options;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/** Arrotondamenti per la risposta API: la classifica interna resta sui valori pieni. */
function present(result: StationResult): StationResult {
  return {
    ...result,
    price: round(result.price, 3),
    lateralDistanceKm: round(result.lateralDistanceKm, 2),
    alongRouteKm: round(result.alongRouteKm, 1),
    detourKm: round(result.detourKm, 2),
    detourMinutes: round(result.detourMinutes, 1),
    grossSavings: round(result.grossSavings, 2),
    detourCost: round(result.detourCost, 2),
    netSavings: round(result.netSavings, 2),
  };
}

import type { Coordinate } from "@tappafurba/core";
import type { LonLat } from "@tappafurba/shared";

export interface RouteResult {
  distanceKm: number;
  durationMinutes: number;
  /** Tracciato completo, [lon, lat]. */
  geometry: Coordinate[];
}

/** Opzioni di una richiesta di percorso: l'insieme delle esclusioni (Directions `exclude`). */
export interface RouteOptions {
  /** Percorso senza autostrada (`exclude=motorway`). */
  avoidMotorway?: boolean;
  /** Percorso senza strade a pedaggio (`exclude=toll`). */
  avoidTolls?: boolean;
  /** Percorso senza traghetti (`exclude=ferry`). */
  avoidFerries?: boolean;
  /**
   * `false` = ai waypoint intermedi è ammessa l'inversione di marcia (Directions `continue_straight=false`). Directions di
   * default sulle auto non la ammette: arrivato alla stazione dovrebbe proseguire dritto e tornare indietro girando
   * attorno a un isolato (verificato su dati reali: 4,59 km invece di 3,84 km per un giro andata e ritorno).
   * Assente = comportamento predefinito del provider.
   */
  continueStraight?: boolean;
}

/** Valori Directions `exclude` dell'insieme di opzioni, in ordine fisso (così la stessa combinazione ha sempre la stessa chiave). */
export function routeExclusions(options?: RouteOptions): string[] {
  const exclusions: string[] = [];
  if (options?.avoidMotorway) exclusions.push("motorway");
  if (options?.avoidTolls) exclusions.push("toll");
  if (options?.avoidFerries) exclusions.push("ferry");
  return exclusions;
}

/**
 * Astrae il motore di routing (TappaFurba non ne costruisce uno proprio).
 * Implementazioni: MapboxRoutingProvider (produzione), MockRoutingProvider (test/dev senza chiavi).
 * Decoratori componibili: BudgetedRoutingProvider (kill switch), InFlightRoutingProvider (deduplica le richieste in corso; nessuna cache).
 */
export interface RoutingProvider {
  /**
   * Percorso guidabile che passa per i waypoint nell'ordine dato (almeno 2).
   * Restituisce null se non esiste un percorso; lancia un errore per problemi
   * di rete, credenziali o quota.
   */
  getRoute(waypoints: readonly LonLat[], options?: RouteOptions): Promise<RouteResult | null>;
}

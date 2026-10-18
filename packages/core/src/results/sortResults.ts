import type { StationResult } from "@tappafurba/shared";

/**
 * Ordinamenti della lista risultati (schermata Risultati), applicabili lato client sui risultati già ricevuti:
 *
 * - `savings` «Più conveniente»: risparmio netto decrescente.
 * - `detour`  «Minor deviazione»: km extra crescenti (quelli verificati col routing reale; la stima proxy se manca la
 *   verifica), a pari km la stazione più vicina al tracciato, poi quella che si incontra per prima partendo da A
 *   (`alongRouteKm`), infine il risparmio netto maggiore.
 */
export type ResultSortMode = "savings" | "detour";

const bySavings = (a: StationResult, b: StationResult) => b.netSavings - a.netSavings;

const COMPARATORS: Record<ResultSortMode, (a: StationResult, b: StationResult) => number> = {
  savings: bySavings,
  detour: (a, b) =>
    a.detourKm - b.detourKm || a.lateralDistanceKm - b.lateralDistanceKm || a.alongRouteKm - b.alongRouteKm || bySavings(a, b),
};

/** Restituisce una nuova lista ordinata; l'input non viene modificato. */
export function sortResults(results: readonly StationResult[], mode: ResultSortMode): StationResult[] {
  return [...results].sort(COMPARATORS[mode]);
}

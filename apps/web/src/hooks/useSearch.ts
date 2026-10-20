import type { RefinementInfo, StationResult } from "@tappafurba/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, fetchRefinement, searchNearby, searchStations } from "../lib/api";
import { isNearbyRequest, type AnySearchRequest, type AnySearchResponse } from "../lib/searchMode";

export type SearchState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; error: ApiError }
  | {
      status: "success";
      response: AnySearchResponse;
      results: StationResult[];
      refinement: RefinementInfo;
      /** Richiesta e nomi dei luoghi con cui è stata fatta la ricerca (servono alla schermata Risultati). */
      request: AnySearchRequest;
      labels: SearchLabels;
    };

export interface SearchLabels {
  origin: string;
  /** Vuota in «Intorno a me»: lì c'è solo il punto di partenza. */
  destination: string;
  /** true se l'estremo era la posizione attuale (GPS): lo storico lo salva come flag, non come indirizzo. */
  originCurrent?: boolean;
  destinationCurrent?: boolean;
}

const POLL_INTERVAL_MS = 800;
const POLL_MAX_ATTEMPTS = 25; // ~20 s: oltre, si tengono le stime proxy già mostrate

const isAbort = (error: unknown) => error instanceof DOMException && error.name === "AbortError";

const toApiError = (error: unknown) =>
  error instanceof ApiError ? error : new ApiError("UNKNOWN", "Si è verificato un errore imprevisto. Riprova.", 0);

/**
 * Ricerca in due fasi (POST /search «In viaggio» oppure POST /nearby «Intorno a me»): risponde subito con il ranking proxy; se il
 * server sta verificando le prime stazioni col routing reale ("pending"), si
 * interroga GET /search/:id finché non termina e si sostituisce l'elenco.
 * Una nuova ricerca annulla qualsiasi richiesta o polling ancora in corso.
 */
export function useSearch() {
  const [state, setState] = useState<SearchState>({ status: "idle" });
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => () => controllerRef.current?.abort(), []);

  const search = useCallback(async (request: AnySearchRequest, labels: SearchLabels) => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setState({ status: "loading" });

    let response: AnySearchResponse;
    try {
      response = isNearbyRequest(request) ? await searchNearby(request, controller.signal) : await searchStations(request, controller.signal);
    } catch (error) {
      if (!isAbort(error)) setState({ status: "error", error: toApiError(error) });
      return;
    }

    setState({ status: "success", response, results: response.results, refinement: response.refinement, request, labels });
    if (response.refinement.status !== "pending") return;

    for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt++) {
      try {
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(resolve, POLL_INTERVAL_MS);
          controller.signal.addEventListener("abort", () => { clearTimeout(timer); reject(new DOMException("Aborted", "AbortError")); }, { once: true });
        });
        const update = await fetchRefinement(response.searchId, controller.signal);
        if (update.refinement.status === "pending") continue;
        setState({ status: "success", response, results: update.results, refinement: update.refinement, request, labels });
        return;
      } catch (error) {
        if (isAbort(error)) return;
        // Sessione scaduta o errore di rete: si conservano le stime già mostrate.
        setState({ status: "success", response, results: response.results, refinement: { status: "failed", reason: "routing_error" }, request, labels });
        return;
      }
    }
    setState({ status: "success", response, results: response.results, refinement: { status: "failed", reason: "routing_error" }, request, labels });
  }, []);

  return { state, search };
}

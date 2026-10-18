import type { GeocodeSuggestion, LonLat } from "@tappafurba/shared";
import { useEffect, useState } from "react";
import { autocompleteAddress } from "../lib/api";
import { useDebouncedValue } from "./useDebouncedValue";

/** Debounce e soglia minima: riducono costi e dati inviati a terzi. */
export const AUTOCOMPLETE_DEBOUNCE_MS = 350;
export const AUTOCOMPLETE_MIN_CHARS = 3;

interface State {
  suggestions: GeocodeSuggestion[];
  loading: boolean;
  error: boolean;
  /** true quando la risposta ricevuta riguarda il testo digitato adesso (non uno precedente, non in attesa del debounce). */
  settled: boolean;
}

const EMPTY: State = { suggestions: [], loading: false, error: false, settled: false };

/**
 * @param query testo digitato
 * @param enabled false quando non serve cercare (campo non attivo o luogo già scelto)
 */
export function useAddressAutocomplete(query: string, enabled: boolean, proximity?: LonLat): State {
  const trimmed = query.trim();
  const debounced = useDebouncedValue(trimmed, AUTOCOMPLETE_DEBOUNCE_MS);
  const [state, setState] = useState<State & { forQuery: string }>({ ...EMPTY, forQuery: "" });

  const proximityLon = proximity?.lon;
  const proximityLat = proximity?.lat;

  useEffect(() => {
    if (!enabled || debounced.length < AUTOCOMPLETE_MIN_CHARS) {
      setState({ ...EMPTY, forQuery: "" });
      return;
    }

    const controller = new AbortController();
    setState((previous) => ({ ...previous, loading: true, error: false }));

    const near = proximityLon !== undefined && proximityLat !== undefined ? { lon: proximityLon, lat: proximityLat } : undefined;
    autocompleteAddress(debounced, near, controller.signal)
      .then((suggestions) => setState({ suggestions, loading: false, error: false, settled: true, forQuery: debounced }))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setState({ suggestions: [], loading: false, error: true, settled: true, forQuery: debounced });
      });

    return () => controller.abort();
  }, [debounced, enabled, proximityLon, proximityLat]);

  // Finché il testo attuale è sotto soglia (o non è ancora passato il debounce) non si mostrano suggerimenti vecchi.
  const belowThreshold = trimmed.length < AUTOCOMPLETE_MIN_CHARS;
  if (belowThreshold || !enabled) return EMPTY;
  return { suggestions: state.suggestions, loading: state.loading, error: state.error, settled: state.settled && state.forQuery === trimmed && !state.loading };
}

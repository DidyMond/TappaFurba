import type { GeocodeSuggestion, LonLat } from "@tappafurba/shared";

export interface AutocompleteOptions {
  /** Bias di prossimità (es. posizione dell'utente): i risultati vicini salgono in classifica. */
  proximity?: LonLat;
  limit?: number;
}

/**
 * Astrae il servizio di geocoding/autocomplete degli indirizzi A/B.
 * Implementazioni: MapboxGeocodingProvider (produzione), FixtureGeocodingProvider (test, zero rete).
 *
 * Risultati da usare "al volo": non vanno salvati in un database (su Mapbox
 * sarebbe "permanent geocoding", senza free tier).
 */
export interface GeocodingProvider {
  autocomplete(query: string, options?: AutocompleteOptions): Promise<GeocodeSuggestion[]>;
  /** Etichetta leggibile per delle coordinate, o null se non trovata. */
  reverse(point: LonLat): Promise<string | null>;
}

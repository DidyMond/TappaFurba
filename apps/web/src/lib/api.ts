import type {
  ApiErrorBody,
  GeocodeAutocompleteResponse,
  GeocodeReverseResponse,
  GeocodeSuggestion,
  LonLat,
  NearbyRequest,
  NearbyResponse,
  SearchRefinementResponse,
  SearchRequest,
  SearchResponse,
  StationDetailResponse,
  StationRouteResponse,
} from "@tappafurba/shared";
import { isOffline, OFFLINE_MESSAGE } from "./connectivity";

const BASE_URL: string = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3001";

export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      ...init,
      headers: { ...(init.body ? { "Content-Type": "application/json" } : {}), ...init.headers },
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    // Offline: i dati non vengono mai serviti da una cache, quindi lo si dice chiaramente (la shell si apre comunque).
    if (isOffline()) throw new ApiError("OFFLINE", OFFLINE_MESSAGE, 0);
    throw new ApiError("NETWORK_ERROR", "Impossibile contattare il server. Controlla la connessione e riprova.", 0);
  }

  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const apiError = (body as Partial<ApiErrorBody> | null)?.error;
    throw new ApiError(apiError?.code ?? "UNKNOWN", apiError?.message ?? `Errore del server (${response.status}).`, response.status);
  }
  return body as T;
}

export async function autocompleteAddress(
  query: string,
  proximity: LonLat | undefined,
  signal: AbortSignal,
): Promise<GeocodeSuggestion[]> {
  const params = new URLSearchParams({ q: query });
  if (proximity) {
    params.set("lon", String(proximity.lon));
    params.set("lat", String(proximity.lat));
  }
  const { suggestions } = await request<GeocodeAutocompleteResponse>(`/geocode/autocomplete?${params}`, { signal });
  return suggestions;
}

/** Etichetta leggibile per delle coordinate, o null se il server non ne trova una. */
export async function reverseGeocode(point: LonLat): Promise<string | null> {
  try {
    const { label } = await request<GeocodeReverseResponse>(`/geocode/reverse?lon=${point.lon}&lat=${point.lat}`);
    return label;
  } catch {
    return null;
  }
}

export function searchStations(body: SearchRequest, signal: AbortSignal): Promise<SearchResponse> {
  return request<SearchResponse>("/search", { method: "POST", body: JSON.stringify(body), signal });
}

/** «Intorno a me»: le stazioni attorno a un punto. Stessa sessione e stesso ricalcolo di `searchStations`. */
export function searchNearby(body: NearbyRequest, signal: AbortSignal): Promise<NearbyResponse> {
  return request<NearbyResponse>("/nearby", { method: "POST", body: JSON.stringify(body), signal });
}

export function fetchRefinement(searchId: string, signal: AbortSignal): Promise<SearchRefinementResponse> {
  return request<SearchRefinementResponse>(`/search/${searchId}`, { signal });
}

/** Percorso A→stazione→B di una stazione tra i risultati (route con sosta). Fallisce se il routing non è disponibile. */
export function fetchStationRoute(searchId: string, stationId: number, signal: AbortSignal): Promise<StationRouteResponse> {
  return request<StationRouteResponse>(`/search/${searchId}/stations/${stationId}/route`, { signal });
}

/** Dettaglio di una stazione per una ricerca (Screen 3): deviazione verificata on-demand, prezzi, impatto. */
export function fetchStationDetail(searchId: string, stationId: number, signal: AbortSignal): Promise<StationDetailResponse> {
  return request<StationDetailResponse>(`/search/${searchId}/stations/${stationId}`, { signal });
}

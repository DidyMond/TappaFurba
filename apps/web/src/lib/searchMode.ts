import type { NearbyRequest, NearbyResponse, SearchRequest, SearchResponse } from "@tappafurba/shared";

/** Una ricerca può essere «In viaggio» (lungo un percorso A→B) o «Intorno a me» (attorno a un punto). */
export type AnySearchRequest = SearchRequest | NearbyRequest;
export type AnySearchResponse = SearchResponse | NearbyResponse;

/** `true` se la richiesta è quella di «Intorno a me» (ha un raggio e nessuna destinazione). */
export function isNearbyRequest(request: AnySearchRequest): request is NearbyRequest {
  return "radiusKm" in request;
}

/** `true` se la risposta è quella di «Intorno a me» (ha il blocco `nearby` invece del percorso). */
export function isNearbyResponse(response: AnySearchResponse): response is NearbyResponse {
  return "nearby" in response;
}

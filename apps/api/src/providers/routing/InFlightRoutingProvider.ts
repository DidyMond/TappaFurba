import type { LonLat } from "@tappafurba/shared";
import { routeExclusions, type RouteOptions, type RouteResult, type RoutingProvider } from "./RoutingProvider";

/**
 * Deduplica delle richieste Directions IN CORSO: due richieste identiche e contemporanee condividono una sola chiamata
 * al provider. NON è una cache: la voce esiste solo mentre la richiesta è in volo e viene tolta nell'istante in cui
 * si conclude (risposta, `null` o errore). Dopo, ogni richiesta fa una nuova chiamata.
 *
 * Perché: i Product Terms di Mapbox (§2.10.1) vietano di «export, download, cache or store results from any request to a
 * Navigation API», e la documentazione Mapbox classifica la Directions API tra le API del «Navigation Service».
 * Una cache in memoria non sarebbe compatibile; l'unica condivisione che
 * resta è tra richieste sovrapposte nel tempo (una sola risposta in arrivo che soddisfa più chiamanti).
 */
export class InFlightRoutingProvider implements RoutingProvider {
  private readonly inFlight = new Map<string, Promise<RouteResult | null>>();

  constructor(private readonly inner: RoutingProvider) {}

  /** Solo per i test e la diagnosi: quante richieste sono in volo adesso. */
  get pending(): number {
    return this.inFlight.size;
  }

  getRoute(waypoints: readonly LonLat[], options?: RouteOptions): Promise<RouteResult | null> {
    const key = requestKey(waypoints, options);
    const running = this.inFlight.get(key);
    if (running) return running;

    const promise = this.inner.getRoute(waypoints, options);
    this.inFlight.set(key, promise);
    // Conclusa la richiesta (in qualunque modo) la voce sparisce: nessun risultato resta in memoria.
    const release = () => {
      if (this.inFlight.get(key) === promise) this.inFlight.delete(key);
    };
    promise.then(release, release);
    return promise;
  }
}

/**
 * Coordinate arrotondate a 4 decimali (~11 m): richieste quasi identiche condividono la chiamata in corso. Ogni insieme
 * di esclusioni (autostrada, pedaggi, traghetti) è un'altra richiesta: ha una chiave diversa.
 */
function requestKey(waypoints: readonly LonLat[], options?: RouteOptions): string {
  const points = waypoints.map((point) => `${point.lon.toFixed(4)},${point.lat.toFixed(4)}`).join("|");
  const exclusions = routeExclusions(options);
  return exclusions.length > 0 ? `${points}#exclude=${exclusions.join(",")}` : points;
}

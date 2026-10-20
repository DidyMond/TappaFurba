import type { Coordinate } from "@tappafurba/core";
import type { LonLat } from "@tappafurba/shared";
import { z } from "zod";
import { ProviderError } from "../../errors";
import { routeExclusions, type RouteOptions, type RouteResult, type RoutingProvider } from "./RoutingProvider";

const responseSchema = z.object({
  code: z.string(),
  routes: z
    .array(
      z.object({
        distance: z.number(),
        duration: z.number(),
        geometry: z.object({ coordinates: z.array(z.tuple([z.number(), z.number()])) }),
      }),
    )
    .optional(),
});

/** Codici Directions che significano "nessun percorso", non un errore. */
const NO_ROUTE_CODES = new Set(["NoRoute", "NoSegment"]);

export interface MapboxRoutingProviderOptions {
  /** Token Mapbox lato server (senza restrizioni URL: le chiamate partono dal backend). */
  token: string;
  /** Profilo Directions. `mapbox/driving`: risultati deterministici e cache-abili (niente traffico live). */
  profile?: string;
  baseUrl?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export class MapboxRoutingProvider implements RoutingProvider {
  private readonly token: string;
  private readonly profile: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: MapboxRoutingProviderOptions) {
    this.token = options.token;
    this.profile = options.profile ?? "mapbox/driving";
    this.baseUrl = options.baseUrl ?? "https://api.mapbox.com/directions/v5";
    this.timeoutMs = options.timeoutMs ?? 10_000;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async getRoute(waypoints: readonly LonLat[], options: RouteOptions = {}): Promise<RouteResult | null> {
    if (waypoints.length < 2 || waypoints.length > 25) {
      throw new RangeError("Directions accetta da 2 a 25 waypoint");
    }

    const coordinates = waypoints.map((point) => `${point.lon},${point.lat}`).join(";");
    const params = new URLSearchParams({
      geometries: "geojson",
      overview: "full",
      alternatives: "false",
      steps: "false",
      access_token: this.token,
    });
    // Directions accetta più valori separati da virgola (verificato: motorway, toll, ferry su mapbox/driving).
    const exclusions = routeExclusions(options);
    if (exclusions.length > 0) params.set("exclude", exclusions.join(","));
    // Solo `false` cambia qualcosa: il valore predefinito di Directions per le auto è `true`.
    if (options.continueStraight === false) params.set("continue_straight", "false");

    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}/${this.profile}/${coordinates}?${params.toString()}`, {
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch {
      // Nessun dettaglio dell'errore originale: potrebbe includere l'URL con il token.
      throw new ProviderError("Il servizio dei percorsi non è raggiungibile: riprova tra poco.", "routing: rete non raggiungibile");
    }

    if (response.status === 401 || response.status === 403) {
      throw new ProviderError("Il servizio dei percorsi non è disponibile al momento.", `routing: credenziali non valide o non autorizzate (HTTP ${response.status})`);
    }
    if (response.status === 429) {
      throw new ProviderError("Il servizio dei percorsi ha troppe richieste: riprova tra poco.", "routing: HTTP 429");
    }

    const body: unknown = await response.json().catch(() => null);
    const parsed = responseSchema.safeParse(body);

    // Directions risponde 422 (o 200) con un `code` applicativo quando non trova un percorso.
    if (parsed.success && NO_ROUTE_CODES.has(parsed.data.code)) {
      return null;
    }
    if (!response.ok) {
      throw new ProviderError("Il servizio dei percorsi non è disponibile al momento.", `routing: HTTP ${response.status}`);
    }
    if (!parsed.success || parsed.data.code !== "Ok") {
      throw new ProviderError("Il servizio dei percorsi non è disponibile al momento.", "routing: risposta non riconosciuta");
    }

    const route = parsed.data.routes?.[0];
    if (!route) {
      return null;
    }

    return {
      distanceKm: route.distance / 1000,
      durationMinutes: route.duration / 60,
      geometry: route.geometry.coordinates as Coordinate[],
    };
  }
}

import type { GeocodeSuggestion, LonLat } from "@tappafurba/shared";
import { z } from "zod";
import { ProviderError } from "../../errors";
import type { AutocompleteOptions, GeocodingProvider } from "./GeocodingProvider";

const featureSchema = z.object({
  properties: z.object({
    mapbox_id: z.string(),
    name: z.string(),
    /** La forma corretta del nome: `name` può essere un alias dell'anagrafe stradale («Via Esempio Giuseppe 12»). */
    name_preferred: z.string().optional(),
    full_address: z.string().optional(),
    place_formatted: z.string().optional(),
    coordinates: z.object({ longitude: z.number(), latitude: z.number() }),
  }),
});

const responseSchema = z.object({ features: z.array(z.unknown()) });

export interface MapboxGeocodingProviderOptions {
  /** Token Mapbox lato server. */
  token: string;
  baseUrl?: string;
  timeoutMs?: number;
  /** Iniettabile nei test per non toccare la rete. */
  fetchImpl?: typeof fetch;
}

/**
 * Mapbox Geocoding API v6 (endpoint /search/geocode/v6), NON la Search Box API:
 * quest'ultima ha un free tier di sole 500 sessioni/mese.
 */
export class MapboxGeocodingProvider implements GeocodingProvider {
  private readonly token: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: MapboxGeocodingProviderOptions) {
    this.token = options.token;
    this.baseUrl = options.baseUrl ?? "https://api.mapbox.com/search/geocode/v6";
    this.timeoutMs = options.timeoutMs ?? 8_000;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async autocomplete(query: string, options: AutocompleteOptions = {}): Promise<GeocodeSuggestion[]> {
    const params = new URLSearchParams({
      q: query,
      country: "it",
      language: "it",
      autocomplete: "true",
      limit: String(options.limit ?? 5),
    });
    if (options.proximity) {
      params.set("proximity", `${options.proximity.lon},${options.proximity.lat}`);
    }

    const body = await this.request("forward", params);
    return this.parseFeatures(body).map(toSuggestion);
  }

  async reverse(point: LonLat): Promise<string | null> {
    const params = new URLSearchParams({
      longitude: String(point.lon),
      latitude: String(point.lat),
      language: "it",
      limit: "1",
    });

    const body = await this.request("reverse", params);
    const first = this.parseFeatures(body)[0];
    return first ? toSuggestion(first).label : null;
  }

  private async request(path: "forward" | "reverse", params: URLSearchParams): Promise<unknown> {
    params.set("access_token", this.token);

    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}/${path}?${params.toString()}`, {
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch {
      // Nessun dettaglio dell'errore originale: potrebbe includere l'URL con il token.
      throw new ProviderError("Il servizio di ricerca degli indirizzi non è raggiungibile: riprova tra poco.", "geocoding: rete non raggiungibile");
    }

    if (response.status === 401 || response.status === 403) {
      throw new ProviderError("Il servizio di ricerca degli indirizzi non è disponibile al momento.", `geocoding: credenziali non valide o non autorizzate (HTTP ${response.status})`);
    }
    if (response.status === 429) {
      throw new ProviderError("Il servizio di ricerca degli indirizzi ha troppe richieste: riprova tra poco.", "geocoding: HTTP 429");
    }
    if (!response.ok) {
      throw new ProviderError("Il servizio di ricerca degli indirizzi non è disponibile al momento.", `geocoding: HTTP ${response.status}`);
    }

    return response.json();
  }

  private parseFeatures(body: unknown): Array<z.infer<typeof featureSchema>> {
    const parsed = responseSchema.safeParse(body);
    if (!parsed.success) {
      throw new ProviderError("Il servizio di ricerca degli indirizzi non è disponibile al momento.", "geocoding: risposta non riconosciuta");
    }
    // Una feature malformata viene scartata senza far fallire l'intera risposta.
    return parsed.data.features.flatMap((feature) => {
      const result = featureSchema.safeParse(feature);
      return result.success ? [result.data] : [];
    });
  }
}

function toSuggestion(feature: z.infer<typeof featureSchema>): GeocodeSuggestion {
  const { mapbox_id, name, name_preferred, full_address, place_formatted, coordinates } = feature.properties;
  // Mapbox cerca anche sugli alias («Via Esempio Giuseppe 12» per «Via Giuseppe Esempio 12»): all'utente va mostrata la forma
  // preferita, che è anche quella dell'indirizzo completo.
  const shownName = name_preferred ?? name;
  const label = full_address ?? [shownName, place_formatted].filter(Boolean).join(", ");
  return { id: mapbox_id, name: shownName, label, lon: coordinates.longitude, lat: coordinates.latitude };
}

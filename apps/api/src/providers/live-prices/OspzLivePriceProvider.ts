import type { LiveStationInput } from "@tappafurba/core";
import type { LonLat } from "@tappafurba/shared";
import { z } from "zod";
import { ProviderError, RateLimitedProviderError } from "../../errors";
import type { LivePriceProvider } from "./LivePriceProvider";

/** Il sito accetta al massimo 10 km: oltre, il raggio viene troncato lato server. */
export const OSPZ_MAX_RADIUS_KM = 10;

const stationSchema = z.object({
  id: z.number().int().positive(),
  insertDate: z.string(),
  fuels: z.array(z.object({ name: z.string(), price: z.number(), isSelf: z.boolean() })),
});

const responseSchema = z.object({
  success: z.boolean().optional(),
  results: z.array(z.unknown()),
});

export interface OspzLivePriceProviderOptions {
  /** Es. https://carburanti.mise.gov.it/ospzApi */
  baseUrl: string;
  /** Identifica l'applicazione verso il gestore del servizio. */
  userAgent: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

/**
 * Prezzi in tempo reale dal sito ufficiale "Osservaprezzi carburanti" del MIMIT
 * (`POST {baseUrl}/search/zone`, lo stesso endpoint che alimenta la ricerca per
 * zona del sito).
 *
 * ATTENZIONE: non è un'API pubblica documentata né con SLA. Il formato può
 * cambiare senza preavviso (è già successo: l'endpoint `/OssPrezziSearch` del
 * 2019 non esiste più). Per questo: lettura solo lato server, timeout, cache per
 * riquadro, circuit breaker a monte e fallback sul file giornaliero.
 */
export class OspzLivePriceProvider implements LivePriceProvider {
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: OspzLivePriceProviderOptions) {
    this.timeoutMs = options.timeoutMs ?? 12_000;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async fetchZone(center: LonLat, radiusKm: number): Promise<LiveStationInput[]> {
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.options.baseUrl.replace(/\/$/, "")}/search/zone`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "User-Agent": this.options.userAgent,
        },
        body: JSON.stringify({
          points: [{ lat: center.lat, lng: center.lon }],
          radius: Math.min(radiusKm, OSPZ_MAX_RADIUS_KM),
          priceOrder: "asc",
        }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch {
      throw new ProviderError("Fonte prezzi in tempo reale non raggiungibile");
    }

    if (response.status === 429) {
      throw new RateLimitedProviderError("Fonte prezzi in tempo reale: troppe richieste (HTTP 429)", parseRetryAfterMs(response.headers.get("retry-after")));
    }

    if (!response.ok) {
      throw new ProviderError(`Fonte prezzi in tempo reale: HTTP ${response.status}`);
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      // Tipico quando il sito risponde con una pagina HTML (redirect, manutenzione, cambio di formato).
      throw new ProviderError("Fonte prezzi in tempo reale: risposta non valida");
    }

    const parsed = responseSchema.safeParse(payload);
    if (!parsed.success) {
      throw new ProviderError("Fonte prezzi in tempo reale: formato inatteso");
    }

    const stations: LiveStationInput[] = [];
    for (const raw of parsed.data.results) {
      const station = stationSchema.safeParse(raw);
      if (!station.success) continue;
      stations.push({
        stationId: station.data.id,
        communicatedAt: station.data.insertDate,
        fuels: station.data.fuels,
      });
    }
    return stations;
  }
}

/** Retry-After può essere in secondi o una data HTTP; valori assurdi vengono ignorati. */
export function parseRetryAfterMs(header: string | null, now: number = Date.now()): number | undefined {
  if (!header) return undefined;
  const seconds = Number(header);
  const ms = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(header) - now;
  return Number.isFinite(ms) && ms > 0 && ms <= 3_600_000 ? ms : undefined;
}

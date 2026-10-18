import type { LonLat } from "@tappafurba/shared";
import { autocompleteAddress } from "./api";
import { isOffline } from "./connectivity";
import type { RecentEndpoint } from "./recentRoutes";

/** Un luogo risolto di fresco: coordinate di una richiesta di geocoding appena fatta (o del GPS), mai salvate. */
export interface ResolvedPlace {
  lon: number;
  lat: number;
  label: string;
}

export type RecentResolveFailure = "offline" | "not-found" | "service" | "geolocation-unsupported" | "geolocation-denied" | "geolocation-unavailable";

export class RecentResolveError extends Error {
  constructor(
    readonly kind: RecentResolveFailure,
    /** Il testo dell'estremo che non si è riusciti a ritrovare. */
    readonly text: string,
  ) {
    super(kind);
  }
}

export const RESOLVE_OFFLINE_MESSAGE = "Sei offline: per ritrovare i luoghi di questo tragitto serve la connessione. Riconnettiti e riprova.";
export const RESOLVE_SERVICE_MESSAGE =
  "Non riesco a ritrovare i luoghi di questo tragitto: il servizio non risponde. Riprova tra poco o scegli partenza e destinazione dai suggerimenti.";
const RESOLVE_GEOLOCATION_MESSAGE = "Non riesco a leggere la posizione del dispositivo (permesso negato o non disponibile): scegli il luogo dai suggerimenti.";

/** Il messaggio da mostrare all'utente per un fallimento. Nessuna coordinata salvata viene mai usata come ripiego. */
export function describeResolveFailure(error: RecentResolveError): string {
  switch (error.kind) {
    case "offline":
      return RESOLVE_OFFLINE_MESSAGE;
    case "not-found":
      return `Non ho trovato «${error.text}» sulla mappa: modifica il testo e scegli un suggerimento.`;
    case "service":
      return RESOLVE_SERVICE_MESSAGE;
    case "geolocation-unsupported":
      return "Il tuo browser non supporta la geolocalizzazione: scegli il luogo dai suggerimenti.";
    default:
      return RESOLVE_GEOLOCATION_MESSAGE;
  }
}

function devicePosition(text: string): Promise<LonLat> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new RecentResolveError("geolocation-unsupported", text));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({ lon: position.coords.longitude, lat: position.coords.latitude }),
      (error) => reject(new RecentResolveError(error.code === error.PERMISSION_DENIED ? "geolocation-denied" : "geolocation-unavailable", text)),
      { timeout: 10_000, maximumAge: 60_000 },
    );
  });
}

/**
 * Ritrova un estremo di un tragitto salvato. Lo storico conserva solo testi: il luogo si ottiene SEMPRE di fresco —
 * una nuova richiesta di geocoding (temporanea) per il testo, o il GPS del dispositivo per la «posizione attuale».
 * Se la richiesta fallisce o si è offline si segnala l'errore: non esistono coordinate salvate da riusare.
 */
export async function resolveRecentEndpoint(endpoint: RecentEndpoint, options: { signal: AbortSignal; proximity?: LonLat }): Promise<ResolvedPlace> {
  if (endpoint.current) {
    const point = await devicePosition(endpoint.text);
    return { ...point, label: endpoint.text };
  }
  if (isOffline()) throw new RecentResolveError("offline", endpoint.text);
  let suggestions;
  try {
    suggestions = await autocompleteAddress(endpoint.text, options.proximity, options.signal);
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new RecentResolveError("service", endpoint.text);
  }
  const first = suggestions[0];
  if (!first) throw new RecentResolveError("not-found", endpoint.text);
  // L'etichetta resta il testo salvato: è la chiave con cui il tragitto è nello storico.
  return { lon: first.lon, lat: first.lat, label: endpoint.text };
}

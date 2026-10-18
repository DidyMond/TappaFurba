import { copyText } from "./clipboard";

export interface SharePayload {
  title: string;
  text: string;
  url: string;
}

/**
 * - `shared`: aperto il foglio di condivisione del sistema (Web Share API);
 * - `copied`: Web Share API assente, testo e link copiati negli appunti;
 * - `cancelled`: l'utente ha chiuso il foglio di condivisione;
 * - `failed`: né condivisione né copia sono riuscite.
 */
export type ShareOutcome = "shared" | "copied" | "cancelled" | "failed";

/** Condivide la stazione con la Web Share API; senza (desktop) copia testo e link negli appunti. */
export async function shareStation(payload: SharePayload): Promise<ShareOutcome> {
  if (typeof navigator.share === "function") {
    try {
      await navigator.share(payload);
      return "shared";
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return "cancelled";
      // altro errore (es. permesso): si prova la copia
    }
  }
  return (await copyText(`${payload.text}\n${payload.url}`)) ? "copied" : "failed";
}

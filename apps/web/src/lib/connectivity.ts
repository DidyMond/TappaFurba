/** Il browser dichiara di essere offline (`navigator.onLine === false`). Se non lo sa dire, si presume online. */
export const isOffline = (): boolean => typeof navigator !== "undefined" && navigator.onLine === false;

/**
 * Messaggi offline. L'app (la «shell») si apre anche senza rete grazie al service worker, ma prezzi, ricerche e mappa
 * non vengono mai messi in cache: senza connessione si dice chiaramente, invece di mostrare dati vecchi.
 */
export const OFFLINE_MESSAGE =
  "Sei offline: la ricerca ha bisogno della connessione. L'app si apre comunque, ma prezzi e mappa non sono disponibili offline.";
export const OFFLINE_SUGGESTIONS_MESSAGE = "Sei offline: i suggerimenti di indirizzo richiedono la connessione. Riconnettiti per cercare.";
export const OFFLINE_MAP_TITLE = "Mappa non disponibile offline";
export const OFFLINE_MAP_DETAIL = "L'elenco delle stazioni già caricato resta visibile. Riconnettiti per rivedere la mappa.";

import type { ApiError } from "../lib/api";

const ERROR_TITLES: Record<string, string> = {
  RATE_LIMITED: "Troppe ricerche ravvicinate",
  NO_ROUTE: "Percorso non trovato",
  NO_PRICE_DATA: "Prezzi non disponibili",
  BUDGET_EXHAUSTED: "Servizio temporaneamente non disponibile",
  NETWORK_ERROR: "Server non raggiungibile",
  OFFLINE: "Sei offline",
};

/** Errore di una ricerca, mostrato sotto il form nella Home (i risultati vivono nella schermata Risultati). */
export function SearchError({ error }: { error: ApiError }) {
  return (
    <div role="alert" className="rounded-lg bg-error-container text-on-error-container p-space-xl">
      <h2 className="text-headline-sm font-headline-sm">{ERROR_TITLES[error.code] ?? "Ricerca non riuscita"}</h2>
      <p className="mt-space-xs text-body-md font-body-md">{error.message}</p>
    </div>
  );
}

export type ErrorCode =
  | "VALIDATION_ERROR"
  | "NO_ROUTE"
  | "NO_PRICE_DATA"
  | "NOT_FOUND"
  | "SEARCH_NOT_FOUND"
  | "BUDGET_EXHAUSTED"
  | "PROVIDER_ERROR"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR";

/** Errore atteso, con codice stabile per il client e status HTTP associato. */
export class AppError extends Error {
  constructor(
    readonly code: ErrorCode,
    readonly httpStatus: number,
    message: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}

/**
 * Errore di un provider esterno (Mapbox). Il messaggio non deve mai contenere
 * l'URL della richiesta: include il token di accesso come query param.
 */
export class ProviderError extends AppError {
  constructor(
    message: string,
    /** Dettaglio tecnico (codice HTTP, risposta non riconosciuta…): resta nei log del server, non arriva all'utente. */
    readonly detail?: string,
  ) {
    super("PROVIDER_ERROR", 502, message);
    this.name = "ProviderError";
  }
}

/** Il servizio esterno ci sta limitando (HTTP 429): occorre rallentare, non riprovare subito. */
export class RateLimitedProviderError extends ProviderError {
  constructor(
    message: string,
    /** Attesa richiesta dal servizio (header Retry-After), se indicata. */
    readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = "RateLimitedProviderError";
  }
}

export class BudgetExhaustedError extends AppError {
  constructor(
    message = "La ricerca è temporaneamente non disponibile: è stato raggiunto il limite mensile del servizio dei percorsi.",
  ) {
    super("BUDGET_EXHAUSTED", 503, message);
    this.name = "BudgetExhaustedError";
  }
}

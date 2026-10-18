import { createHash, timingSafeEqual } from "node:crypto";
import type { ApiErrorBody } from "@tappafurba/shared";
import type { FastifyInstance } from "fastify";

export interface IngestionRouteOptions {
  runIngestion: () => Promise<object>;
  /**
   * Segreto per `POST /ingest` (header `Authorization: Bearer …`). Senza, l'endpoint è DISATTIVATO (404): l'ingestione si
   * lancia da riga di comando (`pnpm ingest`) o dal timer, che non passano da HTTP.
   */
  token?: string;
  /** Tentativi al minuto per IP (contano anche i rifiuti: frena chi prova a indovinare il segreto). */
  rateLimitPerMinute: number;
}

const digest = (value: string) => createHash("sha256").update(value).digest();

/** Confronto a tempo costante (si confrontano gli hash, che hanno sempre la stessa lunghezza). */
function sameSecret(provided: string, expected: string): boolean {
  return timingSafeEqual(digest(provided), digest(expected));
}

function bearer(header: string | undefined): string | null {
  const match = header?.match(/^Bearer (\S+)$/);
  return match ? match[1]! : null;
}

/**
 * Ingestione manuale via HTTP: serve un segreto, ha un limite di tentativi e non può partire due volte insieme (ogni
 * esecuzione scarica due file dal ministero e riscrive il database). In produzione va comunque bloccata dal reverse proxy.
 */
export function registerIngestionRoutes(app: FastifyInstance, options: IngestionRouteOptions): void {
  let running = false;

  app.post(
    "/ingest",
    { config: { rateLimit: { max: options.rateLimitPerMinute, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const error = (status: number, code: ApiErrorBody["error"]["code"], message: string) =>
        reply.code(status).send({ error: { code, message } } satisfies ApiErrorBody);

      if (!options.token) return error(404, "NOT_FOUND", "Risorsa non trovata.");

      const provided = bearer(request.headers.authorization);
      if (!provided || !sameSecret(provided, options.token)) {
        reply.header("WWW-Authenticate", "Bearer");
        return error(401, "VALIDATION_ERROR", "Autenticazione richiesta.");
      }

      if (running) return error(429, "RATE_LIMITED", "Un'ingestione è già in corso.");
      running = true;
      try {
        const summary = await options.runIngestion();
        return reply.code(200).send(summary);
      } catch (cause) {
        // Il dettaglio resta nei log (ripulito dai segreti); al client non arriva il messaggio dell'errore.
        request.log.error(cause);
        return error(502, "PROVIDER_ERROR", "Ingestione non riuscita: controlla i log del server.");
      } finally {
        running = false;
      }
    },
  );
}

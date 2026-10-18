import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import type { ApiErrorBody } from "@tappafurba/shared";
import Fastify, { type FastifyError, type FastifyInstance } from "fastify";
import { ZodError } from "zod";
import { AppError, ProviderError } from "./errors";
import { redactLogArguments, redactLogObject, serializeError } from "./redact";
import type { GeocodingProvider } from "./providers/geocoding/GeocodingProvider";
import { registerGeocodeRoutes } from "./routes/geocode";
import { registerHealthRoutes } from "./routes/health";
import { registerIngestionRoutes } from "./routes/ingestion";
import { registerSearchRoutes } from "./routes/search";
import type { SearchService } from "./search/SearchService";

export interface AppOptions {
  /** false nei test. */
  logger: boolean;
  /** Solo per i test: destinazione dei log al posto di stdout. */
  logStream?: NodeJS.WritableStream;
  /**
   * Dietro un reverse proxy: il NUMERO di proxy fidati (di solito 1). `true` si fida di tutto l'header X-Forwarded-For, che il
   * client può falsificare: il rate limit per IP si aggira. `false` = nessun proxy (si usa l'IP della connessione).
   */
  trustProxy: boolean | number;
  corsOrigin: string;
  searchService: SearchService;
  geocoding: GeocodingProvider;
  searchRateLimitPerMinute: number;
  geocodeRateLimitPerMinute: number;
  checkDatabase: () => Promise<boolean>;
  runIngestion: () => Promise<object>;
  /** Segreto di `POST /ingest`; senza, l'endpoint è disattivato. */
  ingestToken?: string;
  /** Tentativi al minuto per IP su `POST /ingest` (default 3). */
  ingestRateLimitPerMinute?: number;
}

/**
 * Factory dell'app, senza dipendenze da env/DB a livello di modulo: i test la
 * istanziano con provider fittizi e usano `app.inject()`.
 */
export async function buildApp(options: AppOptions): Promise<FastifyInstance> {
  const app = Fastify({
    // Niente rotte HEAD automatiche: ognuna avrebbe un contatore del rate limit separato da quello della rotta GET (limite raddoppiato).
    exposeHeadRoutes: false,
    // Un numero = quanti proxy fidati (semantica di proxy-addr: il più vicino è l'hop 0). 0 = nessuno.
    trustProxy: typeof options.trustProxy === "number" ? (_address: string, hop: number) => hop < (options.trustProxy as number) : options.trustProxy,
    logger: options.logger
      ? {
          level: "info",
          stream: options.logStream,
          // Nessun segreto nei log, nemmeno se un errore nativo imprevisto porta con sé l'URL di una richiesta.
          formatters: { log: redactLogObject },
          hooks: {
            logMethod(args: unknown[], method: (...logArgs: unknown[]) => void) {
              method.apply(this, redactLogArguments(args));
            },
          },
          serializers: {
            err: serializeError,
            // Mai loggare la query string: contiene gli indirizzi digitati dall'utente.
            req: (request) => ({ method: request.method, url: request.url.split("?")[0] }),
          },
        }
      : false,
  });

  await app.register(cors, { origin: options.corsOrigin });
  // global: false → il limite si applica solo alle rotte che lo dichiarano (search, geocode).
  await app.register(rateLimit, { global: false });

  app.setErrorHandler((error: FastifyError | Error, request, reply) => {
    const send = (status: number, code: ApiErrorBody["error"]["code"], message: string) =>
      reply.code(status).send({ error: { code, message } } satisfies ApiErrorBody);

    if (error instanceof ZodError) {
      const issue = error.issues[0];
      const where = issue?.path.length ? `${issue.path.join(".")}: ` : "";
      return send(400, "VALIDATION_ERROR", `${where}${issue?.message ?? "Richiesta non valida"}`);
    }
    if (error instanceof AppError) {
      // Il dettaglio tecnico di un servizio esterno resta nei log: all'utente va solo il messaggio in italiano semplice.
      if (error instanceof ProviderError) request.log.warn({ detail: error.detail }, error.message);
      return send(error.httpStatus, error.code, error.message);
    }

    const statusCode = (error as FastifyError).statusCode;
    if (statusCode === 429) {
      return send(429, "RATE_LIMITED", "Troppe richieste: attendi qualche istante e riprova.");
    }
    if (statusCode && statusCode >= 400 && statusCode < 500) {
      return send(statusCode, "VALIDATION_ERROR", "Richiesta non valida.");
    }

    request.log.error(error);
    return send(500, "INTERNAL_ERROR", "Errore interno del server.");
  });

  registerHealthRoutes(app, options.checkDatabase);
  registerIngestionRoutes(app, {
    runIngestion: options.runIngestion,
    token: options.ingestToken,
    rateLimitPerMinute: options.ingestRateLimitPerMinute ?? 3,
  });
  registerSearchRoutes(app, {
    service: options.searchService,
    searchRateLimitPerMinute: options.searchRateLimitPerMinute,
  });
  registerGeocodeRoutes(app, {
    provider: options.geocoding,
    rateLimitPerMinute: options.geocodeRateLimitPerMinute,
  });

  return app;
}

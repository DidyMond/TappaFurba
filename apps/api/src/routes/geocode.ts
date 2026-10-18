import type { GeocodeAutocompleteResponse, GeocodeReverseResponse } from "@tappafurba/shared";
import type { FastifyInstance } from "fastify";
import { AppError } from "../errors";
import type { GeocodingProvider } from "../providers/geocoding/GeocodingProvider";
import { autocompleteQuerySchema, reverseQuerySchema } from "../search/schemas";

export interface GeocodeRouteOptions {
  provider: GeocodingProvider;
  rateLimitPerMinute: number;
}

/**
 * Proxy verso il provider di geocoding. Il testo digitato passa in query string
 * e NON viene loggato (vedi il serializer di `req` in app.ts): nessun indirizzo
 * dell'utente finisce nei log del server.
 */
export function registerGeocodeRoutes(app: FastifyInstance, options: GeocodeRouteOptions): void {
  const rateLimit = { max: options.rateLimitPerMinute, timeWindow: "1 minute" };

  app.get("/geocode/autocomplete", { config: { rateLimit } }, async (request, reply) => {
    const { q, lon, lat } = autocompleteQuerySchema.parse(request.query);
    const proximity = lon !== undefined && lat !== undefined ? { lon, lat } : undefined;
    const suggestions = await options.provider.autocomplete(q, { proximity });
    const body: GeocodeAutocompleteResponse = { suggestions };
    reply.code(200).send(body);
  });

  app.get("/geocode/reverse", { config: { rateLimit } }, async (request, reply) => {
    const { lon, lat } = reverseQuerySchema.parse(request.query);
    const label = await options.provider.reverse({ lon, lat });
    if (!label) {
      throw new AppError("NOT_FOUND", 404, "Nessun indirizzo trovato per queste coordinate.");
    }
    const body: GeocodeReverseResponse = { label };
    reply.code(200).send(body);
  });
}

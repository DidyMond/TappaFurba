import type { FastifyInstance } from "fastify";
import { AppError } from "../errors";
import { nearbyRequestSchema, searchIdParamsSchema, searchRequestSchema, stationRouteParamsSchema } from "../search/schemas";
import type { SearchService } from "../search/SearchService";

export interface SearchRouteOptions {
  service: SearchService;
  /** POST /search: ogni ricerca può costare fino a 6 chiamate Directions, quindi il limite è stretto. */
  searchRateLimitPerMinute: number;
  /** GET /search/:id: il client lo interroga a intervalli brevi finché il ricalcolo non termina. */
  pollRateLimitPerMinute?: number;
  /** GET /search/:id/stations/:stationId[/route]: costano una chiamata Directions ciascuno (nessuna cache dei risultati). */
  stationRouteRateLimitPerMinute?: number;
}

export function registerSearchRoutes(app: FastifyInstance, options: SearchRouteOptions): void {
  app.post(
    "/search",
    { config: { rateLimit: { max: options.searchRateLimitPerMinute, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const body = searchRequestSchema.parse(request.body);
      const response = await options.service.search(body);
      reply.code(200).send(response);
    },
  );

  // «Intorno a me»: stessa sessione, stesso ricalcolo e stessi tetti di spesa di /search (ogni ricerca può costare fino a 15
  // chiamate Directions per verificare il giro delle prime stazioni), quindi lo stesso limite per minuto.
  app.post(
    "/nearby",
    { config: { rateLimit: { max: options.searchRateLimitPerMinute, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const body = nearbyRequestSchema.parse(request.body);
      const response = await options.service.searchNearby(body);
      reply.code(200).send(response);
    },
  );

  app.get(
    "/search/:id/stations/:stationId",
    { config: { rateLimit: { max: options.stationRouteRateLimitPerMinute ?? 30, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const { id, stationId } = stationRouteParamsSchema.parse(request.params);
      reply.code(200).send(await options.service.getStationDetail(id, stationId));
    },
  );

  app.get(
    "/search/:id/stations/:stationId/route",
    { config: { rateLimit: { max: options.stationRouteRateLimitPerMinute ?? 30, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const { id, stationId } = stationRouteParamsSchema.parse(request.params);
      reply.code(200).send(await options.service.getStationRoute(id, stationId));
    },
  );

  app.get(
    "/search/:id",
    { config: { rateLimit: { max: options.pollRateLimitPerMinute ?? 120, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const { id } = searchIdParamsSchema.parse(request.params);
      const refinement = options.service.getRefinement(id);
      if (!refinement) {
        throw new AppError("SEARCH_NOT_FOUND", 404, "Ricerca non trovata o scaduta.");
      }
      reply.code(200).send(refinement);
    },
  );
}

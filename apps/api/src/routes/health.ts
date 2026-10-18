import type { HealthStatus } from "@tappafurba/shared";
import type { FastifyInstance } from "fastify";

export function registerHealthRoutes(app: FastifyInstance, checkDatabase: () => Promise<boolean>): void {
  // GET e HEAD (i controlli di disponibilità spesso usano HEAD): nessun limite da raddoppiare, la rotta non ne ha.
  app.route({
    method: ["GET", "HEAD"],
    url: "/health",
    handler: async (_request, reply) => {
    const databaseOk = await checkDatabase();

    const body: HealthStatus = {
      status: databaseOk ? "ok" : "degraded",
      database: databaseOk ? "ok" : "error",
      timestamp: new Date().toISOString(),
    };

    reply.code(databaseOk ? 200 : 503).send(body);
    },
  });
}

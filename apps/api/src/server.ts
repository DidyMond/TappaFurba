import { buildApp } from "./app";
import { createRuntime } from "./container";
import { env } from "./env";

async function main() {
  const runtime = createRuntime();

  const app = await buildApp({
    logger: true,
    trustProxy: env.TRUST_PROXY,
    corsOrigin: env.CORS_ORIGIN,
    searchService: runtime.searchService,
    geocoding: runtime.geocoding,
    searchRateLimitPerMinute: env.SEARCH_RATE_LIMIT_PER_MIN,
    geocodeRateLimitPerMinute: env.GEOCODE_RATE_LIMIT_PER_MIN,
    checkDatabase: runtime.checkDatabase,
    runIngestion: runtime.runIngestion,
    ingestToken: env.INGEST_TOKEN,
  });

  app.log.info(runtime.providers, "Provider attivi (geocoding / routing)");
  await app.listen({ port: env.API_PORT, host: env.API_HOST });
}

main().catch((error) => {
  console.error("Avvio del server fallito:", error);
  process.exit(1);
});

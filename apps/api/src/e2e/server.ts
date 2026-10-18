import { buildApp } from "../app";
import { FixtureGeocodingProvider } from "../providers/geocoding/FixtureGeocodingProvider";
import { MockRoutingProvider } from "../providers/routing/MockRoutingProvider";
import { SearchService } from "../search/SearchService";
import { SearchSessionStore } from "../search/SearchSessionStore";
import { FixtureStationRepository } from "./FixtureStationRepository";

/**
 * API per i test end-to-end (Playwright): provider di prova (geocoding con luoghi noti, routing a zero rete, stazioni
 * fittizie in memoria). Nessun database, nessuna rete, nessuna variabile d'ambiente obbligatoria: non importa `env`,
 * `container` né `db`. NON è l'entry point di produzione (`server.ts`).
 */
async function main() {
  const port = Number(process.env.E2E_API_PORT ?? 3111);
  const app = await buildApp({
    logger: false,
    trustProxy: false,
    corsOrigin: process.env.E2E_CORS_ORIGIN ?? "http://localhost:5199",
    searchService: new SearchService({
      routing: new MockRoutingProvider(),
      repository: new FixtureStationRepository(),
      budget: { status: async () => "ok" },
      sessions: new SearchSessionStore(),
    }),
    geocoding: new FixtureGeocodingProvider(),
    // I test fanno molte ricerche ravvicinate dallo stesso indirizzo: nessun limite pratico.
    searchRateLimitPerMinute: 10_000,
    geocodeRateLimitPerMinute: 10_000,
    checkDatabase: async () => true,
    runIngestion: async () => ({ skipped: true }),
  });
  await app.listen({ port, host: "127.0.0.1" });
  console.log(`API di prova per i test end-to-end in ascolto su http://127.0.0.1:${port}`);
}

main().catch((error) => {
  console.error("Avvio dell'API di prova fallito:", error);
  process.exit(1);
});

import { checkDatabaseConnection, db } from "./db";
import { env } from "./env";
import { runIngestion } from "./ingestion/runIngestion";
import type { GeocodingProvider } from "./providers/geocoding/GeocodingProvider";
import { FixtureGeocodingProvider } from "./providers/geocoding/FixtureGeocodingProvider";
import { BudgetedGeocodingProvider } from "./providers/geocoding/BudgetedGeocodingProvider";
import { MapboxGeocodingProvider } from "./providers/geocoding/MapboxGeocodingProvider";
import { LivePriceRefresher } from "./live-prices/LivePriceRefresher";
import { PostgresLivePriceStore } from "./live-prices/PostgresLivePriceStore";
import { OspzLivePriceProvider } from "./providers/live-prices/OspzLivePriceProvider";
import { MimitFuelDataProvider } from "./providers/fuel-data/MimitFuelDataProvider";
import { BudgetedRoutingProvider } from "./providers/routing/BudgetedRoutingProvider";
import { InFlightRoutingProvider } from "./providers/routing/InFlightRoutingProvider";
import { type BudgetGate, DirectionsBudget } from "./providers/routing/DirectionsBudget";
import { MapboxRoutingProvider } from "./providers/routing/MapboxRoutingProvider";
import { MockRoutingProvider } from "./providers/routing/MockRoutingProvider";
import type { RoutingProvider } from "./providers/routing/RoutingProvider";
import { PostgisStationRepository } from "./search/PostgisStationRepository";
import { SearchService } from "./search/SearchService";
import { SearchSessionStore } from "./search/SearchSessionStore";
import { DbUsageCounter } from "./usage/UsageCounter";

function requireMapboxToken(purpose: string): string {
  if (!env.MAPBOX_SERVER_TOKEN) {
    throw new Error(`MAPBOX_SERVER_TOKEN è obbligatorio per ${purpose} (oppure imposta il provider su fixture/mock).`);
  }
  return env.MAPBOX_SERVER_TOKEN;
}

/** Provider effettivi scelti da env: Mapbox se c'è il token, altrimenti fixture/mock (sviluppo senza chiavi). */
export function createRuntime() {
  const geocodingKind = env.GEOCODING_PROVIDER ?? (env.MAPBOX_SERVER_TOKEN ? "mapbox" : "fixture");
  const routingKind = env.ROUTING_PROVIDER ?? (env.MAPBOX_SERVER_TOKEN ? "mapbox" : "mock");

  const geocoding: GeocodingProvider =
    geocodingKind === "mapbox"
      ? // Come Directions: ogni chiamata reale a Mapbox si conta e oltre il tetto mensile non se ne fanno più (il rate limit per IP
        // da solo non basta: conta le richieste dei client, non il totale, e con più IP il consumo cresce senza limite).
        new BudgetedGeocodingProvider(
          new MapboxGeocodingProvider({ token: requireMapboxToken("il geocoding Mapbox") }),
          new DbUsageCounter(db),
          env.GEOCODING_HARD_LIMIT,
        )
      : new FixtureGeocodingProvider();

  let routing: RoutingProvider;
  let budget: BudgetGate;
  if (routingKind === "mapbox") {
    const directionsBudget = new DirectionsBudget({
      counter: new DbUsageCounter(db),
      softLimit: env.DIRECTIONS_SOFT_LIMIT,
      hardLimit: env.DIRECTIONS_HARD_LIMIT,
    });
    // Ordine: la deduplica sta sopra il conteggio, così le richieste sovrapposte (una sola chiamata Mapbox) si contano come una sola.
    // Nessuna cache dei risultati: Product Terms Mapbox §2.10.1.
    routing = new InFlightRoutingProvider(
      new BudgetedRoutingProvider(
        new MapboxRoutingProvider({ token: requireMapboxToken("il routing Mapbox") }),
        directionsBudget,
      ),
    );
    budget = directionsBudget;
  } else {
    routing = new MockRoutingProvider();
    budget = { status: async () => "ok" };
  }

  const livePrices =
    env.LIVE_PRICES_PROVIDER === "ospz"
      ? new LivePriceRefresher({
          provider: new OspzLivePriceProvider({ baseUrl: env.LIVE_PRICES_BASE_URL, userAgent: env.LIVE_PRICES_USER_AGENT }),
          store: new PostgresLivePriceStore(db),
          ttlMs: env.LIVE_PRICES_TTL_MIN * 60_000,
          maxTilesPerSearch: env.LIVE_PRICES_MAX_TILES_PER_SEARCH,
          deadlineMs: env.LIVE_PRICES_DEADLINE_MS,
          concurrency: env.LIVE_PRICES_CONCURRENCY,
          logger: console,
        })
      : undefined;

  const searchService = new SearchService({
    routing,
    livePrices,
    repository: new PostgisStationRepository(db),
    budget,
    sessions: new SearchSessionStore(),
  });

  return {
    geocoding,
    searchService,
    providers: { geocoding: geocodingKind, routing: routingKind, livePrices: env.LIVE_PRICES_PROVIDER },
    checkDatabase: checkDatabaseConnection,
    runIngestion: () => runIngestion(new MimitFuelDataProvider()),
  };
}

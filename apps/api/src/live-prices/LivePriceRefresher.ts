import { TILE_QUERY_RADIUS_KM, tilesCoveringRoute, type Coordinate, type Tile } from "@tappafurba/core";
import type { LivePricesInfo } from "@tappafurba/shared";
import { RateLimitedProviderError } from "../errors";
import type { LivePriceProvider } from "../providers/live-prices/LivePriceProvider";
import type { LivePriceStore } from "./LivePriceStore";

export interface LivePriceRefresherOptions {
  provider: LivePriceProvider;
  store: LivePriceStore;
  /** Un riquadro aggiornato da meno di così non viene richiesto di nuovo. */
  ttlMs: number;
  /** Tetto di chiamate alla fonte per singola ricerca (percorsi lunghi: il resto usa il file giornaliero). */
  maxTilesPerSearch: number;
  /** Quanto una ricerca attende gli aggiornamenti prima di rispondere con quello che ha. */
  deadlineMs: number;
  /** Chiamate simultanee alla fonte, sommate su tutte le ricerche. */
  concurrency: number;
  /** Errori consecutivi oltre i quali la fonte viene lasciata in pace per `breakerCooldownMs`. */
  breakerThreshold?: number;
  breakerCooldownMs?: number;
  /** Sospensione dopo un HTTP 429 se il servizio non indica Retry-After. */
  rateLimitCooldownMs?: number;
  /** Chiamate in coda oltre questa soglia vengono saltate (protezione da picchi di traffico). */
  maxQueueLength?: number;
  now?: () => number;
  logger?: { warn(details: object, message: string): void };
}

type TileOutcome = { tile: Tile; ok: boolean };

/**
 * Porta i prezzi del corridoio dal file giornaliero (indietro di 1-2 giorni) ai
 * prezzi in tempo reale, riquadro per riquadro, PRIMA che la ricerca legga il DB.
 *
 * Non fallisce mai la ricerca: se la fonte non risponde, la ricerca prosegue con i
 * prezzi già presenti e lo dichiara nella risposta (`status`).
 */
export class LivePriceRefresher {
  private readonly now: () => number;
  private readonly breakerThreshold: number;
  private readonly breakerCooldownMs: number;
  private readonly rateLimitCooldownMs: number;
  private readonly maxQueueLength: number;
  private readonly inflight = new Map<string, Promise<boolean>>();
  private readonly waiting: Array<() => void> = [];
  private running = 0;
  private consecutiveFailures = 0;
  private breakerOpenUntil = 0;

  constructor(private readonly options: LivePriceRefresherOptions) {
    this.now = options.now ?? Date.now;
    this.breakerThreshold = options.breakerThreshold ?? 5;
    this.breakerCooldownMs = options.breakerCooldownMs ?? 120_000;
    this.rateLimitCooldownMs = options.rateLimitCooldownMs ?? 60_000;
    this.maxQueueLength = options.maxQueueLength ?? 200;
  }

  async ensureFresh(route: readonly Coordinate[], bufferKm: number): Promise<LivePricesInfo> {
    const tiles = tilesCoveringRoute(route, { bufferKm });
    const total = tiles.length;
    if (total === 0) return { status: "live", tilesTotal: 0, tilesLive: 0, oldestLiveAgeMinutes: null };

    const started = this.now();
    let fresh: Map<string, Date>;
    try {
      fresh = await this.options.store.getFreshTiles(
        tiles.map((tile) => tile.id),
        this.options.ttlMs,
      );
    } catch (error) {
      this.options.logger?.warn({ error: errorName(error) }, "Cache dei prezzi live non leggibile");
      return { status: "unavailable", tilesTotal: total, tilesLive: 0, oldestLiveAgeMinutes: null };
    }

    const refreshedAt = new Map(fresh);
    const stale = tiles.filter((tile) => !fresh.has(tile.id)).slice(0, this.options.maxTilesPerSearch);

    if (stale.length > 0 && !this.isBreakerOpen()) {
      const finished: TileOutcome[] = [];
      const tasks = stale.map((tile) =>
        this.refreshTile(tile).then((ok) => {
          finished.push({ tile, ok });
        }),
      );
      const remaining = Math.max(0, this.options.deadlineMs - (this.now() - started));
      let timer: NodeJS.Timeout | undefined;
      const deadline = new Promise<void>((resolve) => {
        timer = setTimeout(resolve, remaining);
      });
      try {
        await Promise.race([Promise.allSettled(tasks), deadline]);
      } finally {
        clearTimeout(timer);
      }
      // Le chiamate ancora in corso dopo la scadenza proseguono in background e scaldano la cache per la ricerca successiva.
      for (const { tile, ok } of finished) {
        if (ok) refreshedAt.set(tile.id, new Date(this.now()));
      }
    }

    const tilesLive = tiles.filter((tile) => refreshedAt.has(tile.id)).length;
    const ages = tiles
      .map((tile) => refreshedAt.get(tile.id))
      .filter((at): at is Date => at !== undefined)
      .map((at) => Math.max(0, (this.now() - at.getTime()) / 60_000));

    return {
      status: tilesLive === total ? "live" : tilesLive > 0 ? "partial" : "unavailable",
      tilesTotal: total,
      tilesLive,
      oldestLiveAgeMinutes: ages.length > 0 ? Math.round(Math.max(...ages)) : null,
    };
  }

  private isBreakerOpen(): boolean {
    return this.now() < this.breakerOpenUntil;
  }

  /** Una sola richiesta per riquadro anche con ricerche simultanee sulla stessa zona. */
  private refreshTile(tile: Tile): Promise<boolean> {
    const existing = this.inflight.get(tile.id);
    if (existing) return existing;
    const promise = this.withSlot(() => this.fetchAndStore(tile)).finally(() => this.inflight.delete(tile.id));
    this.inflight.set(tile.id, promise);
    return promise;
  }

  private async fetchAndStore(tile: Tile): Promise<boolean> {
    try {
      const stations = await this.options.provider.fetchZone(
        { lon: tile.center[0], lat: tile.center[1] },
        TILE_QUERY_RADIUS_KM,
      );
      await this.options.store.applyTile(tile.id, stations);
      this.consecutiveFailures = 0;
      return true;
    } catch (error) {
      if (error instanceof RateLimitedProviderError) {
        // Il servizio ci chiede di rallentare: stop immediato, senza aspettare altri errori.
        const cooldownMs = error.retryAfterMs ?? this.rateLimitCooldownMs;
        this.breakerOpenUntil = Math.max(this.breakerOpenUntil, this.now() + cooldownMs);
        this.consecutiveFailures = 0;
        this.options.logger?.warn({ cooldownMs }, "Fonte prezzi live: limite di richieste raggiunto, pausa");
        return false;
      }
      this.consecutiveFailures += 1;
      if (this.consecutiveFailures >= this.breakerThreshold) {
        this.breakerOpenUntil = this.now() + this.breakerCooldownMs;
        this.consecutiveFailures = 0;
        this.options.logger?.warn({ cooldownMs: this.breakerCooldownMs }, "Fonte prezzi live sospesa dopo errori ripetuti");
      } else {
        this.options.logger?.warn({ tile: tile.id, error: errorName(error) }, "Aggiornamento prezzi live non riuscito");
      }
      return false;
    }
  }

  /** Semaforo condiviso: al più `concurrency` chiamate alla fonte, con coda limitata. Lo slot passa direttamente al prossimo in coda. */
  private async withSlot(task: () => Promise<boolean>): Promise<boolean> {
    if (this.running >= this.options.concurrency) {
      if (this.waiting.length >= this.maxQueueLength) return false;
      await new Promise<void>((resolve) => this.waiting.push(resolve));
    } else {
      this.running += 1;
    }
    try {
      if (this.isBreakerOpen()) return false;
      return await task();
    } finally {
      const next = this.waiting.shift();
      if (next) next();
      else this.running -= 1;
    }
  }
}

function errorName(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

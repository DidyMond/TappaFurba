import type { ReferencePriceInfo, RefinementInfo, SearchRequest, StationResult } from "@tappafurba/shared";

export interface SearchSession {
  id: string;
  request: SearchRequest;
  route: { distanceKm: number; durationMinutes: number };
  referencePrice: ReferencePriceInfo;
  costPerKm: number;
  /** Non arrotondati e ordinati per netSavings decrescente. */
  results: StationResult[];
  refinement: RefinementInfo;
  createdAt: number;
  /** Solo per i test: attende la fine del ricalcolo in background. */
  refinementPromise?: Promise<void>;
}

export interface SearchSessionStoreOptions {
  ttlMs?: number;
  maxEntries?: number;
  now?: () => number;
}

/**
 * Stato di ricerca in memoria (TTL 15 minuti): serve al client per leggere i
 * risultati raffinati con GET /search/:id. Scelta consapevole per l'MVP: un
 * solo processo API, nessuna persistenza; se si scala a più istanze andrà
 * sostituito con uno store condiviso (es. Redis).
 */
export class SearchSessionStore {
  private readonly sessions = new Map<string, SearchSession>();
  private readonly ttlMs: number;
  private readonly maxEntries: number;
  private readonly now: () => number;

  constructor(options: SearchSessionStoreOptions = {}) {
    this.ttlMs = options.ttlMs ?? 15 * 60 * 1000;
    this.maxEntries = options.maxEntries ?? 500;
    this.now = options.now ?? Date.now;
  }

  set(session: SearchSession): void {
    this.sessions.set(session.id, session);
    this.evict();
  }

  get(id: string): SearchSession | undefined {
    const session = this.sessions.get(id);
    if (!session) return undefined;
    if (this.now() - session.createdAt > this.ttlMs) {
      this.sessions.delete(id);
      return undefined;
    }
    return session;
  }

  get size(): number {
    return this.sessions.size;
  }

  private evict(): void {
    const cutoff = this.now() - this.ttlMs;
    for (const [id, session] of this.sessions) {
      if (session.createdAt < cutoff) this.sessions.delete(id);
    }
    while (this.sessions.size > this.maxEntries) {
      const oldest = this.sessions.keys().next().value;
      if (oldest === undefined) return;
      this.sessions.delete(oldest);
    }
  }
}

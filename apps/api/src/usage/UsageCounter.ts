import { sql, type Kysely } from "kysely";
import type { Database } from "../db/types";

/** Contatore mensile di chiamate a un servizio esterno a pagamento. */
export interface UsageCounter {
  /** Incrementa e restituisce il nuovo totale del periodo. */
  increment(service: string, period: string, by?: number): Promise<number>;
  get(service: string, period: string): Promise<number>;
}

export class InMemoryUsageCounter implements UsageCounter {
  private readonly counts = new Map<string, number>();

  async increment(service: string, period: string, by = 1): Promise<number> {
    const key = `${service}|${period}`;
    const next = (this.counts.get(key) ?? 0) + by;
    this.counts.set(key, next);
    return next;
  }

  async get(service: string, period: string): Promise<number> {
    return this.counts.get(`${service}|${period}`) ?? 0;
  }
}

/** Persistente su PostgreSQL: il conteggio sopravvive ai riavvii del server. */
export class DbUsageCounter implements UsageCounter {
  constructor(private readonly db: Kysely<Database>) {}

  async increment(service: string, period: string, by = 1): Promise<number> {
    const row = await this.db
      .insertInto("api_usage")
      .values({ service, period, count: String(by) })
      .onConflict((oc) =>
        oc.columns(["service", "period"]).doUpdateSet({
          count: sql`api_usage.count + ${by}`,
          updated_at: sql`now()`,
        }),
      )
      .returning("count")
      .executeTakeFirstOrThrow();
    return Number(row.count);
  }

  async get(service: string, period: string): Promise<number> {
    const row = await this.db
      .selectFrom("api_usage")
      .select("count")
      .where("service", "=", service)
      .where("period", "=", period)
      .executeTakeFirst();
    return row ? Number(row.count) : 0;
  }
}

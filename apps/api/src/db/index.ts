import { Kysely, PostgresDialect, sql } from "kysely";
import pg from "pg";
import { env } from "../env";
import type { Database } from "./types";

const pool = new pg.Pool({ connectionString: env.DATABASE_URL });

export const db = new Kysely<Database>({
  dialect: new PostgresDialect({ pool }),
});

/**
 * Query neutra rispetto allo schema (non presuppone che le tabelle esistano
 * già), così l'healthcheck resta significativo anche prima della prima
 * migrazione.
 */
export async function checkDatabaseConnection(): Promise<boolean> {
  try {
    await sql`select 1`.execute(db);
    return true;
  } catch {
    return false;
  }
}

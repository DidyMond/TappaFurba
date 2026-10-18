import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { env } from "../env";

/** Lo schema del database sta tutto in `db/schema.sql` (alla radice del repository): idempotente, si può rilanciare. */
const SCHEMA_FILE = fileURLToPath(new URL("../../../../db/schema.sql", import.meta.url));

async function applySchema(): Promise<void> {
  const schema = await readFile(SCHEMA_FILE, "utf8");
  const client = new pg.Client({ connectionString: env.DATABASE_URL });
  await client.connect();
  try {
    // Una sola query con più istruzioni (protocollo semplice di PostgreSQL): o passa tutto o non cambia niente.
    await client.query(schema);
    console.log("Schema del database applicato (db/schema.sql).");
  } finally {
    await client.end();
  }
}

applySchema().catch((error) => {
  console.error("Applicazione dello schema fallita:", error);
  process.exit(1);
});

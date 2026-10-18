import "dotenv/config";
import { defineConfig } from "vitest/config";

// Test di integrazione: richiedono il database locale (docker compose up -d), migrato e con dati
// ingeriti (pnpm db:migrate && pnpm ingest). DATABASE_URL viene letto da apps/api/.env.
export default defineConfig({
  test: {
    include: ["test/db/**/*.test.ts"],
    env: { RUN_DB_TESTS: "1" },
    server: { deps: { inline: [/@tappafurba\//] } },
  },
});

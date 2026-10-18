import { defineConfig, devices } from "@playwright/test";

/**
 * E2E con DATI REALI: SOLO manuale/locale, mai in CI. Non avvia nulla: si punta a un'app e a un'API già in esecuzione
 * (database e chiavi veri). I luoghi si passano da ambiente (`E2E_REAL_FROM`, `E2E_REAL_TO`): nessun indirizzo nel repo.
 *
 *   E2E_REAL_BASE_URL=http://localhost:5173 E2E_REAL_FROM="..." E2E_REAL_TO="..." pnpm test:e2e:real
 */
export default defineConfig({
  testDir: "./tests-real",
  timeout: 120_000,
  expect: { timeout: 30_000 },
  workers: 1,
  reporter: [["list"]],
  use: {
    ...devices["Desktop Chrome"],
    channel: process.env.E2E_CHROME_CHANNEL || undefined,
    baseURL: process.env.E2E_REAL_BASE_URL ?? "http://localhost:5173",
    viewport: { width: 1280, height: 800 },
    trace: "retain-on-failure",
  },
});

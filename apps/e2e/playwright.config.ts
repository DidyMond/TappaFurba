import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, devices } from "@playwright/test";

/**
 * Test end-to-end di TappaFurba (Playwright, solo Chromium) sul percorso critico, con provider di prova: geocoding con luoghi
 * noti, routing a zero rete e stazioni fittizie in memoria (`apps/api/src/e2e`). Nessun database, nessuna chiave, nessuna rete
 * esterna (le richieste fuori da localhost sono bloccate dal fixture). In CI gira con `pnpm test:e2e`.
 *
 * In locale, per non scaricare Chromium: `E2E_CHROME_CHANNEL=chrome pnpm test:e2e` usa il Chrome installato.
 * I test usano SOLO `data-testid` (mai i testi): il nome del marchio può cambiare prima del lancio.
 */
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const API_PORT = 3111;
const WEB_PORT = 5199;
const WEB = `http://127.0.0.1:${WEB_PORT}`;
const API = `http://127.0.0.1:${API_PORT}`;

export default defineConfig({
  testDir: "./tests",
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  workers: process.env.CI ? 2 : undefined,
  retries: process.env.CI ? 1 : 0,
  // Tetto all'intera esecuzione: se qualcosa si blocca (server che non si chiude, test appeso) in CI non si consumano i minuti del job.
  globalTimeout: process.env.CI ? 8 * 60_000 : undefined,
  // In CI «line» stampa l'errore di un test appena avviene (con «list» comparirebbe solo a fine esecuzione).
  reporter: process.env.CI ? [["line"], ["html", { open: "never" }]] : [["list"]],
  outputDir: "./test-results",
  use: {
    ...devices["Desktop Chrome"],
    channel: process.env.E2E_CHROME_CHANNEL || undefined,
    baseURL: WEB,
    locale: "it-IT",
    viewport: { width: 1280, height: 800 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    // Il service worker della PWA (build di produzione) non deve intercettare le richieste: i test ne controllano la rete.
    serviceWorkers: "block",
  },
  webServer: [
    {
      command: "pnpm --filter @tappafurba/api exec tsx src/e2e/server.ts",
      cwd: root,
      url: `${API}/health`,
      env: { E2E_API_PORT: String(API_PORT), E2E_CORS_ORIGIN: WEB },
      reuseExistingServer: false,
      // A fine esecuzione si chiude con SIGTERM e, se non basta, con SIGKILL: un server rimasto vivo non deve bloccare l'uscita.
      gracefulShutdown: { signal: "SIGTERM", timeout: 5_000 },
      timeout: 120_000,
    },
    {
      // Build di produzione in una cartella a parte (`dist-e2e`, non tocca `dist`) e `vite preview`: niente ottimizzazione delle
      // dipendenze né ricaricamenti a metà test come con il server di sviluppo.
      command:
        "pnpm --filter @tappafurba/web exec vite build --outDir dist-e2e --emptyOutDir && " +
        `pnpm --filter @tappafurba/web exec vite preview --outDir dist-e2e --host 127.0.0.1 --port ${WEB_PORT} --strictPort`,
      cwd: root,
      url: WEB,
      // Token Mapbox vuoto: nessuna mappa, quindi nessuna chiamata a Mapbox (l'elenco e il resto funzionano uguale).
      env: { VITE_API_BASE_URL: API, VITE_MAPBOX_PUBLIC_TOKEN: "" },
      reuseExistingServer: false,
      gracefulShutdown: { signal: "SIGTERM", timeout: 5_000 },
      timeout: 120_000,
    },
  ],
});

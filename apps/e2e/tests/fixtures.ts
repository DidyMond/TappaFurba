import { expect, test as base, type Page } from "@playwright/test";

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost"]);
/** Unici host esterni tollerati: i font di Google (link nell'index.html); il blocco li fa ripiegare sul carattere di sistema. */
const TOLERATED_EXTERNAL = new Set(["fonts.googleapis.com", "fonts.gstatic.com"]);

/**
 * `page` con la garanzia «zero chiamate esterne»: ogni richiesta fuori da localhost viene bloccata e registrata; a fine
 * test, se è partita una richiesta verso un host non tollerato (Mapbox, MIMIT…), il test fallisce.
 */
export const test = base.extend<{ page: Page }>({
  page: async ({ page }, use) => {
    const external: string[] = [];
    await page.route(
      (url) => !LOCAL_HOSTS.has(url.hostname) && url.protocol.startsWith("http"),
      (route) => {
        external.push(new URL(route.request().url()).hostname);
        return route.abort();
      },
    );
    await use(page);
    const unexpected = [...new Set(external)].filter((host) => !TOLERATED_EXTERNAL.has(host));
    expect(unexpected, "richieste verso host esterni").toEqual([]);
  },
});

export { expect };

/** Home → ricerca con i luoghi di prova → Risultati con almeno una scheda. Lavora solo con `data-testid`. */
export async function searchFromHome(page: Page, from = "milano centrale", to = "bologna centrale") {
  await page.goto("/");
  await page.getByTestId("search-bar").click();
  for (const [testId, text] of [
    ["origin-input", from],
    ["destination-input", to],
  ] as const) {
    await page.getByTestId(testId).fill(text);
    await page.getByTestId("address-suggestion").first().click();
  }
  await page.getByTestId("search-submit").click();
  await expect(page).toHaveURL(/\/results$/);
  await expect(page.getByTestId("station-card").first()).toBeVisible();
}

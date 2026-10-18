import { expect, test } from "@playwright/test";

const FROM = process.env.E2E_REAL_FROM;
const TO = process.env.E2E_REAL_TO;

// Dati reali (geocoding e routing veri, database con le stazioni): non gira se non si indicano i luoghi.
test.skip(!FROM || !TO, "Imposta E2E_REAL_FROM e E2E_REAL_TO (indirizzi o luoghi veri, mai nel repo)");

test("ricerca reale: Home → Risultati con stazioni vere → dettaglio → «Apri nel Navigatore»", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("search-bar").click();
  for (const [testId, text] of [
    ["origin-input", FROM!],
    ["destination-input", TO!],
  ] as const) {
    await page.getByTestId(testId).fill(text);
    await page.getByTestId("address-suggestion").first().click();
  }
  await page.getByTestId("search-submit").click();
  await expect(page).toHaveURL(/\/results$/);
  await expect(page.getByTestId("station-card").first()).toBeVisible();
  await expect(page.getByTestId("reference-price")).toBeVisible();
  await page.getByTestId("station-info").first().click();
  await expect(page.getByTestId("tile-savings")).toBeVisible();
  await page.getByTestId("navigate-cta").click();
  await expect(page.getByTestId("navigate-menu")).toBeVisible();
});

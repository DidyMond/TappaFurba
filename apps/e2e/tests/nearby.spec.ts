import { expect, searchFromHome, test } from "./fixtures";

// «Intorno a me»: un solo punto di partenza e un raggio, senza destinazione. Le stazioni di prova stanno attorno a Torino Porta Nuova
// (a circa 1,2 / 2,5 / 3,8 / 6 km), lontano dal corridoio Milano–Bologna delle altre ricerche.
test.describe("«Intorno a me»: dalla Home ai Risultati e al dettaglio", () => {
  test("un solo campo, il raggio di ricerca e un elenco ordinato per risparmio, senza percorso", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("search-bar").click();
    await page.getByTestId("mode-nearby").click();

    // Niente destinazione né scambio: il punto di partenza e il raggio.
    await expect(page.getByTestId("destination-input")).toHaveCount(0);
    await expect(page.getByTestId("nearby-card")).toBeVisible();

    await page.getByTestId("origin-input").fill("torino porta nuova");
    await page.getByTestId("address-suggestion").first().click();
    await page.getByTestId("search-submit").click();

    await expect(page).toHaveURL(/\/results$/);
    await expect(page.getByTestId("station-card").first()).toBeVisible();
    // Tutte e quattro le stazioni sono nel raggio di 10 km, ma con il raggio predefinito (5 km) l'ultima, a ~6 km, resta fuori.
    await expect(page.getByTestId("station-card")).toHaveCount(3);
    await expect(page.getByTestId("nearby-capsule")).toContainText("entro 5 km");
    await expect(page.getByTestId("reference-price")).toBeVisible();
  });

  test("allargando il raggio compare anche la stazione più lontana", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("search-bar").click();
    await page.getByTestId("mode-nearby").click();
    await page.getByTestId("origin-input").fill("torino porta nuova");
    await page.getByTestId("address-suggestion").first().click();
    await page.locator("#search-radius").fill("8");
    await page.getByTestId("search-submit").click();

    await expect(page).toHaveURL(/\/results$/);
    await expect(page.getByTestId("station-card")).toHaveCount(4);
    await expect(page.getByTestId("nearby-capsule")).toContainText("entro 8 km");
  });

  test("Info apre il dettaglio con il giro andata e ritorno, e «Naviga» propone le tre app", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("search-bar").click();
    await page.getByTestId("mode-nearby").click();
    await page.getByTestId("origin-input").fill("torino porta nuova");
    await page.getByTestId("address-suggestion").first().click();
    await page.getByTestId("search-submit").click();
    await expect(page.getByTestId("station-card").first()).toBeVisible();

    await page.getByTestId("station-info").first().click();
    const dialog = page.getByTestId("station-dialog-scroll");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByTestId("tile-detour")).toContainText("Andata e ritorno");
    await expect(dialog.getByTestId("tile-savings")).toBeVisible();
    await expect(dialog).toContainText("in linea d'aria da te");

    await page.getByTestId("navigate-cta").click();
    await expect(page.getByTestId("navigate-link-google")).toHaveAttribute("href", /^https:\/\/www\.google\.com\/maps\/dir\//);
  });

  test("«In viaggio» resta com'è: A→B con destinazione, e non vede le stazioni di Torino", async ({ page }) => {
    await searchFromHome(page);
    await expect(page.getByTestId("nearby-capsule")).toHaveCount(0);
    await expect(page.getByTestId("station-card").filter({ hasText: /prova T\d/ })).toHaveCount(0);
    expect(await page.getByTestId("station-card").count()).toBeGreaterThanOrEqual(5);
  });
});

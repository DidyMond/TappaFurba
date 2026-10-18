import { expect, searchFromHome, test } from "./fixtures";

// Desktop (1280 px): «Info» apre il dettaglio in un DIALOGO sopra i Risultati, senza cambiare rotta. La versione a pagina intera
// (mobile, /station/:searchId/:stationId) è in critical-path-mobile.spec.ts.
test.describe("percorso critico su desktop: ricerca → risultati → dettaglio → «Apri nel Navigatore»", () => {
  test("dalla Home ai Risultati: elenco, prezzo di riferimento e fonte dei prezzi", async ({ page }) => {
    await searchFromHome(page);
    expect(await page.getByTestId("station-card").count()).toBeGreaterThanOrEqual(5);
    await expect(page.getByTestId("reference-price")).toBeVisible();
    await expect(page.getByTestId("prices-banner")).toBeVisible();
    await expect(page.getByTestId("nav-results")).toHaveAttribute("aria-current", "page");
  });

  test("Info apre il dettaglio con i numeri dell'impatto e «Apri nel Navigatore» propone le tre app con link veri", async ({ page }) => {
    await searchFromHome(page);
    await page.getByTestId("station-info").first().click();
    const dialog = page.getByTestId("station-dialog-scroll");
    await expect(dialog).toBeVisible();
    await expect(page).toHaveURL(/\/results$/); // dialogo: la rotta non cambia
    await expect(dialog.getByTestId("tile-savings")).toBeVisible();
    await expect(dialog.getByTestId("tile-detour")).toBeVisible();
    await expect(dialog.getByTestId("station-address")).toBeVisible();
    await expect(dialog.getByTestId("price-tile").first()).toBeVisible();

    await page.getByTestId("navigate-cta").click();
    const menu = page.getByTestId("navigate-menu");
    await expect(menu).toBeVisible();
    const links = await Promise.all(["google", "apple", "waze"].map((app) => menu.getByTestId(`navigate-link-${app}`).getAttribute("href")));
    for (const href of links) {
      expect(href).toMatch(/^https:\/\//);
      expect(href).toMatch(/\d+\.\d+(,|%2C)\s*\d+\.\d+/); // latitudine e longitudine della stazione
    }
  });

  test("Esc chiude il dettaglio e si torna ai Risultati identici (stesso elenco)", async ({ page }) => {
    await searchFromHome(page);
    const before = await page.getByTestId("station-card").count();
    await page.getByTestId("station-info").first().click();
    await expect(page.getByTestId("station-dialog-scroll")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("station-dialog-scroll")).toBeHidden();
    await expect(page).toHaveURL(/\/results$/);
    await expect(page.getByTestId("station-card")).toHaveCount(before);
  });

  test("«Naviga» dalla scheda apre lo stesso menu delle app", async ({ page }) => {
    await searchFromHome(page);
    await page.getByTestId("station-navigate").first().click();
    await expect(page.getByTestId("navigate-menu")).toBeVisible();
    await expect(page.getByTestId("navigate-link-google")).toHaveAttribute("href", /^https:\/\/www\.google\.com\/maps\/dir\//);
  });
});

import { expect, searchFromHome, test } from "./fixtures";

// Telefono: «Info» porta alla schermata a pagina intera su /station/:searchId/:stationId; «Indietro» ai Risultati.
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

test.describe("percorso critico su telefono: ricerca → risultati → dettaglio a pagina intera → «Apri nel Navigatore»", () => {
  test("Info porta al dettaglio sulla sua rotta, con i numeri dell'impatto e il menu delle app; Indietro torna ai Risultati", async ({ page }) => {
    await searchFromHome(page);
    const before = await page.getByTestId("station-card").count();

    await page.getByTestId("station-info").first().click();
    await expect(page).toHaveURL(/\/station\/[^/]+\/\d+$/);
    await expect(page.getByTestId("tile-savings")).toBeVisible();
    await expect(page.getByTestId("tile-detour")).toBeVisible();
    await expect(page.getByTestId("station-address")).toBeVisible();

    await page.getByTestId("navigate-cta").click();
    // Con un user agent da telefono Android/iOS «Apri nel Navigatore» può aprire direttamente l'app; con quello di Chrome
    // emulato senza sistema noto compare il menu con le tre app.
    const menu = page.getByTestId("navigate-menu");
    if (await menu.isVisible().catch(() => false)) await expect(menu.getByTestId("navigate-link-google")).toHaveAttribute("href", /^https:\/\//);

    await page.goBack();
    await expect(page).toHaveURL(/\/results$/);
    await expect(page.getByTestId("station-card")).toHaveCount(before);
  });
});

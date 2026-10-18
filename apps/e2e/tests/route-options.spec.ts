import { expect, searchFromHome, test } from "./fixtures";

test.describe("Opzioni percorso", () => {
  test("«Evita pedaggi» + Applica rilancia la ricerca con l'esclusione; Reimposta torna ai default", async ({ page }) => {
    await searchFromHome(page);
    await page.getByTestId("route-options-chip").click();
    const sheet = page.getByTestId("route-options-sheet");
    await expect(sheet).toBeVisible();
    await expect(page.getByTestId("route-options-apply")).toBeDisabled(); // nessuna modifica: niente da applicare

    const toll = page.getByTestId("route-option-avoid-tolls");
    await expect(toll).toHaveAttribute("aria-checked", "false");
    await toll.click();
    await expect(toll).toHaveAttribute("aria-checked", "true");

    const request = page.waitForRequest((r) => r.method() === "POST" && r.url().endsWith("/search"));
    await page.getByTestId("route-options-apply").click();
    const body = (await request).postDataJSON() as { avoidTolls: boolean; avoidMotorway: boolean; avoidFerries: boolean };
    expect(body).toMatchObject({ avoidTolls: true, avoidMotorway: false, avoidFerries: false });

    await expect(sheet).toBeHidden();
    await expect(page.getByTestId("station-card").first()).toBeVisible();

    // Riaperto: la scelta c'è e «Reimposta» riporta ai default (nessuna esclusione).
    await page.getByTestId("route-options-chip").click();
    await expect(page.getByTestId("route-option-avoid-tolls")).toHaveAttribute("aria-checked", "true");
    await page.getByTestId("route-options-reset").click();
    await expect(page.getByTestId("route-option-avoid-tolls")).toHaveAttribute("aria-checked", "false");
  });

  test("«Evita autostrade» viaggia nella richiesta e i risultati tornano", async ({ page }) => {
    await searchFromHome(page);
    await page.getByTestId("route-options-chip").click();
    await page.getByTestId("route-option-avoid-motorway").click();
    const request = page.waitForRequest((r) => r.method() === "POST" && r.url().endsWith("/search"));
    await page.getByTestId("route-options-apply").click();
    expect(((await request).postDataJSON() as { avoidMotorway: boolean }).avoidMotorway).toBe(true);
    await expect(page.getByTestId("station-card").first()).toBeVisible();
  });
});

import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

const SETTINGS_KEY = "tappafurba.settings.v1";
const MAP_STYLE_KEY = "tappafurba.mapStyle";
const stored = (page: Page, key: string) => page.evaluate((k) => localStorage.getItem(k), key);

test.describe("Impostazioni", () => {
  test("salvataggio: le modifiche restano dopo il ricaricamento; «Ripristina Predefiniti» torna ai valori di fabbrica", async ({ page }) => {
    await page.goto("/settings");
    await page.getByTestId("settings-section-vehicle").click();
    await expect(page.getByTestId("settings-save")).toBeDisabled(); // nessuna modifica

    await page.getByTestId("settings-model-name").fill("Auto di prova");
    const tankBefore = await page.getByTestId("tank-value").innerText();
    await page.getByTestId("tank-plus").click();
    await expect(page.getByTestId("tank-value")).not.toHaveText(tankBefore);
    const tankAfter = await page.getByTestId("tank-value").innerText();
    await expect(page.getByTestId("settings-save")).toBeEnabled();

    await page.getByTestId("settings-save").click();
    await expect(page.getByTestId("settings-notice")).toBeVisible();
    expect(await stored(page, SETTINGS_KEY)).toContain("Auto di prova");

    await page.reload();
    await page.getByTestId("settings-section-vehicle").click();
    await expect(page.getByTestId("settings-model-name")).toHaveValue("Auto di prova");
    await expect(page.getByTestId("tank-value")).toHaveText(tankAfter);

    await page.getByTestId("settings-restore").click();
    await expect(page.getByTestId("settings-notice")).toBeVisible();
    await expect(page.getByTestId("settings-model-name")).toHaveValue("");
    await expect(page.getByTestId("tank-value")).toHaveText(tankBefore);
    expect(await stored(page, SETTINGS_KEY)).not.toContain("Auto di prova");
  });

  test("il serbatoio salvato finisce nelle impostazioni memorizzate (valore iniziale dei litri nella ricerca)", async ({ page }) => {
    await page.goto("/settings");
    await page.getByTestId("settings-section-vehicle").click();
    await page.getByTestId("tank-plus").click();
    await page.getByTestId("settings-save").click();
    await expect(page.getByTestId("settings-notice")).toBeVisible();
    const saved = JSON.parse((await stored(page, SETTINGS_KEY)) ?? "{}") as { settings?: { vehicle?: { tankLiters?: number } } };
    expect(saved.settings?.vehicle?.tankLiters).toBeGreaterThan(0);
  });

  test("cambio tema mappa: la scelta si salva con «Salva Preferenze», sopravvive al ricaricamento e «Ripristina» torna a Light subito", async ({ page }) => {
    await page.goto("/settings");
    await page.getByTestId("settings-section-map").click();
    const duotono = page.getByTestId("map-style-duotono");
    await expect(page.getByTestId("map-style-light")).toHaveAttribute("data-selected", "true"); // predefinito
    await duotono.click();
    await expect(duotono).toHaveAttribute("data-selected", "true");
    expect(await stored(page, MAP_STYLE_KEY)).not.toBe("duotono"); // bozza: finché non si salva non vale

    await page.getByTestId("settings-save").click();
    await expect(page.getByTestId("settings-notice")).toBeVisible();
    expect(await stored(page, MAP_STYLE_KEY)).toBe("duotono");

    await page.reload();
    await page.getByTestId("settings-section-map").click();
    await expect(page.getByTestId("map-style-duotono")).toHaveAttribute("data-selected", "true");

    await page.getByTestId("settings-restore").click();
    await expect(page.getByTestId("map-style-light")).toHaveAttribute("data-selected", "true");
    expect(await stored(page, MAP_STYLE_KEY)).toBe("light"); // subito, senza salvare
  });
});

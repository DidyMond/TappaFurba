import type { Page } from "@playwright/test";
import { expect, searchFromHome, test } from "./fixtures";

// Viewport da telefono (iPhone 12) con tocco: il foglio dei Risultati a tre punti esiste solo sotto md.
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

/** Aspetta che il foglio smetta di muoversi (l'aggancio dura ~200 ms: su macchine lente la maniglia si misurerebbe a metà corsa). */
async function waitUntilStill(page: Page) {
  let last = Number.NaN;
  await expect
    .poll(
      async () => {
        const y = (await page.getByTestId("bottom-sheet").boundingBox())!.y;
        const still = y === last;
        last = y;
        return still;
      },
      { intervals: [150] },
    )
    .toBe(true);
}

async function dragHandle(page: Page, dy: number) {
  await waitUntilStill(page);
  const box = (await page.getByTestId("sheet-handle").boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y + dy, { steps: 10 });
  await page.mouse.up();
}

test.describe("foglio dei Risultati a tre stati (mobile)", () => {
  test("si apre «chiuso»; il tocco alterna chiuso ↔ espanso e NON riduce mai", async ({ page }) => {
    await searchFromHome(page);
    const sheet = page.getByTestId("bottom-sheet");
    await expect(sheet).toHaveAttribute("data-snap", "collapsed");
    await expect(page.getByTestId("sheet-handle")).toHaveAttribute("aria-expanded", "true");

    for (let i = 0; i < 4; i++) {
      await page.getByTestId("sheet-handle").click();
      await expect(sheet).toHaveAttribute("data-snap", i % 2 === 0 ? "expanded" : "collapsed");
    }
  });

  test("trascinando giù si riduce (solo la maniglia, mappa a tutto spazio), su si espande (mai al 100%), il tab «Risultati» ripristina", async ({ page }) => {
    await searchFromHome(page);
    const sheet = page.getByTestId("bottom-sheet");
    const viewportHeight = page.viewportSize()!.height;

    await dragHandle(page, 400);
    await expect(sheet).toHaveAttribute("data-snap", "minimized");
    await expect(page.getByTestId("sheet-handle")).toHaveAttribute("aria-expanded", "false");
    await expect(page.getByTestId("sheet-scroll")).toBeHidden(); // l'elenco non si vede né si raggiunge con Tab
    expect((await sheet.boundingBox())!.height).toBeLessThan(viewportHeight * 0.2);
    await expect
      .poll(async () => (await page.getByTestId("map-region").boundingBox())!.height)
      .toBeGreaterThan(viewportHeight * 0.6); // la mappa occupa quasi tutto lo spazio

    // Tocco sulla maniglia da ridotto → chiuso (non espanso).
    await page.getByTestId("sheet-handle").click();
    await expect(sheet).toHaveAttribute("data-snap", "collapsed");
    await expect(page.getByTestId("sheet-scroll")).toBeVisible();

    // Su: espanso, ma il foglio non copre tutto lo schermo (header e mappa restano visibili).
    await dragHandle(page, -300); // resta dentro lo schermo: il mouse fuori dalla finestra non genera eventi su Linux
    await expect(sheet).toHaveAttribute("data-snap", "expanded");
    const expanded = (await sheet.boundingBox())!;
    expect(expanded.height).toBeLessThan(viewportHeight * 0.9);
    expect(expanded.y).toBeGreaterThan(72); // sotto l'header

    // Di nuovo giù fino a ridotto, poi il tocco sul tab «Risultati» già attivo ripristina «chiuso».
    await dragHandle(page, 650);
    await expect(sheet).toHaveAttribute("data-snap", "minimized");
    await page.getByTestId("nav-results").click();
    await expect(sheet).toHaveAttribute("data-snap", "collapsed");
  });

  test("ogni nuova ricerca riparte da «chiuso»", async ({ page }) => {
    await searchFromHome(page);
    await dragHandle(page, 400);
    await expect(page.getByTestId("bottom-sheet")).toHaveAttribute("data-snap", "minimized");
    await page.getByTestId("nav-home").click();
    await page.getByTestId("frequent-route").first().click();
    await expect(page.getByTestId("search-submit")).toBeEnabled();
    await page.getByTestId("search-submit").click();
    await expect(page).toHaveURL(/\/results$/);
    await expect(page.getByTestId("bottom-sheet")).toHaveAttribute("data-snap", "collapsed");
  });
});

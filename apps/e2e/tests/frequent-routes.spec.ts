import { expect, searchFromHome, test } from "./fixtures";

test.describe("Tragitti frequenti", () => {
  test("dopo una ricerca il tragitto compare nella Home; un tocco rifà la ricerca e porta ai Risultati", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("frequent-routes-empty")).toBeVisible(); // profilo pulito: nessun tragitto
    await searchFromHome(page);

    await page.getByTestId("nav-home").click();
    await expect(page).toHaveURL(/\/$/);
    const route = page.getByTestId("frequent-route").first();
    await expect(route).toBeVisible();
    await expect(page.getByTestId("saved-count")).toBeVisible();

    // Il tocco apre il foglio di ricerca con il tragitto già compilato (si risolvono di nuovo i due luoghi); poi si conferma.
    await route.click();
    const submit = page.getByTestId("search-submit");
    await expect(submit).toBeEnabled();
    const request = page.waitForRequest((r) => r.method() === "POST" && r.url().endsWith("/search"));
    await submit.click();
    await request;
    await expect(page).toHaveURL(/\/results$/);
    await expect(page.getByTestId("station-card").first()).toBeVisible();
  });

  test("lo storico salva solo testi, mai coordinate né identificativi dei luoghi (decisione sui termini d'uso di Mapbox)", async ({ page }) => {
    await searchFromHome(page);
    const dump = await page.evaluate(() =>
      Object.entries(localStorage)
        .filter(([key]) => /recent-routes/i.test(key))
        .map(([, value]) => value)
        .join("\n"),
    );
    expect(dump.length).toBeGreaterThan(0);
    expect(dump).not.toMatch(/"(lon|lat|id|mapbox_id)"/);
    expect(dump).not.toMatch(/\d{1,2}\.\d{3,}/); // nessuna coordinata
  });
});

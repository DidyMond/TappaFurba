import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RECENT_ROUTES_KEY } from "./lib/recentRoutes";
import { makeNearbyResponse, makeResponse } from "./test/fixtures";

// La mappa reale richiede WebGL: lo stub lascia vedere che cosa riceve.
vi.mock("./components/results/MapView", () => ({
  MapView: (props: { geometry: unknown[]; center?: readonly [number, number] | null }) => (
    <div data-testid="map-stub" data-geometry={props.geometry.length} data-center={props.center ? props.center.join(",") : "none"} />
  ),
}));

import App from "./App";

const suggestion = { id: "a", name: "Via Esempio 12", label: "Via Esempio 12, 20100 Milano, Italia", lon: 9.15, lat: 45.55 };

let fetchSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  localStorage.clear();
  window.scrollTo = vi.fn();
  fetchSpy = vi.fn(async (url: string) => {
    const path = String(url);
    if (path.includes("/geocode/autocomplete")) return { ok: true, json: async () => ({ suggestions: [suggestion] }) };
    if (path.endsWith("/nearby")) return { ok: true, json: async () => makeNearbyResponse() };
    if (path.endsWith("/search")) return { ok: true, json: async () => makeResponse() };
    return { ok: true, json: async () => ({}) };
  });
  vi.stubGlobal("fetch", fetchSpy);
});
afterEach(() => vi.unstubAllGlobals());

const apiCalls = (suffix: string) => fetchSpy.mock.calls.filter(([url]) => String(url).endsWith(suffix));

async function openSheet(user: ReturnType<typeof userEvent.setup>) {
  render(
    <MemoryRouter initialEntries={["/"]}>
      <App />
    </MemoryRouter>,
  );
  await user.click(screen.getByTestId("search-bar"));
}

describe("App — «Intorno a me»", () => {
  it("dal form ai risultati: chiama POST /nearby (non /search) con punto e raggio, e mostra i risultati intorno al punto", async () => {
    const user = userEvent.setup();
    await openSheet(user);
    await user.click(screen.getByTestId("mode-nearby"));
    await user.type(screen.getByPlaceholderText("Dove sei? Scrivi un indirizzo o usa il mirino"), "via esempio");
    await user.click((await screen.findAllByRole("option"))[0]!);
    await user.click(screen.getByTestId("search-submit"));

    await waitFor(() => expect(screen.getByTestId("bottom-sheet")).toBeInTheDocument());
    expect(apiCalls("/search")).toHaveLength(0);
    expect(apiCalls("/nearby")).toHaveLength(1);

    const [, init] = apiCalls("/nearby")[0]!;
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({ origin: { lon: 9.15, lat: 45.55 }, radiusKm: 5, fuelType: "benzina" });
    expect(body).not.toHaveProperty("destination");

    expect(screen.getByRole("region", { name: "Stazioni intorno a te" })).toBeInTheDocument();
    expect(screen.getByTestId("nearby-capsule")).toHaveTextContent("Intorno a Milano");
    expect(screen.getByTestId("map-stub")).toHaveAttribute("data-geometry", "0");
    expect(screen.getByTestId("map-stub")).toHaveAttribute("data-center", "9.204,45.4864");
  });

  it("«Intorno a me» non entra nei «Tragitti frequenti»: non ha un tragitto e il punto di partenza non si salva", async () => {
    const user = userEvent.setup();
    await openSheet(user);
    await user.click(screen.getByTestId("mode-nearby"));
    await user.type(screen.getByPlaceholderText("Dove sei? Scrivi un indirizzo o usa il mirino"), "via esempio");
    await user.click((await screen.findAllByRole("option"))[0]!);
    await user.click(screen.getByTestId("search-submit"));
    await waitFor(() => expect(screen.getByTestId("bottom-sheet")).toBeInTheDocument());

    expect(localStorage.getItem(RECENT_ROUTES_KEY)).toBeNull();
    expect(JSON.stringify({ ...localStorage })).not.toContain("Via Esempio");
  });

  it("«In viaggio» non è cambiato: chiama POST /search e salva il tragitto tra i frequenti", async () => {
    const user = userEvent.setup();
    await openSheet(user);
    await user.type(screen.getByPlaceholderText("Da dove parti?"), "via esempio");
    await user.click((await screen.findAllByRole("option"))[0]!);
    await user.type(screen.getByPlaceholderText("Dove stai andando?"), "via esempio");
    await user.click((await screen.findAllByRole("option"))[0]!);
    await user.click(screen.getByTestId("search-submit"));
    await waitFor(() => expect(screen.getByTestId("bottom-sheet")).toBeInTheDocument());

    expect(apiCalls("/nearby")).toHaveLength(0);
    expect(apiCalls("/search")).toHaveLength(1);
    expect(localStorage.getItem(RECENT_ROUTES_KEY)).not.toBeNull();
  });
});

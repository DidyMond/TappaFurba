import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeDetail } from "./test/fixtures";
import { resetViewport, setViewportWidth } from "./test/matchMedia";

// `idle`: nessuna ricerca in memoria (per provare l'indirizzo diretto del dettaglio, il deep-link).
const searchMode = vi.hoisted(() => ({ idle: false }));

// Ricerca già riuscita: si prova la navigazione Risultati ↔ dettaglio stazione senza passare dal form.
vi.mock("./hooks/useSearch", async () => {
  const fixtures = await import("./test/fixtures");
  const response = fixtures.makeResponse();
  const state = {
    status: "success",
    response,
    results: response.results,
    refinement: response.refinement,
    request: fixtures.REQUEST,
    labels: { origin: "Via Roma 1, 20100 Milano", destination: "Piazza Maggiore, 40124 Bologna" },
  };
  return { useSearch: () => ({ state: searchMode.idle ? { status: "idle" } : state, search: vi.fn() }) };
});

// La mappa reale richiede WebGL: lo stub conta quante volte viene montata (una sola = lo stato è stato preservato).
const mapMounts = vi.hoisted(() => ({ count: 0 }));
vi.mock("./components/results/MapView", () => ({
  MapView: () => {
    useEffect(() => {
      mapMounts.count += 1;
    }, []);
    return <div data-testid="map-stub" />;
  },
}));

import App from "./App";

let fetchSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  mapMounts.count = 0;
  searchMode.idle = false;
  fetchSpy = vi.fn(async (url: string) => {
    if (String(url).endsWith("/route")) {
      return { ok: true, json: async () => ({ searchId: "s1", stationId: 2, distanceKm: 1, durationMinutes: 1, detourKm: 1, detourMinutes: 1, geometry: [[9, 45], [10, 45]] }) };
    }
    return { ok: true, json: async () => makeDetail() };
  });
  vi.stubGlobal("fetch", fetchSpy);
  localStorage.clear();
  window.scrollTo = vi.fn();
});
afterEach(() => {
  resetViewport();
  vi.unstubAllGlobals();
});

const renderApp = (path = "/results") =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );

const cardIds = () => screen.getAllByTestId("station-card").map((el) => Number(el.getAttribute("data-station-id")));
const resultsWrapper = () => screen.getByTestId("bottom-sheet").parentElement!.parentElement!;

describe("App — dal dettaglio stazione ai Risultati", () => {
  it("«Info» apre il dettaglio (chiamata on-demand) e nasconde header globale e barra inferiore", async () => {
    const user = userEvent.setup();
    renderApp();
    expect(screen.getByRole("navigation", { name: "Navigazione principale" })).toBeInTheDocument();

    await user.click(within(screen.getAllByTestId("station-card")[1]!).getByRole("button", { name: /Info su/ }));
    expect(await screen.findByRole("heading", { name: "1858 BREGNANO" })).toBeInTheDocument();

    const detailCalls = fetchSpy.mock.calls.map((c) => String(c[0])).filter((u) => u.endsWith("/stations/2"));
    expect(detailCalls).toHaveLength(1);
    expect(screen.queryByRole("navigation", { name: "Navigazione principale" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("banner")).toHaveLength(1); // solo l'header a pila della schermata di dettaglio
    expect(resultsWrapper()).toHaveClass("hidden");
  });

  it("il tap sulla scheda seleziona soltanto: nessuna navigazione verso il dettaglio", async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getAllByTestId("station-card")[1]!);
    expect(screen.getAllByTestId("station-card")[1]).toHaveAttribute("aria-current", "true");
    expect(screen.queryByRole("heading", { name: "1858 BREGNANO" })).not.toBeInTheDocument();
    expect(fetchSpy.mock.calls.some((c) => /\/stations\/\d+$/.test(String(c[0])))).toBe(false); // solo il percorso con sosta (/route)
    expect(resultsWrapper()).not.toHaveClass("hidden");
  });

  it("indietro riporta ai Risultati con ordinamento, filtri, selezione e mappa preservati (nessun rimontaggio)", async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByRole("button", { name: "Minor deviazione" }));
    await user.click(screen.getByRole("button", { name: "Autostrada" }));
    const before = cardIds();
    expect(before).toEqual([1]);
    await user.click(screen.getByRole("button", { name: "Autostrada" })); // torna a tutte e tre
    const order = cardIds();
    expect(order).toEqual([2, 3, 1]); // «Minor deviazione»

    await user.click(screen.getAllByTestId("station-card")[0]!); // selezione
    await user.click(within(screen.getAllByTestId("station-card")[0]!).getByRole("button", { name: /Info su/ }));
    await screen.findByRole("heading", { name: "1858 BREGNANO" });
    await user.click(screen.getByRole("button", { name: "Torna ai risultati" }));

    await waitFor(() => expect(screen.getByRole("navigation", { name: "Navigazione principale" })).toBeInTheDocument());
    expect(resultsWrapper()).not.toHaveClass("hidden");
    expect(screen.getByRole("button", { name: "Minor deviazione" })).toHaveAttribute("aria-pressed", "true");
    expect(cardIds()).toEqual(order);
    expect(screen.getAllByTestId("station-card")[0]).toHaveAttribute("aria-current", "true"); // la stazione aperta resta selezionata
    expect(mapMounts.count).toBe(1);
  });
});

describe("App — su desktop «Info» apre il dettaglio in un dialogo sopra i Risultati (≥1024 px)", () => {
  const info = (index: number) => within(screen.getAllByTestId("station-card")[index]!).getByRole("button", { name: /Info su/ });

  it("senza cambiare rotta: i Risultati restano visibili (nessuna pagina di dettaglio, header e barra inferiore al loro posto)", async () => {
    setViewportWidth(1280);
    const user = userEvent.setup();
    renderApp();
    await user.click(info(1));
    const dialog = await screen.findByRole("dialog", { name: /Dettaglio stazione/ });
    expect(await within(dialog).findByRole("heading", { name: "1858 BREGNANO" })).toBeInTheDocument();
    // i Risultati sono ancora lì sotto, non nascosti, e la barra di navigazione c'è (il dialogo non è una schermata a pila)
    expect(resultsWrapper()).not.toHaveClass("hidden");
    expect(screen.getByRole("navigation", { name: "Navigazione principale" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Risultati" })).toHaveAttribute("aria-current", "page");
    expect(screen.getAllByRole("banner")).toHaveLength(1); // l'header globale, non quello a pila
    expect(fetchSpy.mock.calls.map((c) => String(c[0])).filter((u) => u.endsWith("/stations/2"))).toHaveLength(1);
  });

  it("chiudendo (×, Esc o sfondo) si torna ai Risultati identici, con il focus sul pulsante «Info»", async () => {
    setViewportWidth(1280);
    const user = userEvent.setup();
    renderApp();
    const before = cardIds();
    for (const close of [async () => user.click(screen.getByRole("button", { name: "Chiudi" })), async () => user.keyboard("{Escape}"), async () => user.click(screen.getByTestId("station-dialog-backdrop"))]) {
      await user.click(info(1));
      await screen.findByRole("dialog", { name: /Dettaglio stazione/ });
      await close();
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(cardIds()).toEqual(before);
      expect(info(1)).toHaveFocus();
    }
    expect(mapMounts.count).toBe(1); // la mappa non si è mai rimontata
  });

  it("aprire un'altra stazione mostra quella nuova (il dialogo si rimonta)", async () => {
    setViewportWidth(1280);
    const user = userEvent.setup();
    renderApp();
    await user.click(info(1));
    await screen.findByRole("dialog", { name: /Dettaglio stazione/ });
    await user.click(screen.getByRole("button", { name: "Chiudi" }));
    await user.click(info(0));
    await screen.findByRole("dialog", { name: /Dettaglio stazione/ });
    const stationCalls = fetchSpy.mock.calls.map((c) => String(c[0])).filter((u) => /\/stations\/\d+$/.test(u));
    expect(stationCalls).toHaveLength(2);
  });

  it("sotto i 1024 px (mobile/tablet) resta la schermata a pagina intera, come prima", async () => {
    setViewportWidth(900);
    const user = userEvent.setup();
    renderApp();
    await user.click(info(1));
    expect(await screen.findByRole("heading", { name: "1858 BREGNANO" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Navigazione principale" })).not.toBeInTheDocument();
    expect(resultsWrapper()).toHaveClass("hidden");
  });

  it("l'indirizzo diretto /station/… senza ricerca viva rende il dettaglio a pagina intera anche su desktop (deep-link)", async () => {
    setViewportWidth(1280);
    searchMode.idle = true; // nessuna ricerca in memoria
    renderApp("/station/s1/2");
    expect(await screen.findByRole("heading", { name: "1858 BREGNANO" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getAllByRole("banner")).toHaveLength(1);
  });

  it("se la finestra si stringe sotto i 1024 px il dialogo si chiude", async () => {
    setViewportWidth(1280);
    const user = userEvent.setup();
    renderApp();
    await user.click(info(1));
    await screen.findByRole("dialog", { name: /Dettaglio stazione/ });
    setViewportWidth(800);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });
});

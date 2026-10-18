import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadRecentRoutes, resetRecentRoutesMemory } from "./lib/recentRoutes";
import { FACTORY_SETTINGS, loadSettings, resetSettingsMemory, saveSettings, SETTINGS_KEY } from "./lib/settings";

// Ricerca simulata: lo stato di useSearch è deciso dal singolo test.
const searchState = vi.hoisted(() => ({ current: { status: "idle" } as unknown }));
const searchSpy = vi.hoisted(() => vi.fn());
vi.mock("./hooks/useSearch", () => ({ useSearch: () => ({ state: searchState.current, search: searchSpy }) }));
vi.mock("./components/results/MapView", () => ({ MapView: () => <div data-testid="map-stub" /> }));

import App from "./App";
import { makeResponse, REQUEST } from "./test/fixtures";

function successWith(referencePrice: { value: number; level: "on_route" | "corridor" | "national" | "manual"; sampleSize: number }, fuelType: "benzina" | "diesel" = "benzina") {
  const response = makeResponse({ referencePrice });
  searchState.current = {
    status: "success",
    response,
    results: response.results,
    refinement: response.refinement,
    request: { ...REQUEST, fuelType },
    labels: { origin: "Milano", destination: "Bologna" },
  };
}

const renderApp = (path = "/") =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );

beforeEach(() => {
  localStorage.clear();
  resetSettingsMemory();
  resetRecentRoutesMemory();
  searchState.current = { status: "idle" };
  searchSpy.mockReset();
});

describe("App — barra inferiore a 3 tab e rotta /settings", () => {
  it("la barra ha Cerca, Risultati e Impostazioni (in quest'ordine)", () => {
    renderApp();
    const nav = screen.getByRole("navigation", { name: "Navigazione principale" });
    expect(within(nav).getAllByText(/Cerca|Risultati|Impostazioni/).map((el) => el.textContent)).toEqual(["Cerca", "Risultati", "Impostazioni"]);
  });

  it("«Impostazioni» è sempre raggiungibile, anche senza ricerca, e apre la schermata", async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByRole("link", { name: "Impostazioni" }));
    expect(screen.getByRole("heading", { level: 1, name: "Impostazioni Veicolo & Risparmio" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Impostazioni" })).toHaveAttribute("aria-current", "page");
  });

  it("un indirizzo diretto /settings apre le Impostazioni", () => {
    renderApp("/settings");
    expect(screen.getByRole("heading", { level: 1, name: "Impostazioni Veicolo & Risparmio" })).toBeInTheDocument();
  });

  it("la barra resta anche sulle Impostazioni (come su Cerca e Risultati)", () => {
    renderApp("/settings");
    expect(screen.getByRole("navigation", { name: "Navigazione principale" })).toBeInTheDocument();
  });

  it("le preferenze salvate precompilano il form di Cerca alla ricerca successiva", async () => {
    const user = userEvent.setup();
    renderApp("/settings");
    // La Home resta montata (nascosta) sotto le Impostazioni: si agisce dentro la sezione del profilo veicolo.
    await user.click(screen.getByRole("button", { name: "Profilo Veicolo" })); // le sezioni sono chiuse al caricamento
    const profile = screen.getByRole("region", { name: "Profilo Veicolo" });
    await user.click(within(profile).getByRole("radio", { name: "Diesel" }));
    const stepper = screen.getByRole("group", { name: "Capacità serbatoio" });
    await user.click(within(stepper).getByRole("button", { name: "Aumenta capacità serbatoio" }));
    await user.click(screen.getByRole("button", { name: "Salva Preferenze" }));
    expect(loadSettings().vehicle).toMatchObject({ defaultFuel: "diesel", tankLiters: 50 });

    await user.click(screen.getByRole("link", { name: "Cerca" }));
    await user.click(screen.getByTestId("search-bar")); // il form sta nel foglio della Home
    expect(screen.getByRole("radio", { name: "Diesel", checked: true })).toBeInTheDocument();
    expect(screen.getByText("50 L")).toBeInTheDocument();
  });
});

describe("App — «Opzioni percorso» nei Risultati rilancia la ricerca", () => {
  const options = () => screen.getByTestId("route-options-chip");

  it("«Applica» rilancia POST /search con la stessa richiesta (stesso A/B e parametri) e le nuove esclusioni, con le stesse etichette", async () => {
    successWith({ value: 2.139, level: "on_route", sampleSize: 40 });
    const user = userEvent.setup();
    renderApp("/results");
    await user.click(options());
    await user.click(screen.getByRole("switch", { name: "Evita autostrade" }));
    await user.click(screen.getByRole("switch", { name: "Evita pedaggi" }));
    await user.click(screen.getByRole("button", { name: "Applica" }));

    expect(searchSpy).toHaveBeenCalledTimes(1);
    const [request, labels] = searchSpy.mock.calls[0]!;
    expect(request).toEqual({ ...REQUEST, avoidMotorway: true, avoidTolls: true, avoidFerries: false });
    expect(labels).toEqual({ origin: "Milano", destination: "Bologna" });
  });

  it("«Reimposta» usa i default salvati nelle Impostazioni (pedaggi e traghetti compresi)", async () => {
    saveSettings({ ...FACTORY_SETTINGS, avoidMotorway: true, avoidFerries: true });
    successWith({ value: 2.139, level: "on_route", sampleSize: 40 });
    const user = userEvent.setup();
    renderApp("/results");
    await user.click(options());
    await user.click(screen.getByRole("button", { name: "Reimposta" }));
    expect(screen.getByRole("switch", { name: "Evita autostrade" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("switch", { name: "Evita pedaggi" })).toHaveAttribute("aria-checked", "false");
    expect(screen.getByRole("switch", { name: "Evita traghetti" })).toHaveAttribute("aria-checked", "true");
  });

  it("mentre la nuova ricerca è in corso i risultati precedenti restano visibili (nessun rimbalzo alla Home)", () => {
    successWith({ value: 2.139, level: "on_route", sampleSize: 40 });
    const view = renderApp("/results");
    expect(screen.getAllByTestId("station-card").length).toBeGreaterThan(0);

    searchState.current = { status: "loading" };
    view.rerender(
      <MemoryRouter initialEntries={["/results"]}>
        <App />
      </MemoryRouter>,
    );
    expect(screen.getAllByTestId("station-card").length).toBeGreaterThan(0);
    expect(screen.getByText("Ricalcolo con le nuove opzioni…")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Risultati" })).not.toHaveAttribute("aria-disabled", "true");
  });
});

describe("App — ultimo prezzo di riferimento automatico (per pre-compilare «Manuale»)", () => {
  it("dopo una ricerca automatica ricorda il riferimento di quel carburante", () => {
    successWith({ value: 2.139, level: "on_route", sampleSize: 40 });
    renderApp("/results");
    expect(loadSettings().lastAutomaticReference).toEqual({ benzina: 2.139 });
  });

  it("un riferimento manuale NON viene ricordato come automatico", () => {
    successWith({ value: 2.5, level: "manual", sampleSize: 0 });
    renderApp("/results");
    expect(loadSettings().lastAutomaticReference).toEqual({});
    expect(localStorage.getItem(SETTINGS_KEY)).toBeNull(); // niente da scrivere
  });

  it("ricorda per carburante, senza toccare le preferenze", () => {
    successWith({ value: 1.95, level: "corridor", sampleSize: 12 }, "diesel");
    renderApp("/results");
    const s = loadSettings();
    expect(s.lastAutomaticReference).toEqual({ diesel: 1.95 });
    expect(s.referenceMode).toBe("auto");
    expect(s.vehicle.defaultFuel).toBe("benzina");
  });

  it("le Impostazioni mostrano il costo al km dall'ultimo riferimento automatico", async () => {
    successWith({ value: 1.8, level: "on_route", sampleSize: 40 });
    const user = userEvent.setup();
    renderApp("/results");
    await user.click(screen.getByRole("link", { name: "Impostazioni" }));
    await user.click(screen.getByRole("button", { name: "Consumi e Carburante" }));
    expect(screen.getByTestId("cost-per-km")).toHaveTextContent("~€0,12/km"); // 1,80 ÷ 15 km/L
  });
});

describe("App — avviso «stazioni non mostrate»", () => {
  it("«Cambia soglia» apre le Impostazioni con «Notifiche & Dati di Sistema» aperta e il cursore sulla soglia di freschezza", async () => {
    const user = userEvent.setup();
    const response = makeResponse({ staleStations: { count: 7, maxAgeHours: 72 } });
    searchState.current = { status: "success", response, results: response.results, refinement: response.refinement, request: REQUEST, labels: { origin: "Milano", destination: "Bologna" } };
    renderApp("/results");
    await user.click(within(screen.getByTestId("stale-notice")).getByRole("button", { name: "Cambia soglia" }));
    expect(screen.getByRole("heading", { level: 1, name: "Impostazioni Veicolo & Risparmio" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Notifiche & Dati di Sistema" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("textbox", { name: "Soglia di freschezza prezzi" })).toHaveFocus();
    expect(screen.getByRole("textbox", { name: "Soglia di freschezza prezzi" })).toHaveValue("72");
  });

  it("aprendo le Impostazioni dalla barra (senza l'avviso) le sezioni restano chiuse e nessun campo ha il focus", async () => {
    const user = userEvent.setup();
    renderApp("/");
    await user.click(screen.getByRole("link", { name: "Impostazioni" }));
    expect(screen.getByRole("button", { name: "Notifiche & Dati di Sistema" })).toHaveAttribute("aria-expanded", "false");
  });
});

describe("App — Tragitti frequenti", () => {
  it("una ricerca riuscita registra il tragitto (etichette, coordinate, carburante) e la Home lo mostra", async () => {
    successWith({ value: 2.139, level: "on_route", sampleSize: 40 }, "diesel");
    renderApp("/results");
    const [route] = loadRecentRoutes();
    expect(route).toMatchObject({ origin: { text: "Milano" }, destination: { text: "Bologna" }, fuelType: "diesel", count: 1 });
    // Nello storage solo testi: nessuna coordinata.
    const raw = localStorage.getItem("tappafurba.recent-routes.v1")!;
    expect(raw).not.toMatch(/lon|lat|mapbox/i);
    expect(raw).not.toContain(String(REQUEST.origin.lon));

    const user = userEvent.setup();
    await user.click(screen.getByRole("link", { name: "Cerca" }));
    expect(screen.getByRole("button", { name: /Milano → Bologna/ })).toHaveTextContent("Diesel · ultimo uso oggi");
  });

  it("un errore o una ricerca in corso non registrano nulla", () => {
    searchState.current = { status: "loading" };
    renderApp("/");
    expect(loadRecentRoutes()).toEqual([]);
  });
});

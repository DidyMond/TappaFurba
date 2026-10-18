import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetInstallPromptCapture, type BeforeInstallPromptEvent } from "./hooks/useInstallPrompt";
import { resetSettingsMemory } from "./lib/settings";

const searchState = vi.hoisted(() => ({ current: { status: "idle" } as unknown }));
vi.mock("./hooks/useSearch", () => ({ useSearch: () => ({ state: searchState.current, search: vi.fn() }) }));
vi.mock("./components/results/MapView", () => ({ MapView: () => <div data-testid="map-stub" /> }));

import App from "./App";
import { makeResponse, REQUEST } from "./test/fixtures";

const renderApp = (path = "/") =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );

function offerInstall() {
  const event = new Event("beforeinstallprompt", { cancelable: true }) as BeforeInstallPromptEvent;
  Object.assign(event, { prompt: vi.fn().mockResolvedValue(undefined), userChoice: Promise.resolve({ outcome: "accepted", platform: "web" }) });
  act(() => void window.dispatchEvent(event));
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  resetSettingsMemory();
  resetInstallPromptCapture();
  searchState.current = { status: "idle" };
});
afterEach(() => vi.restoreAllMocks());

describe("App — banner di installazione", () => {
  it("sulla Home compare quando il browser offre l'installazione", () => {
    renderApp("/");
    expect(screen.queryByRole("button", { name: "Installa TappaFurba" })).not.toBeInTheDocument();
    offerInstall();
    expect(screen.getByRole("button", { name: "Installa TappaFurba" })).toBeInTheDocument();
  });

  // Il banner vive nella Home, che sulle altre schermate resta montata ma nascosta (classe `hidden`: jsdom non carica il CSS).
  const bannerIsHidden = () => screen.getByRole("button", { name: "Installa TappaFurba" }).closest("main")!.classList.contains("hidden");

  it("non si vede sulle altre schermate (Impostazioni), per non disturbare", () => {
    renderApp("/settings");
    offerInstall();
    expect(bannerIsHidden()).toBe(true);
  });

  it("sulla Home il banner è visibile (contenitore non nascosto) e sta in cima, prima della barra di ricerca", () => {
    renderApp("/");
    offerInstall();
    expect(bannerIsHidden()).toBe(false);
    const banner = screen.getByRole("complementary", { name: "Installa l'app" });
    expect(banner.compareDocumentPosition(screen.getByTestId("search-bar")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("non si vede sui Risultati (la mappa resta libera)", () => {
    const response = makeResponse();
    searchState.current = {
      status: "success",
      response,
      results: response.results,
      refinement: response.refinement,
      request: REQUEST,
      labels: { origin: "Milano", destination: "Bologna" },
    };
    renderApp("/results");
    offerInstall();
    expect(bannerIsHidden()).toBe(true);
  });

  it("«Non ora» lo chiude e tornando sulla Home non riappare", async () => {
    const user = userEvent.setup();
    renderApp("/");
    offerInstall();
    await user.click(screen.getByRole("button", { name: "Non ora" }));
    await user.click(screen.getByRole("link", { name: "Impostazioni" }));
    await user.click(screen.getByRole("link", { name: "Cerca" }));
    expect(screen.queryByRole("button", { name: "Installa TappaFurba" })).not.toBeInTheDocument();
  });
});

describe("App — guida di installazione per iOS", () => {
  const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";

  it("su iPhone la Home mostra la guida (Condividi → Aggiungi alla schermata Home) in cima, prima della barra di ricerca", () => {
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue(IPHONE);
    renderApp("/");
    const hint = screen.getByRole("complementary", { name: "Come installare l'app" });
    expect(hint).toHaveTextContent("Aggiungi alla schermata Home");
    expect(hint.closest("main")!.classList.contains("hidden")).toBe(false);
    expect(hint.compareDocumentPosition(screen.getByTestId("search-bar")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("sulle altre schermate resta nascosta (è nella Home)", () => {
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue(IPHONE);
    renderApp("/settings");
    expect(screen.getByRole("complementary", { name: "Come installare l'app" }).closest("main")!.classList.contains("hidden")).toBe(true);
  });
});

describe("App — landmark `main` su ogni schermata (accessibilità)", () => {
  it("Impostazioni ha un proprio <main>", () => {
    renderApp("/settings");
    expect(screen.getByRole("heading", { level: 1, name: "Impostazioni Veicolo & Risparmio" }).closest("main")).not.toBeNull();
  });

  it("Risultati ha un proprio <main> con elenco e filtri", () => {
    const response = makeResponse();
    searchState.current = {
      status: "success",
      response,
      results: response.results,
      refinement: response.refinement,
      request: REQUEST,
      labels: { origin: "Milano", destination: "Bologna" },
    };
    renderApp("/results");
    expect(screen.getByRole("region", { name: "Stazioni lungo il percorso" }).closest("main")).not.toBeNull();
  });

  it("la Home ha il suo <main> con la barra di ricerca e il titolo h1", () => {
    renderApp("/");
    expect(screen.getByTestId("search-bar").closest("main")).not.toBeNull();
    expect(screen.getByRole("heading", { level: 1 }).closest("main")).not.toBeNull();
  });
});

describe("App — offline", () => {
  it("online non c'è nessun avviso offline", () => {
    renderApp("/");
    expect(screen.queryByText(/Sei offline/)).not.toBeInTheDocument();
  });

  it("offline la Home si apre comunque (shell) e dice chiaramente che per cercare serve la rete", () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    renderApp("/");
    expect(screen.getByTestId("search-bar")).toBeVisible();
    expect(screen.getByText(/Sei offline./)).toHaveAttribute("role", "status");
  });

  it("l'avviso compare e sparisce con gli eventi offline / online", () => {
    const spy = vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    renderApp("/");
    spy.mockReturnValue(false);
    act(() => void window.dispatchEvent(new Event("offline")));
    expect(screen.getByText(/Sei offline/)).toBeInTheDocument();
    spy.mockReturnValue(true);
    act(() => void window.dispatchEvent(new Event("online")));
    expect(screen.queryByText(/Sei offline/)).not.toBeInTheDocument();
  });
});

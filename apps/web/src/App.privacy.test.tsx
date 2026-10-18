import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetRecentRoutesMemory } from "./lib/recentRoutes";
import { resetSettingsMemory } from "./lib/settings";

vi.mock("./hooks/useSearch", () => ({ useSearch: () => ({ state: { status: "idle" }, search: vi.fn() }) }));
vi.mock("./components/results/MapView", () => ({ MapView: () => <div data-testid="map-stub" /> }));

import App from "./App";
import { DONATE_URL, PROJECT_REPO_URL } from "./lib/links";

const renderApp = (path = "/") =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );

const privacyHeading = () => screen.queryByRole("heading", { level: 1, name: "Privacy e note legali" });

beforeEach(() => {
  window.scrollTo = vi.fn(); // jsdom non lo implementa: la pagina parte dall'alto
  localStorage.clear();
  sessionStorage.clear();
  resetSettingsMemory();
  resetRecentRoutesMemory();
});

describe("App — rotta /privacy", () => {
  it("un indirizzo diretto /privacy apre la pagina (non rimanda alla Home)", () => {
    renderApp("/privacy");
    expect(privacyHeading()).toBeInTheDocument();
  });

  it("dalla Home un link a piè di pagina porta all'informativa", async () => {
    const user = userEvent.setup();
    renderApp("/");
    expect(privacyHeading()).not.toBeInTheDocument();
    await user.click(screen.getByTestId("home-privacy-link"));
    expect(privacyHeading()).toBeInTheDocument();
  });

  it("dalle Impostazioni: link a Privacy, al repository GitHub e alla donazione", async () => {
    const user = userEvent.setup();
    renderApp("/settings");
    const about = within(screen.getByTestId("settings-about"));
    expect(about.getByRole("heading", { name: "Informazioni e sostegno" })).toBeInTheDocument();
    const repo = about.getByRole("link", { name: /Codice sorgente su GitHub/ });
    const donate = about.getByRole("link", { name: /Sostieni il progetto/ });
    expect(repo).toHaveAttribute("href", PROJECT_REPO_URL);
    expect(donate).toHaveAttribute("href", DONATE_URL);
    for (const external of [repo, donate]) {
      expect(external).toHaveAttribute("target", "_blank");
      expect(external).toHaveAttribute("rel", "noopener noreferrer");
    }

    await user.click(about.getByRole("link", { name: "Privacy e note legali" }));
    expect(privacyHeading()).toBeInTheDocument();
  });

  it("il link «Impostazioni» della pagina riporta alle Impostazioni", async () => {
    const user = userEvent.setup();
    renderApp("/privacy");
    const main = screen.getByTestId("privacy-screen");
    await user.click(within(main).getByRole("link", { name: "Impostazioni" }));
    expect(screen.getByRole("heading", { level: 1, name: "Impostazioni Veicolo & Risparmio" })).toBeInTheDocument();
  });

  it("la barra inferiore resta disponibile sulla pagina", () => {
    renderApp("/privacy");
    expect(screen.getByRole("navigation", { name: "Navigazione principale" })).toBeInTheDocument();
  });
});

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

vi.mock("./components/results/MapView", () => ({ MapView: () => <div data-testid="map-stub" /> }));

import App from "./App";

describe("App — routing", () => {
  it("la Home mostra la barra di ricerca (il form è nel foglio, chiuso) e la scheda Risultati è disattivata finché non c'è una ricerca", () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <App />
      </MemoryRouter>,
    );
    expect(screen.getByRole("heading", { level: 1, name: /Trova il carburante al minor costo/ })).toBeVisible();
    expect(screen.getByTestId("search-bar")).toBeVisible();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(); // il foglio è chiuso
    const nav = screen.getByRole("navigation", { name: "Navigazione principale" });
    expect(nav).toHaveTextContent("Cerca");
    expect(screen.queryByRole("link", { name: "Risultati" })).not.toBeInTheDocument();
    expect(screen.getByText("Risultati").closest("[aria-disabled=true]")).not.toBeNull();
  });

  it("il contenitore della Home cresce con lo schermo: max-w-4xl da lg, 6xl da xl, 7xl da 2xl; mobile nella colonna max-w-md", () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <App />
      </MemoryRouter>,
    );
    const main = screen.getByTestId("search-bar").closest("main")!;
    expect(main).toHaveClass("max-w-md", "lg:max-w-4xl", "xl:max-w-6xl", "2xl:max-w-7xl", "mx-auto");
  });

  it("«ripristina profilo» (testo piccolo) usa il verde scuro per il contrasto WCAG", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/"]}>
        <App />
      </MemoryRouter>,
    );
    await user.click(screen.getByTestId("search-bar"));
    await user.click(screen.getByRole("button", { name: "Aumenta consumo" }));
    expect(screen.getByRole("button", { name: /ripristina profilo/ })).toHaveClass("text-on-primary-fixed-variant");
  });

  it("aprire /results senza una ricerca riporta alla Home", () => {
    render(
      <MemoryRouter initialEntries={["/results"]}>
        <App />
      </MemoryRouter>,
    );
    expect(screen.getByTestId("search-bar")).toBeVisible();
    expect(screen.queryByTestId("bottom-sheet")).not.toBeInTheDocument();
  });

  it("un percorso sconosciuto riporta alla Home", () => {
    render(
      <MemoryRouter initialEntries={["/qualcosa"]}>
        <App />
      </MemoryRouter>,
    );
    expect(screen.getByTestId("search-bar")).toBeVisible();
  });
  it("un indirizzo diretto del dettaglio stazione si apre senza ricerca in memoria, con il solo header a pila", async () => {
    const detail = (await import("./test/fixtures")).makeDetail();
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, json: async () => detail });
    vi.stubGlobal("fetch", fetchSpy);
    window.scrollTo = vi.fn();
    render(
      <MemoryRouter initialEntries={["/station/s1/2"]}>
        <App />
      </MemoryRouter>,
    );
    expect(await screen.findByRole("heading", { name: "1858 BREGNANO" })).toBeInTheDocument();
    expect(String(fetchSpy.mock.calls[0]![0])).toContain("/search/s1/stations/2");
    expect(screen.getAllByRole("banner")).toHaveLength(1);
    expect(screen.queryByRole("navigation", { name: "Navigazione principale" })).not.toBeInTheDocument();
    vi.unstubAllGlobals();
  });
});

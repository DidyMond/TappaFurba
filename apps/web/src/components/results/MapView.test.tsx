import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// Il vero MapCanvas richiede WebGL: si verifica solo che MapView lo carichi (lazy) quando c'è il token.
vi.mock("./MapCanvas", () => ({
  default: (props: { token: string }) => <div data-testid="canvas-stub">{props.token}</div>,
}));

import { MapView } from "./MapView";

const props = { geometry: [[9, 45], [10, 45]] as Array<[number, number]>, stations: [], selectedId: null,
  stopRoute: null,
  onSelectStation: () => {},
  onDeselect: () => {},
};

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("MapView", () => {
  it("senza token Mapbox mostra un segnaposto invece della mappa (l'elenco resta utilizzabile)", () => {
    vi.stubEnv("VITE_MAPBOX_PUBLIC_TOKEN", "");
    render(<MapView {...props} />);
    expect(screen.getByRole("status")).toHaveTextContent("Mappa non disponibile");
    expect(screen.queryByTestId("canvas-stub")).not.toBeInTheDocument();
  });

  it("un token fatto di soli spazi vale come assente", () => {
    vi.stubEnv("VITE_MAPBOX_PUBLIC_TOKEN", "   ");
    render(<MapView {...props} />);
    expect(screen.getByRole("status")).toHaveTextContent("Mappa non disponibile");
  });

  it("con il token carica la mappa (lazy) passandole il token e le props", async () => {
    vi.stubEnv("VITE_MAPBOX_PUBLIC_TOKEN", "pk.test");
    render(<MapView {...props} />);
    expect(await screen.findByTestId("canvas-stub")).toHaveTextContent("pk.test");
  });

  it("offline mostra «Mappa non disponibile offline» (anche col token) e non carica la mappa; l'elenco già caricato resta", () => {
    vi.stubEnv("VITE_MAPBOX_PUBLIC_TOKEN", "pk.test");
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    render(<MapView {...props} />);
    expect(screen.getByRole("status")).toHaveTextContent("Mappa non disponibile offline");
    expect(screen.getByRole("status")).toHaveTextContent("L'elenco delle stazioni già caricato resta visibile");
    expect(screen.queryByTestId("canvas-stub")).not.toBeInTheDocument();
    vi.restoreAllMocks();
  });

  it("al ritorno della rete la mappa si carica", async () => {
    vi.stubEnv("VITE_MAPBOX_PUBLIC_TOKEN", "pk.test");
    const spy = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    render(<MapView {...props} />);
    expect(screen.getByRole("status")).toHaveTextContent("offline");
    spy.mockReturnValue(true);
    act(() => void window.dispatchEvent(new Event("online")));
    expect(await screen.findByTestId("canvas-stub")).toBeInTheDocument();
    vi.restoreAllMocks();
  });
});

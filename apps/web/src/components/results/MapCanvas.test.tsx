import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mapbox GL richiede WebGL (assente in jsdom): si usa una mappa finta che registra le chiamate.
const fake = vi.hoisted(() => {
  const state = {
    maps: [] as Array<{
      resize: ReturnType<typeof vi.fn>;
      fitBounds: ReturnType<typeof vi.fn>;
      easeTo: ReturnType<typeof vi.fn>;
      remove: ReturnType<typeof vi.fn>;
      setStyle: ReturnType<typeof vi.fn>;
      addSource: ReturnType<typeof vi.fn>;
      addLayer: ReturnType<typeof vi.fn>;
      options: { style?: string };
      handlers: Record<string, (event?: unknown) => void>;
    }>,
    boundsPoints: [] as Array<Array<[number, number]>>,
    pinElements: [] as HTMLElement[],
    observerCallbacks: [] as Array<(entries: Array<{ contentRect: { width: number; height: number } }>) => void>,
  };

  class FakeBounds {
    points: Array<[number, number]> = [];
    constructor() {
      state.boundsPoints.push(this.points);
    }
    extend(point: [number, number]) {
      this.points.push(point);
      return this;
    }
  }

  class FakeMap {
    resize = vi.fn();
    fitBounds = vi.fn();
    easeTo = vi.fn();
    remove = vi.fn();
    setStyle = vi.fn();
    addSource = vi.fn();
    addLayer = vi.fn();
    handlers: Record<string, (event?: unknown) => void> = {};
    touchZoomRotate = { disableRotation: vi.fn() };
    constructor(public options: { style?: string } = {}) {
      state.maps.push(this);
    }
    on(event: string, handler: (event?: unknown) => void) {
      this.handlers[event] = handler;
      return this;
    }
    getContainer() {
      return { getBoundingClientRect: () => ({ width: 400, height: 300 }) };
    }
    project() {
      return { x: 100, y: 100 };
    }
    getZoom() {
      return 10;
    }
    getSource() {
      return { setData: vi.fn() };
    }
    zoomIn() {}
    zoomOut() {}
  }

  class FakeMarker {
    constructor(options?: { element?: HTMLElement }) {
      if (options?.element) state.pinElements.push(options.element);
    }
    setLngLat() {
      return this;
    }
    addTo() {
      return this;
    }
    remove() {}
  }

  return { state, FakeMap, FakeMarker, FakeBounds };
});

vi.mock("mapbox-gl", () => ({
  default: { Map: fake.FakeMap, Marker: fake.FakeMarker, LngLatBounds: fake.FakeBounds, accessToken: "" },
}));
vi.mock("mapbox-gl/dist/mapbox-gl.css", () => ({}));

import { MAP_STYLE_CHANGED_EVENT, MAP_STYLES, resetMapStyleMemory, setMapStyle } from "../../lib/mapStyle";
import MapCanvas from "./MapCanvas";

const GEOMETRY: Array<[number, number]> = [
  [9.15, 45.55],
  [9.1, 45.6],
  [9.05, 45.65],
];

const props = {
  token: "pk.test",
  geometry: GEOMETRY,
  stations: [],
  selectedId: null,
  stopRoute: null,
  onSelectStation: () => {},
  onDeselect: () => {},
  onUnavailable: () => {},
};

const resizeTo = (width: number, height: number) => {
  for (const callback of fake.state.observerCallbacks) callback([{ contentRect: { width, height } }]);
};

beforeEach(() => {
  localStorage.clear();
  resetMapStyleMemory();
  fake.state.maps.length = 0;
  fake.state.boundsPoints.length = 0;
  fake.state.pinElements.length = 0;
  fake.state.observerCallbacks.length = 0;
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback: (entries: Array<{ contentRect: { width: number; height: number } }>) => void) {
        fake.state.observerCallbacks.push(callback);
      }
      observe() {}
      disconnect() {}
      unobserve() {}
    },
  );
});
afterEach(() => vi.unstubAllGlobals());

describe("MapCanvas — ritorno da nascosto (dettaglio stazione → Risultati)", () => {
  it("alla prima dimensione nota inquadra il percorso", () => {
    render(<MapCanvas {...props} />);
    const map = fake.state.maps[0]!;
    map.fitBounds.mockClear();
    map.resize.mockClear();

    resizeTo(400, 300);
    expect(map.resize).toHaveBeenCalledTimes(1);
    expect(map.fitBounds).toHaveBeenCalledTimes(1);
  });

  it("quando il contenitore torna visibile chiama resize() e riapplica fitBounds sui bounds del percorso", () => {
    render(<MapCanvas {...props} />);
    const map = fake.state.maps[0]!;
    resizeTo(400, 300); // prima visibilità
    map.resize.mockClear();
    map.fitBounds.mockClear();

    resizeTo(0, 0); // Risultati nascosti dietro il dettaglio stazione (display: none)
    expect(map.fitBounds).not.toHaveBeenCalled();
    expect(map.resize).not.toHaveBeenCalled(); // nessun resize su un contenitore di dimensione 0

    resizeTo(412, 640); // ritorno a /results
    expect(map.resize).toHaveBeenCalledTimes(1);
    expect(map.fitBounds).toHaveBeenCalledTimes(1);

    const [bounds, options] = map.fitBounds.mock.calls[0]!;
    expect(bounds.points).toEqual(GEOMETRY); // bounds costruiti su tutti i punti del percorso
    expect(options).toMatchObject({ duration: 0, maxZoom: 15, padding: expect.objectContaining({ top: expect.any(Number) }) });
  });

  it("vale a ogni ritorno, non solo il primo", () => {
    render(<MapCanvas {...props} />);
    const map = fake.state.maps[0]!;
    resizeTo(400, 300);
    map.fitBounds.mockClear();

    for (let i = 0; i < 3; i++) {
      resizeTo(0, 0);
      resizeTo(400, 300);
    }
    expect(map.fitBounds).toHaveBeenCalledTimes(3);
  });

  it("un semplice ridimensionamento a contenitore visibile fa resize() ma non reinquadra (niente salti di mappa)", () => {
    render(<MapCanvas {...props} />);
    const map = fake.state.maps[0]!;
    resizeTo(400, 300);
    map.resize.mockClear();
    map.fitBounds.mockClear();

    resizeTo(400, 260); // es. foglio espanso: la mappa si accorcia
    expect(map.resize).toHaveBeenCalledTimes(1);
    expect(map.fitBounds).not.toHaveBeenCalled();
  });

  it("usa il percorso più recente (nuova ricerca mentre i Risultati erano nascosti)", () => {
    const { rerender } = render(<MapCanvas {...props} />);
    const map = fake.state.maps[0]!;
    resizeTo(400, 300);
    resizeTo(0, 0);
    const next: Array<[number, number]> = [
      [11.0, 44.0],
      [12.0, 45.0],
    ];
    rerender(<MapCanvas {...props} geometry={next} />);
    map.fitBounds.mockClear();
    fake.state.boundsPoints.length = 0;

    resizeTo(400, 300);
    expect(map.fitBounds).toHaveBeenCalledTimes(1);
    expect(map.fitBounds.mock.calls[0]![0].points).toEqual(next);
  });
});

describe("MapCanvas — logo della bandiera accanto al prezzo", () => {
  const station = { id: 1, lon: 9.1, lat: 45.6, priceLabel: "€1,689", ariaLabel: "Alfa, Benzina Self, 1,689 euro al litro", best: false };
  const pill = () => fake.state.pinElements[0]!.firstElementChild as HTMLElement;

  it("con logoUrl: tessera bianca da 18 px con il logo a 16 px (alt vuoto, decorativo) PRIMA del prezzo; il prezzo resta nel testo", () => {
    render(<MapCanvas {...props} stations={[{ ...station, logoUrl: "/brands/1.png" }]} />);
    const tile = pill().querySelector('[data-testid="pin-logo"]') as HTMLElement;
    expect(tile).not.toBeNull();
    expect(tile).toHaveClass("w-[18px]", "h-[18px]", "bg-surface-container-lowest", "shrink-0");
    expect(tile).toHaveAttribute("aria-hidden", "true");
    const img = tile.querySelector("img")!;
    expect(img.getAttribute("src")).toBe("/brands/1.png");
    expect(img.getAttribute("alt")).toBe("");
    expect([img.width, img.height]).toEqual([16, 16]); // dimensioni esplicite: la pill non si allarga mentre il file arriva
    expect(img).toHaveClass("object-contain");
    expect(pill().lastElementChild!.textContent).toBe("€1,689");
    expect(tile.nextElementSibling).toBe(pill().lastElementChild);
  });

  it("senza logo (null o assente): nessuna tessera, come prima", () => {
    render(<MapCanvas {...props} stations={[{ ...station, logoUrl: null }]} />);
    expect(pill().querySelector('[data-testid="pin-logo"]')).toBeNull();
    expect(pill().children).toHaveLength(1);
  });

  it("la pill «migliore» (verde): l'icona di verifica, poi il logo su tessera bianca (leggibile sul verde), poi il prezzo", () => {
    render(<MapCanvas {...props} stations={[{ ...station, best: true, logoUrl: "/brands/6.png" }]} />);
    const kids = [...pill().children];
    expect(kids[0]!.tagName.toLowerCase()).toBe("svg");
    expect(kids[1]).toHaveAttribute("data-testid", "pin-logo");
    expect(kids[2]!.textContent).toBe("€1,689");
  });

  it("se il file non si carica la tessera sparisce e resta il solo prezzo", () => {
    render(<MapCanvas {...props} stations={[{ ...station, logoUrl: "/brands/999.png" }]} />);
    pill().querySelector("img")!.dispatchEvent(new Event("error"));
    expect(pill().querySelector('[data-testid="pin-logo"]')).toBeNull();
    expect(pill().textContent).toBe("€1,689");
  });

  it("nessun indirizzo esterno: l'immagine è sempre un file dell'app (/brands/…)", () => {
    render(<MapCanvas {...props} stations={[{ ...station, logoUrl: "/brands/1.png" }]} />);
    expect(pill().querySelector("img")!.getAttribute("src")).toMatch(/^\/brands\/\d+\.png$/);
  });
});

describe("MapCanvas — tema della mappa", () => {
  const ROUTE_SOURCES = 2;
  const ROUTE_LAYERS = 6;
  const failure = (status: number, url: string) => ({ error: { status, url } });

  it("senza una scelta salvata parte con Light; con una scelta salvata parte con quella", () => {
    render(<MapCanvas {...props} />);
    expect(fake.state.maps[0]!.options.style).toBe(MAP_STYLES.light.mapboxUrl);

    localStorage.setItem("tappafurba.mapStyle", "stradale");
    render(<MapCanvas {...props} />);
    expect(fake.state.maps[1]!.options.style).toBe(MAP_STYLES.stradale.mapboxUrl);
  });

  it("uno stile salvato non valido ripiega su Light", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    localStorage.setItem("tappafurba.mapStyle", "satellite");
    render(<MapCanvas {...props} />);
    expect(fake.state.maps[0]!.options.style).toBe(MAP_STYLES.light.mapboxUrl);
  });

  it("al primo caricamento aggiunge la rotta in un'unica esecuzione (2 sorgenti, 6 livelli): lo style.load iniziale non la duplica", () => {
    render(<MapCanvas {...props} />);
    const map = fake.state.maps[0]!;
    map.handlers["style.load"]!(); // arriva prima di «load»: la rotta non c'è ancora da ricreare
    expect(map.addSource).not.toHaveBeenCalled();
    map.handlers.load!();
    expect(map.addSource).toHaveBeenCalledTimes(ROUTE_SOURCES);
    expect(map.addLayer).toHaveBeenCalledTimes(ROUTE_LAYERS);
    expect(map.addLayer.mock.calls.map(([layer]) => layer.id)).toEqual([
      "route-glow",
      "route-casing",
      "route-line",
      "route-direction",
      "stop-route-casing",
      "stop-route-line",
    ]);
  });

  it("«map-style-changed»: setStyle con l'URL del nuovo stile; la rotta si ricrea al nuovo style.load", () => {
    render(<MapCanvas {...props} />);
    const map = fake.state.maps[0]!;
    map.handlers.load!();
    map.addSource.mockClear();
    map.addLayer.mockClear();

    setMapStyle("duotono");
    expect(map.setStyle).toHaveBeenCalledTimes(1);
    expect(map.setStyle).toHaveBeenCalledWith(MAP_STYLES.duotono.mapboxUrl);
    expect(map.addLayer).not.toHaveBeenCalled(); // finché lo stile nuovo non è caricato

    map.handlers["style.load"]!();
    expect(map.addSource).toHaveBeenCalledTimes(ROUTE_SOURCES);
    expect(map.addLayer).toHaveBeenCalledTimes(ROUTE_LAYERS);
  });

  it("lo stesso stile due volte (o quello già in uso) non ricarica la mappa", () => {
    render(<MapCanvas {...props} />);
    const map = fake.state.maps[0]!;
    window.dispatchEvent(new CustomEvent(MAP_STYLE_CHANGED_EVENT, { detail: { styleId: "light" } }));
    expect(map.setStyle).not.toHaveBeenCalled();
    setMapStyle("stradale");
    window.dispatchEvent(new CustomEvent(MAP_STYLE_CHANGED_EVENT, { detail: { styleId: "stradale" } }));
    expect(map.setStyle).toHaveBeenCalledTimes(1);
  });

  it("un evento senza detail non fa nulla; con un id sconosciuto ripiega su Light (con un warning)", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    render(<MapCanvas {...props} />);
    const map = fake.state.maps[0]!;
    setMapStyle("monochrome");
    map.setStyle.mockClear();

    window.dispatchEvent(new CustomEvent(MAP_STYLE_CHANGED_EVENT));
    expect(map.setStyle).not.toHaveBeenCalled();
    window.dispatchEvent(new CustomEvent(MAP_STYLE_CHANGED_EVENT, { detail: { styleId: "satellite" } }));
    expect(map.setStyle).toHaveBeenCalledWith(MAP_STYLES.light.mapboxUrl);
    expect(warn).toHaveBeenCalled();
  });

  it("allo smontaggio non ascolta più l'evento", () => {
    const { unmount } = render(<MapCanvas {...props} />);
    const map = fake.state.maps[0]!;
    unmount();
    setMapStyle("duotono");
    expect(map.setStyle).not.toHaveBeenCalled();
  });

  it("se lo stile scelto non si carica (404 sulla richiesta dello stile) ripiega su Light con un warning, senza «mappa non disponibile»", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const onUnavailable = vi.fn();
    localStorage.setItem("tappafurba.mapStyle", "duotono");
    render(<MapCanvas {...props} onUnavailable={onUnavailable} />);
    const map = fake.state.maps[0]!;

    map.handlers.error!(failure(404, "https://api.mapbox.com/styles/v1/didymond/cmuy7r1n0000601s79cnsfxpl?access_token=pk.x"));
    expect(map.setStyle).toHaveBeenCalledWith(MAP_STYLES.light.mapboxUrl);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(onUnavailable).not.toHaveBeenCalled();
  });

  it("anche con 401/403 sulla richiesta dello stile scelto si ripiega su Light; se è Light a fallire resta il messaggio sul token", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const onUnavailable = vi.fn();
    localStorage.setItem("tappafurba.mapStyle", "stradale");
    render(<MapCanvas {...props} onUnavailable={onUnavailable} />);
    const map = fake.state.maps[0]!;
    map.handlers.error!(failure(403, "https://api.mapbox.com/styles/v1/didymond/x"));
    expect(map.setStyle).toHaveBeenCalledWith(MAP_STYLES.light.mapboxUrl);
    expect(onUnavailable).not.toHaveBeenCalled();

    // Ora lo stile in uso è Light: un 403 sulla sua richiesta vuol dire token non valido.
    map.handlers.error!(failure(403, "https://api.mapbox.com/styles/v1/didymond/cmuyf14qc01aq01saegvu6owk"));
    expect(map.setStyle).toHaveBeenCalledTimes(1);
    expect(onUnavailable).toHaveBeenCalledTimes(1);
  });

  it("401/403 su una richiesta che non è dello stile (tile, font…) resta «token non valido»; un 404 qualunque non fa nulla", () => {
    const onUnavailable = vi.fn();
    localStorage.setItem("tappafurba.mapStyle", "monochrome");
    render(<MapCanvas {...props} onUnavailable={onUnavailable} />);
    const map = fake.state.maps[0]!;
    map.handlers.error!(failure(404, "https://api.mapbox.com/v4/mapbox.mapbox-streets-v8/10/1/1.vector.pbf"));
    expect(onUnavailable).not.toHaveBeenCalled();
    map.handlers.error!(failure(401, "https://api.mapbox.com/v4/mapbox.mapbox-streets-v8/10/1/1.vector.pbf"));
    expect(onUnavailable).toHaveBeenCalledTimes(1);
    expect(map.setStyle).not.toHaveBeenCalled();
  });
});

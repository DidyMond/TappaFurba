import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_MAP_STYLE,
  getSelectedMapStyle,
  MAP_LANGUAGE,
  MAP_STYLE_CHANGED_EVENT,
  MAP_STYLE_KEY,
  MAP_STYLE_ORDER,
  MAP_STYLES,
  resetMapStyleMemory,
  resolveMapStyle,
  setMapStyle,
  type MapStyleChangedDetail,
} from "./mapStyle";

beforeEach(() => {
  localStorage.clear();
  resetMapStyleMemory();
});
afterEach(() => vi.restoreAllMocks());

/** Registra gli eventi `map-style-changed` finché non si chiama `stop`. */
function listen() {
  const received: MapStyleChangedDetail[] = [];
  const handler = (event: Event) => received.push((event as CustomEvent<MapStyleChangedDetail>).detail);
  window.addEventListener(MAP_STYLE_CHANGED_EVENT, handler);
  return { received, stop: () => window.removeEventListener(MAP_STYLE_CHANGED_EVENT, handler) };
}

describe("MAP_STYLES", () => {
  it("quattro stili con id uguale alla chiave, URL mapbox://styles/utente/id e anteprima in /styles", () => {
    expect(Object.keys(MAP_STYLES).sort()).toEqual(["duotono", "light", "monochrome", "stradale"]);
    for (const [key, style] of Object.entries(MAP_STYLES)) {
      expect(style.id).toBe(key);
      expect(style.mapboxUrl).toMatch(/^mapbox:\/\/styles\/[\w.-]+\/[\w.-]+$/);
      expect(style.preview).toBe(`/styles/preview-${key}.jpg`);
      expect(style.name.length).toBeGreaterThan(0);
      expect(style.description.length).toBeGreaterThan(0);
    }
  });

  it("gli URL sono tutti diversi; il predefinito è Light e l'ordine del selettore li elenca tutti, Light per primo", () => {
    expect(new Set(Object.values(MAP_STYLES).map((s) => s.mapboxUrl)).size).toBe(4);
    expect(DEFAULT_MAP_STYLE).toBe("light");
    expect(MAP_STYLE_ORDER[0]).toBe("light");
    expect([...MAP_STYLE_ORDER].sort()).toEqual(Object.keys(MAP_STYLES).sort());
  });

  it("le anteprime esistono in public/styles: un JPEG 400×240 leggero per stile", () => {
    for (const style of Object.values(MAP_STYLES)) {
      const file = join(__dirname, "../../public", style.preview);
      expect(existsSync(file), file).toBe(true);
      const jpeg = readFileSync(file);
      expect(jpeg.length).toBeLessThan(60_000);
      expect([jpeg[0], jpeg[1]]).toEqual([0xff, 0xd8]); // è davvero un JPEG
      // dimensioni dal marcatore SOF0/SOF2: 400×240 (ratio 5:3 come l'aspect-[5/3] della card)
      let offset = 2;
      let size: [number, number] | null = null;
      while (offset < jpeg.length) {
        const marker = jpeg[offset + 1]!;
        if (marker === 0xc0 || marker === 0xc2) {
          size = [jpeg.readUInt16BE(offset + 7), jpeg.readUInt16BE(offset + 5)];
          break;
        }
        offset += 2 + jpeg.readUInt16BE(offset + 2);
      }
      expect(size, file).toEqual([400, 240]);
    }
  });

  it("le etichette restano in italiano", () => {
    expect(MAP_LANGUAGE).toBe("it");
  });
});

describe("getSelectedMapStyle", () => {
  it("senza una scelta salvata vale Light", () => {
    expect(getSelectedMapStyle()).toBe("light");
  });

  it("legge lo stile salvato in tappafurba.mapStyle", () => {
    expect(MAP_STYLE_KEY).toBe("tappafurba.mapStyle");
    for (const id of ["light", "duotono", "stradale", "monochrome"] as const) {
      localStorage.setItem("tappafurba.mapStyle", id);
      expect(getSelectedMapStyle()).toBe(id);
    }
  });

  it("un valore sconosciuto o danneggiato vale Light (anche le chiavi di Object come «constructor»)", () => {
    for (const bad of ["", "satellite", "{\"id\":\"light\"}", "constructor", "__proto__", "toString"]) {
      localStorage.setItem("tappafurba.mapStyle", bad);
      expect(getSelectedMapStyle()).toBe("light");
    }
  });

  it("con lo storage bloccato non lancia: vale Light, o l'ultima scelta fatta in questa sessione", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("storage bloccato");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("storage bloccato");
    });
    expect(getSelectedMapStyle()).toBe("light");
    expect(() => setMapStyle("duotono")).not.toThrow();
    expect(getSelectedMapStyle()).toBe("duotono");
  });
});

describe("setMapStyle", () => {
  it("salva la scelta e la rilegge", () => {
    setMapStyle("stradale");
    expect(localStorage.getItem("tappafurba.mapStyle")).toBe("stradale");
    expect(getSelectedMapStyle()).toBe("stradale");
  });

  it("emette «map-style-changed» con detail { styleId } quando lo stile cambia", () => {
    const events = listen();
    setMapStyle("monochrome");
    setMapStyle("duotono");
    events.stop();
    expect(events.received).toEqual([{ styleId: "monochrome" }, { styleId: "duotono" }]);
  });

  it("non emette nulla se lo stile è già quello in vigore (compreso Light, il predefinito)", () => {
    const events = listen();
    setMapStyle("light");
    setMapStyle("stradale");
    setMapStyle("stradale");
    events.stop();
    expect(events.received).toEqual([{ styleId: "stradale" }]);
  });

  it("un id sconosciuto non si salva e non emette", () => {
    const events = listen();
    setMapStyle("satellite" as never);
    events.stop();
    expect(events.received).toEqual([]);
    expect(localStorage.getItem("tappafurba.mapStyle")).toBeNull();
  });
});

describe("resolveMapStyle", () => {
  it("dà id e URL dello stile richiesto", () => {
    expect(resolveMapStyle("duotono")).toEqual({ id: "duotono", url: MAP_STYLES.duotono.mapboxUrl });
    expect(resolveMapStyle("light")).toEqual({ id: "light", url: MAP_STYLES.light.mapboxUrl });
  });

  it("un id sconosciuto ripiega su Light e lo dice con un warning", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(resolveMapStyle("satellite")).toEqual({ id: "light", url: MAP_STYLES.light.mapboxUrl });
    expect(resolveMapStyle(undefined).id).toBe("light");
    expect(resolveMapStyle("constructor").id).toBe("light");
    expect(warn).toHaveBeenCalledTimes(3);
  });

  it("un mapboxUrl non valido ripiega su Light con un warning: a Mapbox non si passano mai URL arbitrari", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const style = MAP_STYLES.stradale as { mapboxUrl: string };
    const original = style.mapboxUrl;
    try {
      for (const bad of ["https://evil.example/style.json", "mapbox://styles/solo-utente", "javascript:alert(1)", "mapbox://styles/a/b/c"]) {
        style.mapboxUrl = bad;
        expect(resolveMapStyle("stradale")).toEqual({ id: "light", url: MAP_STYLES.light.mapboxUrl });
      }
    } finally {
      style.mapboxUrl = original;
    }
    expect(warn).toHaveBeenCalledTimes(4);
  });
});

import { describe, expect, it } from "vitest";
import {
  computeSheetBounds,
  nearestSnap,
  nextTapSnap,
  rubberBandHeight,
  SHEET_EXPANDED_RATIO,
  SHEET_HANDLE_ZONE_PX,
  SHEET_OVERLAP_PX,
  SHEET_RUBBER_MAX_PX,
  snapHeight,
} from "./sheetSnap";

// iPhone 12/13: schermo 844 px, header 72 px → regione dei Risultati 772 px; barra inferiore: 16 px dal fondo + 62 di altezza = 78.
const CONTAINER = 772;
const VIEWPORT = 844;
const NAV = 78;
const layout = computeSheetBounds(CONTAINER, VIEWPORT, NAV)!;

describe("computeSheetBounds — tre punti di aggancio", () => {
  it("chiuso = dov'era prima (sotto la mappa al 40%, con la sovrapposizione della testata) ma fino al fondo dello schermo", () => {
    expect(layout.mapBase).toBe(Math.round(VIEWPORT * 0.4)); // 338
    expect(layout.collapsed).toBe(CONTAINER - layout.mapBase + SHEET_OVERLAP_PX); // 446
  });

  it("espanso = ~85% dello schermo, MAI il 100%: mappa e header restano visibili", () => {
    expect(layout.expanded).toBe(Math.round(VIEWPORT * SHEET_EXPANDED_RATIO)); // 717
    expect(layout.expanded).toBeLessThan(CONTAINER);
    expect(layout.expanded / VIEWPORT).toBeLessThan(0.9);
  });

  it("ridotto = zona maniglia (28 px) + ingombro della barra: il foglio sta tutto dietro la barra tranne la maniglia", () => {
    expect(layout.minimized).toBe(SHEET_HANDLE_ZONE_PX + NAV); // 106
    expect(layout.minimized).toBeLessThan(layout.collapsed);
  });

  it("l'ordine è sempre ridotto < chiuso < espanso, anche su schermi bassi", () => {
    for (const [container, viewport, nav] of [[772, 844, 78], [380, 460, 78], [300, 360, 78], [772, 844, 0]] as const) {
      const l = computeSheetBounds(container, viewport, nav)!;
      expect(l.minimized, `${container}/${viewport}`).toBeLessThanOrEqual(l.collapsed);
      expect(l.collapsed, `${container}/${viewport}`).toBeLessThanOrEqual(l.expanded);
      expect(l.expanded).toBeLessThanOrEqual(container);
    }
  });

  it("la mappa da ridotto occupa tutto lo spazio fino al foglio (meno la sovrapposizione); altrimenti il 40%", () => {
    expect(layout.mapTall).toBe(CONTAINER - layout.minimized + SHEET_OVERLAP_PX); // 678
    expect(layout.mapTall).toBeGreaterThan(layout.mapBase);
    expect(layout.mapTall).toBeLessThanOrEqual(CONTAINER);
  });

  it("senza ingombro della barra (non misurato) il ridotto è la sola zona maniglia", () => {
    expect(computeSheetBounds(CONTAINER, VIEWPORT)!.minimized).toBe(SHEET_HANDLE_ZONE_PX);
  });

  it("layout non misurabile (regione nascosta, jsdom): nessun punto, si usa il valore di ripiego in CSS", () => {
    expect(computeSheetBounds(0, 844, NAV)).toBeNull();
    expect(computeSheetBounds(772, 0, NAV)).toBeNull();
  });
});

describe("rubberBandHeight — effetto elastico ai bordi", () => {
  it("tra ridotto ed espanso il foglio segue il dito alla lettera", () => {
    for (const h of [layout.minimized, 200, layout.collapsed, 600, layout.expanded]) expect(rubberBandHeight(h, layout, CONTAINER)).toBe(h);
  });

  it("oltre l'espanso segue sempre meno e non raggiunge mai l'altezza della regione (header e mappa restano visibili)", () => {
    const a = rubberBandHeight(layout.expanded + 10, layout, CONTAINER);
    const b = rubberBandHeight(layout.expanded + 100, layout, CONTAINER);
    const c = rubberBandHeight(layout.expanded + 5000, layout, CONTAINER);
    expect(a).toBeGreaterThan(layout.expanded);
    expect(a - layout.expanded).toBeLessThan(10); // resistenza già al primo pixel
    expect(b).toBeGreaterThan(a);
    expect(c).toBeGreaterThan(b);
    expect(c - layout.expanded).toBeLessThan(SHEET_RUBBER_MAX_PX);
    expect(c).toBeLessThan(CONTAINER);
  });

  it("sotto il ridotto lo stesso, verso il basso (il chiuso non è più un bordo)", () => {
    const a = rubberBandHeight(layout.minimized - 10, layout, CONTAINER);
    const c = rubberBandHeight(layout.minimized - 5000, layout, CONTAINER);
    expect(a).toBeLessThan(layout.minimized);
    expect(layout.minimized - a).toBeLessThan(10);
    expect(layout.minimized - c).toBeLessThan(SHEET_RUBBER_MAX_PX);
    expect(rubberBandHeight(layout.collapsed - 50, layout, CONTAINER)).toBe(layout.collapsed - 50);
  });

  it("se sopra l'espanso resta poco spazio, l'elasticità si riduce di conseguenza", () => {
    const tight = { minimized: 106, collapsed: 300, expanded: 370 };
    expect(rubberBandHeight(5000, tight, 380)).toBeLessThan(380);
  });
});

describe("nearestSnap — punto più vicino tra i tre", () => {
  it("al rilascio si aggancia al più vicino", () => {
    expect(nearestSnap(layout.minimized + 20, layout)).toBe("minimized");
    expect(nearestSnap(layout.collapsed - 20, layout)).toBe("collapsed");
    expect(nearestSnap(layout.collapsed + 20, layout)).toBe("collapsed");
    expect(nearestSnap(layout.expanded - 20, layout)).toBe("expanded");
    expect(nearestSnap(0, layout)).toBe("minimized");
    expect(nearestSnap(5000, layout)).toBe("expanded");
  });

  it("a metà esatta vince «chiuso», il punto di riposo (sia verso il ridotto sia verso l'espanso)", () => {
    expect(nearestSnap((layout.minimized + layout.collapsed) / 2, layout)).toBe("collapsed");
    expect(nearestSnap((layout.collapsed + layout.expanded) / 2, layout)).toBe("collapsed");
    expect(nearestSnap((layout.minimized + layout.collapsed) / 2 - 1, layout)).toBe("minimized");
    expect(nearestSnap((layout.collapsed + layout.expanded) / 2 + 1, layout)).toBe("expanded");
  });

  it("snapHeight dà l'altezza del punto", () => {
    expect(snapHeight("minimized", layout)).toBe(layout.minimized);
    expect(snapHeight("collapsed", layout)).toBe(layout.collapsed);
    expect(snapHeight("expanded", layout)).toBe(layout.expanded);
  });
});

describe("nextTapSnap — il tocco non riduce mai", () => {
  it("ridotto → chiuso, chiuso → espanso, espanso → chiuso", () => {
    expect(nextTapSnap("minimized")).toBe("collapsed");
    expect(nextTapSnap("collapsed")).toBe("expanded");
    expect(nextTapSnap("expanded")).toBe("collapsed");
  });

  it("applicato a catena non raggiunge mai «ridotto»", () => {
    let snap = nextTapSnap("minimized");
    for (let i = 0; i < 20; i++) {
      expect(snap).not.toBe("minimized");
      snap = nextTapSnap(snap);
    }
  });
});

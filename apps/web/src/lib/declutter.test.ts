import { describe, expect, it } from "vitest";
import { pickVisibleMarkers } from "./declutter";

const size = { width: 70, height: 28, gap: 4 };

describe("pickVisibleMarkers", () => {
  it("marker lontani restano tutti visibili", () => {
    const visible = pickVisibleMarkers(
      [
        { id: 1, x: 50, y: 100 },
        { id: 2, x: 250, y: 100 },
        { id: 3, x: 50, y: 200 },
      ],
      size,
    );
    expect([...visible].sort()).toEqual([1, 2, 3]);
  });

  it("tra due marker sovrapposti vince quello con priorità più alta (il primo)", () => {
    const visible = pickVisibleMarkers(
      [
        { id: 7, x: 100, y: 100 },
        { id: 8, x: 110, y: 105 },
      ],
      size,
    );
    expect([...visible]).toEqual([7]);
    expect(pickVisibleMarkers([{ id: 8, x: 110, y: 105 }, { id: 7, x: 100, y: 100 }], size).has(8)).toBe(true);
  });

  it("un marker sovrapposto a uno già scartato ma non a uno tenuto resta visibile", () => {
    const visible = pickVisibleMarkers(
      [
        { id: 1, x: 100, y: 100 },
        { id: 2, x: 130, y: 100 }, // scartato: tocca 1
        { id: 3, x: 175, y: 100 }, // libero: dista 75 da 1, oltre l'ingombro
      ],
      size,
    );
    expect([...visible].sort()).toEqual([1, 3]);
  });

  it("stessa x ma abbastanza distanti in verticale non si sovrappongono", () => {
    const visible = pickVisibleMarkers(
      [
        { id: 1, x: 100, y: 100 },
        { id: 2, x: 100, y: 140 },
      ],
      size,
    );
    expect(visible.size).toBe(2);
  });

  it("ignora i marker fuori dall'area visibile", () => {
    const visible = pickVisibleMarkers(
      [
        { id: 1, x: -500, y: 100 },
        { id: 2, x: 100, y: 100 },
        { id: 3, x: 100, y: 900 },
      ],
      { ...size, viewport: { width: 400, height: 300 } },
    );
    expect([...visible]).toEqual([2]);
  });

  it("lista vuota → nessun marker", () => {
    expect(pickVisibleMarkers([], size).size).toBe(0);
  });
});

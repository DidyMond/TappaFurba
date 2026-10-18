import { describe, expect, it } from "vitest";
import { selectStationPrice, type StationPriceOption } from "../src/pricing/selectStationPrice";

const self = (price: number, communicatedAt = "2026-09-25T10:00:00.000Z"): StationPriceOption => ({
  isSelf: true,
  price,
  communicatedAt,
});
const servito = (price: number, communicatedAt = "2026-09-25T10:00:00.000Z"): StationPriceOption => ({
  isSelf: false,
  price,
  communicatedAt,
});

describe("selectStationPrice — 'Solo Self' attivo (default)", () => {
  it("usa il prezzo Self quando presente", () => {
    expect(selectStationPrice([self(1.7), servito(1.9)], { onlySelf: true })).toEqual({
      price: 1.7,
      isSelf: true,
      servitoOnly: false,
      communicatedAt: "2026-09-25T10:00:00.000Z",
    });
  });

  it("esclude la stazione che ha solo il Servito", () => {
    expect(selectStationPrice([servito(1.9)], { onlySelf: true })).toBeNull();
  });

  it("esclude la stazione senza alcun prezzo", () => {
    expect(selectStationPrice([], { onlySelf: true })).toBeNull();
  });
});

describe("selectStationPrice — 'Solo Self' disattivato", () => {
  it("preferisce comunque il Self quando la stazione ha entrambi (mai una media)", () => {
    const result = selectStationPrice([servito(1.9), self(1.7)], { onlySelf: false });
    expect(result?.price).toBe(1.7);
    expect(result?.isSelf).toBe(true);
    expect(result?.servitoOnly).toBe(false);
  });

  it("include la stazione solo-Servito con il flag servitoOnly per il badge", () => {
    const result = selectStationPrice([servito(1.95)], { onlySelf: false });
    expect(result).toEqual({
      price: 1.95,
      isSelf: false,
      servitoOnly: true,
      communicatedAt: "2026-09-25T10:00:00.000Z",
    });
  });

  it("esclude la stazione senza alcun prezzo", () => {
    expect(selectStationPrice([], { onlySelf: false })).toBeNull();
  });
});

describe("selectStationPrice — robustezza", () => {
  it("con più prezzi Self sceglie il più basso", () => {
    expect(selectStationPrice([self(1.75), self(1.7), self(1.8)], { onlySelf: true })?.price).toBe(1.7);
  });

  it("con più prezzi Servito (solo Servito) sceglie il più basso", () => {
    expect(selectStationPrice([servito(2.0), servito(1.9)], { onlySelf: false })?.price).toBe(1.9);
  });

  it("propaga la data di comunicazione del prezzo effettivamente scelto", () => {
    const result = selectStationPrice(
      [self(1.7, "2026-09-26T08:00:00.000Z"), servito(1.9, "2026-09-20T08:00:00.000Z")],
      { onlySelf: false },
    );
    expect(result?.communicatedAt).toBe("2026-09-26T08:00:00.000Z");
  });

  it("non modifica l'array in ingresso", () => {
    const options = [servito(1.9), self(1.7)];
    const snapshot = JSON.stringify(options);
    selectStationPrice(options, { onlySelf: false });
    expect(JSON.stringify(options)).toBe(snapshot);
  });
});

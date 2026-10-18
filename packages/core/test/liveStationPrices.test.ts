import { describe, expect, it } from "vitest";
import { liveStationToFuelPrices } from "../src";

// Stazione reale 62820 come restituita dal sito il 28/09/2026 (prezzi ridotti a quelli rilevanti).
const station = {
  stationId: 62820,
  communicatedAt: "2026-09-28T11:11:43+02:00",
  fuels: [
    { name: "Benzina", price: 2.2, isSelf: false },
    { name: "Benzina", price: 1.99, isSelf: true },
    { name: "Gasolio", price: 2.4, isSelf: false },
    { name: "Gasolio", price: 2.19, isSelf: true },
    { name: "Blue Diesel", price: 2.5, isSelf: false },
    { name: "Blue Diesel", price: 2.29, isSelf: true },
    { name: "HVOlution", price: 2.4, isSelf: false },
  ],
};

describe("liveStationToFuelPrices", () => {
  it("normalizza i carburanti come il CSV e converte la data in UTC", () => {
    const prices = liveStationToFuelPrices(station);
    const benzinaSelf = prices.find((p) => p.fuelType === "benzina" && p.isSelf);
    expect(benzinaSelf).toMatchObject({ stationId: 62820, price: 1.99, rawDescCarburante: "Benzina" });
    expect(benzinaSelf?.communicatedAt).toBe("2026-09-28T09:11:43.000Z");
    expect(prices.some((p) => p.fuelType === "hvo")).toBe(true);
  });

  it("riduce le varianti dello stesso tipo al prezzo più basso (Gasolio vs Blue Diesel → diesel)", () => {
    const diesel = liveStationToFuelPrices(station).filter((p) => p.fuelType === "diesel");
    expect(diesel).toHaveLength(2); // uno Self, uno Servito
    expect(diesel.find((p) => p.isSelf)?.price).toBe(2.19);
    expect(diesel.find((p) => !p.isSelf)?.price).toBe(2.4);
  });

  it("scarta prezzi non plausibili", () => {
    const prices = liveStationToFuelPrices({ ...station, fuels: [{ name: "Benzina", price: 19.9, isSelf: true }, { name: "Gasolio", price: 0, isSelf: true }] });
    expect(prices).toEqual([]);
  });

  it("ignora il segnaposto 1.000 su 'Blue Super' e usa la Benzina normale (caso reale, stazione 3473)", () => {
    const prices = liveStationToFuelPrices({
      stationId: 3473,
      communicatedAt: "2026-09-28T10:05:37+02:00",
      fuels: [
        { name: "Benzina", price: 2.199, isSelf: true },
        { name: "Blue Super", price: 1.0, isSelf: true },
      ],
    });
    expect(prices).toHaveLength(1);
    expect(prices[0]).toMatchObject({ fuelType: "benzina", price: 2.199, rawDescCarburante: "Benzina" });
  });

  it("data non valida → nessun prezzo (non si inventa una data di comunicazione)", () => {
    expect(liveStationToFuelPrices({ ...station, communicatedAt: "ieri" })).toEqual([]);
  });

  it("nomi di carburante sconosciuti restano 'unknown' con l'etichetta originale conservata", () => {
    const [price] = liveStationToFuelPrices({ ...station, fuels: [{ name: "Carburante Misterioso", price: 1.5, isSelf: true }] });
    expect(price).toMatchObject({ fuelType: "unknown", rawDescCarburante: "Carburante Misterioso" });
  });
});

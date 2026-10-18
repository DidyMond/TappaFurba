import { describe, expect, it } from "vitest";
import { makeDivergingResults, makeResult, makeResults, makeTiedDetourResults } from "../test/fixtures";
import { applyFilters, bestStationId, brandInitials, fuelModeLabel, shortPlaceName } from "./stationView";

const ids = (results: ReturnType<typeof makeResults>) => results.map((r) => r.station.id);
const noFilters = { onlySelf: false, motorwayOnly: false };

describe("applyFilters — ordinamento", () => {
  it("«Più conveniente»: risparmio netto decrescente", () => {
    expect(ids(applyFilters(makeResults(), { sort: "savings", ...noFilters }))).toEqual([1, 2, 3]);
  });

  it("«Minor deviazione»: km extra crescenti", () => {
    expect(ids(applyFilters(makeResults(), { sort: "detour", ...noFilters }))).toEqual([2, 3, 1]);
  });

  it("«Minor deviazione»: a pari km, prima la più vicina alla strada, poi l'ordine di incontro, poi il risparmio", () => {
    expect(ids(applyFilters(makeTiedDetourResults(), { sort: "detour", ...noFilters }))).toEqual([24, 23, 22, 21]);
    expect(ids(applyFilters(makeTiedDetourResults(), { sort: "savings", ...noFilters }))).toEqual([24, 21, 23, 22]);
  });

  it("i due ordinamenti possono divergere del tutto: fixture con ordini diversi", () => {
    const results = makeDivergingResults();
    const byMode = (sort: "savings" | "detour") => ids(applyFilters(results, { sort, ...noFilters }));
    expect(byMode("savings")).toEqual([11, 12, 13, 14]);
    expect(byMode("detour")).toEqual([12, 13, 14, 11]);
  });

  it("a parità di criterio decide il risparmio netto", () => {
    const tie = [
      makeResult({ station: { id: 10 }, detourKm: 1, netSavings: 3 }),
      makeResult({ station: { id: 11 }, detourKm: 1, netSavings: 9 }),
    ];
    expect(ids(applyFilters(tie, { sort: "detour", ...noFilters }))).toEqual([11, 10]);
  });

  it("non modifica la lista in ingresso", () => {
    const input = makeResults();
    const before = ids(input);
    applyFilters(input, { sort: "detour", ...noFilters });
    expect(ids(input)).toEqual(before);
  });
});

describe("applyFilters — pill secondarie", () => {
  it("«Solo Self» nasconde le stazioni con solo il servito", () => {
    expect(ids(applyFilters(makeResults(), { sort: "savings", onlySelf: true, motorwayOnly: false }))).toEqual([1, 2]);
  });

  it("«Autostrada» tiene solo Tipo Impianto autostradale", () => {
    expect(ids(applyFilters(makeResults(), { sort: "savings", onlySelf: false, motorwayOnly: true }))).toEqual([1]);
  });

  it("i filtri si combinano", () => {
    expect(applyFilters(makeResults(), { sort: "savings", onlySelf: true, motorwayOnly: true })).toHaveLength(1);
    expect(applyFilters(makeResults().slice(2), { sort: "savings", onlySelf: true, motorwayOnly: false })).toEqual([]);
  });
});

describe("bestStationId", () => {
  it("è la stazione con il maggior risparmio netto tra quelle visibili", () => {
    expect(bestStationId(makeResults())).toBe(1);
    expect(bestStationId(makeResults().slice(1))).toBe(2);
  });

  it("nessuna «Migliore» se nessuna stazione conviene davvero", () => {
    expect(bestStationId([makeResult({ netSavings: 0 }), makeResult({ netSavings: -4 })])).toBeNull();
    expect(bestStationId([])).toBeNull();
  });
});

describe("brandInitials", () => {
  it.each([
    ["Agip Eni", "AE"],
    ["Pompe Bianche", "PB"],
    ["COIL", "CO"],
    ["Q8", "Q8"],
    ["Tamoil", "TA"],
    ["Esso-Express", "EE"],
    ["  ip  ", "IP"],
    ["Api-IP", "AI"],
  ])("%s → %s", (input, expected) => {
    expect(brandInitials(input)).toBe(expected);
  });

  it("usa il gestore se la bandiera è vuota e non esplode senza lettere", () => {
    expect(brandInitials("", "Rossi Carburanti")).toBe("RC");
    expect(brandInitials("", "")).toBe("?");
    expect(brandInitials("---")).toBe("?");
  });
});

describe("shortPlaceName", () => {
  it("estrae la località dall'etichetta del geocoding", () => {
    expect(shortPlaceName("Via Esempio 12, 00000 Città di Prova provincia di Esempio, Italia")).toBe(
      "Città di Prova",
    );
    expect(shortPlaceName("Via Campione 8, 00001 Borgo Campione provincia di Prova, Italia")).toBe("Borgo Campione");
    expect(shortPlaceName("Via Roma 1, 20100 Milano città metropolitana di Milano, Italia")).toBe("Milano");
  });

  it("senza virgole usa l'etichetta intera; il testo vuoto resta vuoto", () => {
    expect(shortPlaceName("Bologna")).toBe("Bologna");
    expect(shortPlaceName("Posizione attuale")).toBe("Posizione attuale");
    expect(shortPlaceName("")).toBe("");
  });

  it("se la seconda parte non ha una località usa la prima", () => {
    expect(shortPlaceName("Via Roma 1, 20100")).toBe("Via Roma 1");
  });
});

describe("fuelModeLabel", () => {
  it("compone carburante e modalità", () => {
    expect(fuelModeLabel("benzina", true)).toBe("Benzina Self");
    expect(fuelModeLabel("diesel", false)).toBe("Diesel Servito");
    expect(fuelModeLabel("gpl", false)).toBe("GPL Servito");
  });
});

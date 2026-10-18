import { describe, expect, it } from "vitest";
import { parseAnagraficaCsv } from "../src/csv/parseAnagrafica";

const sampleCsv = [
  "Estrazione del 2026-09-26",
  "idImpianto|Gestore|Bandiera|Tipo Impianto|Nome Impianto|Indirizzo|Comune|Provincia|Latitudine|Longitudine",
  "59183|ENIMOOV S.P.A.|Agip Eni|Stradale|19829 AGRIGENTO|SS.189 KM. 64+649|AGRIGENTO|AG|37.333935|13.595533",
  "63056|NOBILE S.R.L.|Agip Eni|Autostradale|ENI NOBILE|LEONARDO SCIASCIA SN|AGRIGENTO|AG|37.27127799486728|13.626634005440525",
  "40820|STOIL SIMPLE|Pompe Bianche|Stradale|STOIL SIMPLE | gestori.prezzibenzina.it|STR. PROV.LE 82|ALESSANDRIA|AL|44.91704718250436|8.70067298412323",
  "99999|GESTORE X|Bandiera X|Stradale|NOME X|VIA X|COMUNE X|XX||", // coordinate mancanti
  "88888|GESTORE Y|Bandiera Y|Stradale|NOME Y|VIA Y|COMUNE Y|YY|0|0", // placeholder (0,0)
  "77777|GESTORE Z|Bandiera Z|Stradale|NOME Z|VIA Z|COMUNE Z|ZZ|51.5074|-0.1278", // fuori dai confini italiani
].join("\n");

describe("parseAnagraficaCsv", () => {
  it("salta sia la riga di metadata sia la riga di header", () => {
    const { stations } = parseAnagraficaCsv(sampleCsv);
    expect(stations.every((s) => Number.isFinite(s.id))).toBe(true);
    expect(stations.some((s) => s.gestore === "Gestore")).toBe(false);
  });

  it("estrae correttamente le stazioni valide, incluse quelle Autostradali", () => {
    const { stations } = parseAnagraficaCsv(sampleCsv);
    const ids = stations.map((s) => s.id);

    expect(ids).toContain(59183);
    expect(ids).toContain(63056);
    expect(stations.find((s) => s.id === 63056)?.tipoImpianto).toBe("autostradale");
    expect(stations.find((s) => s.id === 59183)?.tipoImpianto).toBe("stradale");
  });

  it('ricostruisce correttamente la stazione con il bug del "|" nel Nome Impianto', () => {
    const { stations } = parseAnagraficaCsv(sampleCsv);
    const station = stations.find((s) => s.id === 40820);

    expect(station).toBeDefined();
    expect(station?.nomeImpianto).toBe("STOIL SIMPLE gestori.prezzibenzina.it");
    expect(station?.comune).toBe("ALESSANDRIA");
    expect(station?.lat).toBeCloseTo(44.91704718250436);
    expect(station?.lon).toBeCloseTo(8.70067298412323);
  });

  it("esclude stazioni con coordinate mancanti, placeholder (0,0) o fuori dai confini italiani, loggando un warning per ciascuna", () => {
    const { stations, warnings } = parseAnagraficaCsv(sampleCsv);

    expect(stations.some((s) => s.id === 99999)).toBe(false);
    expect(stations.some((s) => s.id === 88888)).toBe(false);
    expect(stations.some((s) => s.id === 77777)).toBe(false);
    expect(warnings.length).toBeGreaterThanOrEqual(3);
  });

  it("restituisce un array vuoto e nessun crash su un CSV con sola intestazione", () => {
    const emptyCsv = ["Estrazione del 2026-09-26", "idImpianto|Gestore|Bandiera|Tipo Impianto|Nome Impianto|Indirizzo|Comune|Provincia|Latitudine|Longitudine"].join(
      "\n",
    );
    const { stations, warnings } = parseAnagraficaCsv(emptyCsv);
    expect(stations).toEqual([]);
    expect(warnings).toEqual([]);
  });
});

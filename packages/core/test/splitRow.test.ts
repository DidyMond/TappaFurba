import { describe, expect, it } from "vitest";
import { splitAnagraficaRow } from "../src/csv/splitRow";

describe("splitAnagraficaRow", () => {
  it("passa attraverso una riga con il numero di campi atteso", () => {
    const line =
      "59183|ENIMOOV S.P.A.|Agip Eni|Stradale|19829 AGRIGENTO|SS.189 KM. 64+649|AGRIGENTO|AG|37.333935|13.595533";

    expect(splitAnagraficaRow(line)).toEqual([
      "59183",
      "ENIMOOV S.P.A.",
      "Agip Eni",
      "Stradale",
      "19829 AGRIGENTO",
      "SS.189 KM. 64+649",
      "AGRIGENTO",
      "AG",
      "37.333935",
      "13.595533",
    ]);
  });

  it('ricostruisce correttamente il Nome Impianto quando contiene un "|" letterale (bug reale osservato)', () => {
    const line =
      "40820|STOIL SIMPLE|Pompe Bianche|Stradale|STOIL SIMPLE | gestori.prezzibenzina.it|STR. PROV.LE 82 SPINETTA SALE  15122|ALESSANDRIA|AL|44.91704718250436|8.70067298412323";

    const result = splitAnagraficaRow(line);

    expect(result).not.toBeNull();
    expect(result).toEqual([
      "40820",
      "STOIL SIMPLE",
      "Pompe Bianche",
      "Stradale",
      "STOIL SIMPLE gestori.prezzibenzina.it",
      "STR. PROV.LE 82 SPINETTA SALE  15122",
      "ALESSANDRIA",
      "AL",
      "44.91704718250436",
      "8.70067298412323",
    ]);
  });

  it("ricostruisce anche il caso con due frammenti aggiuntivi di Nome Impianto", () => {
    const line = "1|G|B|Stradale|NOME|A|B|C|VIA X|COMUNE|PR|45.0|9.0";
    // 13 campi totali: 4 stabili a sinistra + 5 stabili a destra + 4 frammenti nel mezzo.
    const result = splitAnagraficaRow(line);
    expect(result).toEqual(["1", "G", "B", "Stradale", "NOME A B C", "VIA X", "COMUNE", "PR", "45.0", "9.0"]);
  });

  it("restituisce null per una riga con meno campi del previsto (delimitatore mancante)", () => {
    const line = "12345|GESTORE SRL|Stradale|NOME|VIA ROMA 1|COMUNE|PR|45.0|9.0"; // manca Bandiera: 9 campi
    expect(splitAnagraficaRow(line)).toBeNull();
  });
});

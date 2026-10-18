/**
 * Split robusto per le righe di anagrafica_impianti_attivi.csv (MIMIT).
 *
 * Bug reale osservato nel dataset live (verificato settembre 2026): in alcune
 * righe il campo "Nome Impianto" contiene un carattere "|" letterale, es.
 * `STOIL SIMPLE | gestori.prezzibenzina.it`. Uno split posizionale ingenuo
 * (`line.split('|')[8]` per la latitudine) romperebbe l'allineamento di tutti
 * i campi successivi per queste righe.
 *
 * Le colonne attese sono, in ordine:
 * idImpianto | Gestore | Bandiera | Tipo Impianto | Nome Impianto | Indirizzo | Comune | Provincia | Latitudine | Longitudine
 *
 * I primi 4 campi e gli ultimi 5 sono stabili (mai osservato un "|" al loro
 * interno): qualunque frammento residuo nel mezzo appartiene a "Nome Impianto"
 * e viene ricongiunto con uno spazio.
 */

const EXPECTED_FIELDS = 10;
const LEFT_STABLE_FIELDS = 4; // idImpianto, Gestore, Bandiera, Tipo Impianto
const RIGHT_STABLE_FIELDS = 5; // Indirizzo, Comune, Provincia, Latitudine, Longitudine

export function splitAnagraficaRow(line: string): string[] | null {
  const fields = line.split("|");

  if (fields.length === EXPECTED_FIELDS) {
    return fields;
  }

  if (fields.length > EXPECTED_FIELDS) {
    const left = fields.slice(0, LEFT_STABLE_FIELDS);
    const right = fields.slice(fields.length - RIGHT_STABLE_FIELDS);
    const middleFragments = fields.slice(LEFT_STABLE_FIELDS, fields.length - RIGHT_STABLE_FIELDS);
    const nomeImpianto = middleFragments.join(" ").replace(/\s+/g, " ").trim();
    return [...left, nomeImpianto, ...right];
  }

  // Meno campi del previsto: delimitatore mancante, riga genuinamente malformata.
  // Non si tenta di indovinare l'allineamento: la riga va segnalata e scartata dal chiamante.
  return null;
}

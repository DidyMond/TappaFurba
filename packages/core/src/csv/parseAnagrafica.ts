import type { Station, TipoImpianto } from "@tappafurba/shared";
import { splitAnagraficaRow } from "./splitRow";
import { isValidItalianCoordinate } from "../validation/coordinates";

export interface ParseWarning {
  line: number;
  reason: string;
  raw: string;
}

export interface AnagraficaParseResult {
  stations: Station[];
  warnings: ParseWarning[];
}

const METADATA_LINE_PREFIX = "Estrazione del";
const HEADER_FIRST_COLUMN = "idImpianto";

/**
 * anagrafica_impianti_attivi.csv ha DUE righe di intestazione, non una:
 * riga 1 = metadata ("Estrazione del ..."), riga 2 = header colonne.
 * Entrambe vanno saltate, non solo la prima.
 */
function findDataStartIndex(lines: string[]): number {
  let index = 0;
  if (lines[index]?.startsWith(METADATA_LINE_PREFIX)) index += 1;
  if (lines[index]?.split("|")[0] === HEADER_FIRST_COLUMN) index += 1;
  return index;
}

function normalizeTipoImpianto(raw: string): TipoImpianto {
  return raw.trim().toLowerCase() === "autostradale" ? "autostradale" : "stradale";
}

export function parseAnagraficaCsv(content: string): AnagraficaParseResult {
  const lines = content.split(/\r?\n/).filter((line) => line.length > 0);
  const stations: Station[] = [];
  const warnings: ParseWarning[] = [];

  const dataStartIndex = findDataStartIndex(lines);

  for (let i = dataStartIndex; i < lines.length; i++) {
    const line = lines[i]!;
    const fields = splitAnagraficaRow(line);

    if (!fields) {
      warnings.push({ line: i + 1, reason: "numero di campi insufficiente (delimitatore mancante)", raw: line });
      continue;
    }

    const [idRaw, gestore, bandiera, tipoImpiantoRaw, nomeImpianto, indirizzo, comune, provincia, latRaw, lonRaw] =
      fields as [string, string, string, string, string, string, string, string, string, string];

    const id = Number(idRaw);
    if (!Number.isFinite(id)) {
      warnings.push({ line: i + 1, reason: `idImpianto non numerico ("${idRaw}")`, raw: line });
      continue;
    }

    if (!latRaw.trim() || !lonRaw.trim()) {
      warnings.push({ line: i + 1, reason: "coordinate mancanti", raw: line });
      continue;
    }

    const lat = Number(latRaw);
    const lon = Number(lonRaw);
    if (!isValidItalianCoordinate(lat, lon)) {
      warnings.push({ line: i + 1, reason: `coordinate non valide (lat=${latRaw}, lon=${lonRaw})`, raw: line });
      continue;
    }

    stations.push({
      id,
      gestore: gestore.trim(),
      bandiera: bandiera.trim(),
      tipoImpianto: normalizeTipoImpianto(tipoImpiantoRaw),
      nomeImpianto: nomeImpianto.trim(),
      indirizzo: indirizzo.trim(),
      comune: comune.trim(),
      provincia: provincia.trim(),
      lat,
      lon,
    });
  }

  return { stations, warnings };
}

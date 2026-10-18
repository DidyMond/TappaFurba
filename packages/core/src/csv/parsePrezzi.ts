import type { FuelPrice } from "@tappafurba/shared";
import type { ParseWarning } from "./parseAnagrafica";
import { normalizeFuelType } from "../fuel/normalizeFuelType";
import { isPlausiblePrice } from "../validation/price";

export interface PrezziParseResult {
  prices: FuelPrice[];
  warnings: ParseWarning[];
}

const METADATA_LINE_PREFIX = "Estrazione del";
const HEADER_FIRST_COLUMN = "idImpianto";
const EXPECTED_FIELDS = 5;

function findDataStartIndex(lines: string[]): number {
  let index = 0;
  if (lines[index]?.startsWith(METADATA_LINE_PREFIX)) index += 1;
  if (lines[index]?.split("|")[0] === HEADER_FIRST_COLUMN) index += 1;
  return index;
}

/**
 * dtComu è "GG/MM/AAAA HH:MM:SS" (ora italiana, senza offset esplicito).
 * Per l'uso previsto (soglia di freschezza a 72h)
 * un errore di poche ore dovuto al fuso orario è trascurabile: si interpreta
 * come UTC per semplicità, non come conversione fedele del fuso Europe/Rome.
 */
function parseDtComu(raw: string): string | null {
  const match = raw.trim().match(/^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2}):(\d{2})$/);
  if (!match) return null;

  const [, day, month, year, hour, minute, second] = match as unknown as [
    string,
    string,
    string,
    string,
    string,
    string,
    string,
  ];
  const iso = `${year}-${month}-${day}T${hour}:${minute}:${second}Z`;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

export function parsePrezziCsv(content: string): PrezziParseResult {
  const lines = content.split(/\r?\n/).filter((line) => line.length > 0);
  const prices: FuelPrice[] = [];
  const warnings: ParseWarning[] = [];

  const dataStartIndex = findDataStartIndex(lines);

  for (let i = dataStartIndex; i < lines.length; i++) {
    const line = lines[i]!;
    const fields = line.split("|");

    if (fields.length !== EXPECTED_FIELDS) {
      warnings.push({ line: i + 1, reason: "numero di campi inatteso", raw: line });
      continue;
    }

    const [idRaw, rawDescCarburante, priceRaw, isSelfRaw, dtComuRaw] = fields as [
      string,
      string,
      string,
      string,
      string,
    ];

    const stationId = Number(idRaw);
    if (!Number.isFinite(stationId)) {
      warnings.push({ line: i + 1, reason: `idImpianto non numerico ("${idRaw}")`, raw: line });
      continue;
    }

    if (!priceRaw.trim()) {
      warnings.push({ line: i + 1, reason: "prezzo mancante", raw: line });
      continue;
    }

    const price = Number(priceRaw);
    const normalized = normalizeFuelType(rawDescCarburante);
    if (!isPlausiblePrice(price, normalized.fuelType)) {
      warnings.push({ line: i + 1, reason: `prezzo fuori range plausibile ("${priceRaw}")`, raw: line });
      continue;
    }

    const communicatedAt = parseDtComu(dtComuRaw);
    if (!communicatedAt) {
      warnings.push({ line: i + 1, reason: `dtComu non valido ("${dtComuRaw}")`, raw: line });
      continue;
    }

    if (normalized.matchedVia === "unknown") {
      warnings.push({
        line: i + 1,
        reason: `descCarburante non riconosciuto, salvato come "unknown": "${rawDescCarburante}"`,
        raw: line,
      });
    }

    prices.push({
      stationId,
      fuelType: normalized.fuelType,
      rawDescCarburante: rawDescCarburante.trim(),
      isSelf: isSelfRaw.trim() === "1",
      price,
      communicatedAt,
    });
  }

  return { prices, warnings };
}

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { FuelDataProvider } from "./FuelDataProvider";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, "fixtures");

/**
 * Provider a zero rete per dry-run manuali e per l'eventuale futura suite di
 * test di integrazione dell'API (richiede comunque un Postgres/PostGIS
 * raggiungibile: qui si sostituisce solo la fonte dei CSV, non il database).
 */
export class FixtureFuelDataProvider implements FuelDataProvider {
  async fetchAnagraficaCsv(): Promise<string> {
    return readFile(path.join(FIXTURES_DIR, "anagrafica_sample.csv"), "utf-8");
  }

  async fetchPrezziCsv(): Promise<string> {
    return readFile(path.join(FIXTURES_DIR, "prezzo_sample.csv"), "utf-8");
  }
}

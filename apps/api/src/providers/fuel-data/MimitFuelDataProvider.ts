import { env } from "../../env";
import type { FuelDataProvider } from "./FuelDataProvider";

async function fetchCsv(url: string, label: string): Promise<string> {
  // User-Agent identificativo (lo stesso della fonte prezzi in tempo reale, personalizzabile con un contatto): il ministero sa chi scarica.
  const response = await fetch(url, { headers: { "User-Agent": env.LIVE_PRICES_USER_AGENT } });
  if (!response.ok) {
    throw new Error(`Download CSV MIMIT (${label}) fallito: HTTP ${response.status} da ${url}`);
  }
  return response.text();
}

export class MimitFuelDataProvider implements FuelDataProvider {
  async fetchAnagraficaCsv(): Promise<string> {
    return fetchCsv(env.MIMIT_ANAGRAFICA_URL, "anagrafica");
  }

  async fetchPrezziCsv(): Promise<string> {
    return fetchCsv(env.MIMIT_PREZZI_URL, "prezzi");
  }
}

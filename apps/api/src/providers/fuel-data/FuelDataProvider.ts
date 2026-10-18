/**
 * Astrae la sorgente dei due CSV MIMIT. L'ingestione (runIngestion) dipende
 * solo da questa interfaccia, mai direttamente da rete o filesystem:
 * MimitFuelDataProvider scarica i CSV reali, FixtureFuelDataProvider legge
 * fixture locali a zero rete per test/dry-run.
 */
export interface FuelDataProvider {
  fetchAnagraficaCsv(): Promise<string>;
  fetchPrezziCsv(): Promise<string>;
}

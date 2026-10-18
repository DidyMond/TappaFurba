import type { LiveStationInput } from "@tappafurba/core";

/** Persistenza dei prezzi live e della cache per riquadro. */
export interface LivePriceStore {
  /** Riquadri aggiornati da meno di `maxAgeMs`, con l'istante dell'ultimo aggiornamento. */
  getFreshTiles(tileIds: readonly string[], maxAgeMs: number): Promise<Map<string, Date>>;
  /**
   * Salva i prezzi delle stazioni note (le altre vengono ignorate: senza anagrafica
   * mancano indirizzo e gestore) e segna il riquadro come aggiornato.
   */
  applyTile(tileId: string, stations: readonly LiveStationInput[]): Promise<{ stationsUpdated: number }>;
}

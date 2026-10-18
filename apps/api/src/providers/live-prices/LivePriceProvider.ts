import type { LiveStationInput } from "@tappafurba/core";
import type { LonLat } from "@tappafurba/shared";

/**
 * Fonte dei prezzi "in tempo reale" per zona. L'implementazione di produzione
 * interroga il sito ufficiale Osservaprezzi (MIMIT); i test usano stub in memoria.
 *
 * Contratto: restituisce le stazioni entro `radiusKm` da `center` con i prezzi
 * attuali. Lancia un errore per problemi di rete/HTTP/formato; le singole
 * stazioni malformate vengono scartate, non fanno fallire la chiamata.
 */
export interface LivePriceProvider {
  fetchZone(center: LonLat, radiusKm: number): Promise<LiveStationInput[]>;
}

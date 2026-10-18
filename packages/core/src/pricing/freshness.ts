/**
 * Freschezza di un prezzo = ULTIMA CONFERMA DELLA FONTE.
 *
 * Un gestore non ricomunica un prezzo che non cambia: la data di comunicazione (`communicated_at`) può essere vecchia anche
 * se il prezzo è quello in vigore. Per le stazioni dentro un riquadro interrogato in tempo reale contano quindi anche
 * l'istante dell'ultimo aggiornamento del riquadro (`live_price_tiles.refreshed_at`): vale il più recente dei due.
 * Un riquadro non aggiornato, o aggiornato prima della soglia, non conta (cioè vale solo la data di comunicazione).
 *
 * La data di comunicazione resta un FATTO e non si tocca: nel dettaglio compare sempre «prezzo del …» com'è.
 */

type Instant = Date | string | number;

const toMs = (value: Instant): number => (value instanceof Date ? value.getTime() : new Date(value).getTime());

/** Il più recente tra la data di comunicazione e l'ultimo aggiornamento del riquadro che contiene la stazione (se c'è). */
export function lastConfirmedAt(communicatedAt: Instant, tileRefreshedAt?: Instant | null): Date {
  const communicated = toMs(communicatedAt);
  if (tileRefreshedAt === undefined || tileRefreshedAt === null) return new Date(communicated);
  return new Date(Math.max(communicated, toMs(tileRefreshedAt)));
}

/** Vero se l'ultima conferma della fonte è entro `maxAgeHours` ore da `now`. */
export function isPriceFresh(communicatedAt: Instant, tileRefreshedAt: Instant | null | undefined, now: Instant, maxAgeHours: number): boolean {
  return lastConfirmedAt(communicatedAt, tileRefreshedAt).getTime() >= toMs(now) - maxAgeHours * 3_600_000;
}

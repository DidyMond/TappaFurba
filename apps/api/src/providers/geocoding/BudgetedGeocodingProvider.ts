import type { GeocodeSuggestion, LonLat } from "@tappafurba/shared";
import { BudgetExhaustedError } from "../../errors";
import type { UsageCounter } from "../../usage/UsageCounter";
import type { AutocompleteOptions, GeocodingProvider } from "./GeocodingProvider";

export const GEOCODING_USAGE_SERVICE = "mapbox-geocoding";

const EXHAUSTED_MESSAGE =
  "La ricerca degli indirizzi è temporaneamente non disponibile: è stato raggiunto il limite mensile del servizio.";

/**
 * Decoratore che conta ogni chiamata reale al geocoding (autocomplete e reverse insieme, su tutti gli IP) e smette di
 * chiamare il provider oltre il limite mensile. Mapbox non ha un tetto di spesa nativo: oltre il piano gratuito fattura
 * senza fermarsi, e il rate limit per IP da solo non basta (conta le richieste dei client, non il totale).
 *
 * Si conta prima della chiamata (conservativo: una richiesta fallita può comunque essere fatturata); le richieste respinte
 * non si contano. Il periodo è il mese UTC ('YYYY-MM'), lo stesso schema di Directions.
 */
export class BudgetedGeocodingProvider implements GeocodingProvider {
  constructor(
    private readonly inner: GeocodingProvider,
    private readonly counter: UsageCounter,
    private readonly hardLimit: number,
    private readonly now: () => Date = () => new Date(),
  ) {
    if (!Number.isInteger(hardLimit) || hardLimit < 1) throw new RangeError("hardLimit deve essere un intero positivo");
  }

  autocomplete(query: string, options?: AutocompleteOptions): Promise<GeocodeSuggestion[]> {
    return this.guarded(() => this.inner.autocomplete(query, options));
  }

  reverse(point: LonLat): Promise<string | null> {
    return this.guarded(() => this.inner.reverse(point));
  }

  private async guarded<T>(call: () => Promise<T>): Promise<T> {
    const period = this.now().toISOString().slice(0, 7);
    if ((await this.counter.get(GEOCODING_USAGE_SERVICE, period)) >= this.hardLimit) {
      throw new BudgetExhaustedError(EXHAUSTED_MESSAGE);
    }
    await this.counter.increment(GEOCODING_USAGE_SERVICE, period);
    return call();
  }
}

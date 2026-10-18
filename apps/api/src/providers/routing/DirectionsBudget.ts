import type { UsageCounter } from "../../usage/UsageCounter";

export type BudgetStatus = "ok" | "soft_limit" | "hard_limit";

/** Cosa serve al servizio di ricerca per decidere se il routing reale è ancora consentito. */
export interface BudgetGate {
  status(): Promise<BudgetStatus>;
}

export interface DirectionsBudgetOptions {
  counter: UsageCounter;
  /** Oltre questa soglia si disabilita il ricalcolo con routing reale (resta solo il proxy). */
  softLimit: number;
  /** Oltre questa soglia si smette del tutto di chiamare Directions. */
  hardLimit: number;
  now?: () => Date;
}

const SERVICE = "mapbox-directions";

/**
 * Kill switch sul contatore mensile delle chiamate Directions. Mapbox non ha
 * un tetto di spesa nativo: oltre il free tier (100.000/mese) fattura senza
 * fermarsi, quindi il limite va imposto qui.
 */
export class DirectionsBudget implements BudgetGate {
  private readonly counter: UsageCounter;
  private readonly softLimit: number;
  private readonly hardLimit: number;
  private readonly now: () => Date;

  constructor(options: DirectionsBudgetOptions) {
    if (options.softLimit > options.hardLimit) {
      throw new RangeError("softLimit non può superare hardLimit");
    }
    this.counter = options.counter;
    this.softLimit = options.softLimit;
    this.hardLimit = options.hardLimit;
    this.now = options.now ?? (() => new Date());
  }

  async status(): Promise<BudgetStatus> {
    const used = await this.counter.get(SERVICE, this.period());
    if (used >= this.hardLimit) return "hard_limit";
    if (used >= this.softLimit) return "soft_limit";
    return "ok";
  }

  /** Registra una chiamata in uscita; restituisce il totale del mese. */
  async record(): Promise<number> {
    return this.counter.increment(SERVICE, this.period());
  }

  private period(): string {
    return this.now().toISOString().slice(0, 7); // 'YYYY-MM' (UTC)
  }
}

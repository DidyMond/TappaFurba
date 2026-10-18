/**
 * Logica Self/Servito:
 *
 * - "Solo Self" attivo: la stazione conta solo se ha un prezzo Self.
 * - "Solo Self" disattivo: si usa il prezzo Self se disponibile, altrimenti il
 *   Servito (con flag servitoOnly per il badge "Solo Servito").
 *
 * Non si fa mai una media tra i due prezzi: ogni stazione ha un solo
 * P_station, con provenienza esplicita.
 */

export interface StationPriceOption {
  isSelf: boolean;
  price: number;
  /** ISO 8601. */
  communicatedAt: string;
}

export interface SelectedPrice {
  price: number;
  isSelf: boolean;
  /** true se la stazione non ha un prezzo Self e si usa il Servito. */
  servitoOnly: boolean;
  communicatedAt: string;
}

function cheapest(options: readonly StationPriceOption[]): StationPriceOption | undefined {
  return options.reduce<StationPriceOption | undefined>(
    (best, option) => (best === undefined || option.price < best.price ? option : best),
    undefined,
  );
}

export function selectStationPrice(
  options: readonly StationPriceOption[],
  settings: { onlySelf: boolean },
): SelectedPrice | null {
  const self = cheapest(options.filter((option) => option.isSelf));
  if (self) {
    return { price: self.price, isSelf: true, servitoOnly: false, communicatedAt: self.communicatedAt };
  }

  if (settings.onlySelf) {
    return null;
  }

  const servito = cheapest(options.filter((option) => !option.isSelf));
  if (servito) {
    return { price: servito.price, isSelf: false, servitoOnly: true, communicatedAt: servito.communicatedAt };
  }

  return null;
}

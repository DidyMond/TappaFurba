import type { FuelPrice } from "@tappafurba/shared";
import { preprocessFuelLabel } from "./normalizeFuelType";

/** Etichette dei prodotti "base": quelli che l'utente intende scegliendo Benzina, Diesel, GPL, Metano. */
const BASE_PRODUCT_LABELS: ReadonlySet<string> = new Set(["benzina", "gasolio", "gpl", "metano"]);

function isBaseProduct(price: FuelPrice): boolean {
  return BASE_PRODUCT_LABELS.has(preprocessFuelLabel(price.rawDescCarburante));
}

/**
 * Raggruppare le varianti brandizzate sotto il tipo carburante base (vedi
 * normalizeFuelType) può far coesistere, per la stessa stazione e modalità,
 * più righe con lo stesso (stationId, fuelType, isSelf) — es. "Gasolio" e
 * "Gasolio Premium" nella stessa stazione mappano entrambe su "diesel".
 *
 * Regola di riduzione entro un singolo batch:
 *  1. il prodotto BASE ("Benzina", "Gasolio", "GPL", "Metano") vince sulle varianti,
 *     anche se una variante costa meno: un prezzo anomalo di un prodotto premium
 *     (nei dati reali: "Blue Super" a 1.000 €/L accanto a "Benzina" a 2.199) non deve
 *     mai diventare il prezzo della benzina della stazione;
 *  2. tra prodotti dello stesso livello si tiene il prezzo più basso;
 *  3. a parità di prezzo, la comunicazione più recente.
 * Non rappresenta uno storico: ogni ingestione sostituisce comunque il valore
 * precedente in DB con quello osservato.
 */
export function dedupeToLowestPricePerStationFuelMode(prices: FuelPrice[]): FuelPrice[] {
  const bestByKey = new Map<string, FuelPrice>();

  for (const price of prices) {
    const key = `${price.stationId}|${price.fuelType}|${price.isSelf}`;
    const current = bestByKey.get(key);

    if (!current || isBetterPrice(price, current)) {
      bestByKey.set(key, price);
    }
  }

  return [...bestByKey.values()];
}

function isBetterPrice(candidate: FuelPrice, current: FuelPrice): boolean {
  const candidateIsBase = isBaseProduct(candidate);
  const currentIsBase = isBaseProduct(current);
  if (candidateIsBase !== currentIsBase) {
    return candidateIsBase;
  }
  if (candidate.price !== current.price) {
    return candidate.price < current.price;
  }
  return candidate.communicatedAt > current.communicatedAt;
}

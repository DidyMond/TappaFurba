import type { DetourSource } from "@tappafurba/shared";
import type { Detour } from "../geo/detour";
import { computeNetSavings } from "../savings/netSavings";

export interface ResolvedDetour {
  detour: Detour;
  /** `routing` solo se il valore arriva davvero dal routing reale: una stima non si dichiara mai verificata. */
  source: DetourSource;
}

/**
 * Deviazione da mostrare nel dettaglio di una stazione: quella verificata col routing reale se c'è, altrimenti la
 * stima geometrica dichiarata come tale (`proxy`), in modo che l'interfaccia possa mostrare il badge «stima».
 */
export function resolveDetour(verified: Detour | null | undefined, proxy: Detour): ResolvedDetour {
  if (verified && Number.isFinite(verified.km) && Number.isFinite(verified.minutes)) {
    return { detour: verified, source: "routing" };
  }
  return { detour: proxy, source: "proxy" };
}

export interface StationDetailInput {
  /** Prezzo di riferimento della tratta (P_avg), €/L. */
  referencePrice: number;
  /** Prezzo della stazione per la combinazione scelta, €/L. */
  stationPrice: number;
  liters: number;
  detour: Detour;
  consumptionKmPerLiter: number;
  valueOfTimePerMinute: number;
}

export interface StationDetail {
  /** Prezzo stazione − riferimento, €/L: negativo = la stazione costa meno della media. */
  priceDifferencePerLiter: number;
  /** Stessa differenza in percentuale del prezzo di riferimento: negativo = più economica. */
  priceDifferencePercent: number;
  /** (P_avg − P_station) × litri. */
  grossSavings: number;
  detourFuelCost: number;
  detourTimeCost: number;
  /** Costo carburante + tempo della deviazione. */
  detourCost: number;
  netSavings: number;
  costPerKm: number;
}

/**
 * Numeri del riquadro «Impatto sul tuo viaggio»: differenziale rispetto al prezzo di riferimento e Net Savings Index,
 * con la stessa formula (e lo stesso `computeNetSavings`) usati nell'elenco dei risultati.
 */
export function computeStationDetail(input: StationDetailInput): StationDetail {
  if (!(input.referencePrice > 0) || !Number.isFinite(input.referencePrice)) {
    throw new RangeError(`referencePrice deve essere > 0 (ricevuto ${input.referencePrice})`);
  }
  const breakdown = computeNetSavings({
    referencePrice: input.referencePrice,
    stationPrice: input.stationPrice,
    liters: input.liters,
    detourKm: input.detour.km,
    detourMinutes: input.detour.minutes,
    consumptionKmPerLiter: input.consumptionKmPerLiter,
    valueOfTimePerMinute: input.valueOfTimePerMinute,
  });
  const priceDifferencePerLiter = input.stationPrice - input.referencePrice;
  return {
    priceDifferencePerLiter,
    priceDifferencePercent: (priceDifferencePerLiter / input.referencePrice) * 100,
    grossSavings: breakdown.grossSavings,
    detourFuelCost: breakdown.detourFuelCost,
    detourTimeCost: breakdown.detourTimeCost,
    detourCost: breakdown.detourFuelCost + breakdown.detourTimeCost,
    netSavings: breakdown.netSavings,
    costPerKm: breakdown.costPerKm,
  };
}

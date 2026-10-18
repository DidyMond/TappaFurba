/**
 * Net Savings Index:
 *
 *   S_net = (P_avg − P_station) × V_refill − (D_detour × C_km + T_detour × V_time)
 *
 * con C_km = P_avg / consumo (solo costo carburante, calcolato sul prezzo di
 * riferimento e NON su P_station: il tragitto extra si percorre con il
 * carburante già a bordo).
 */

export interface NetSavingsInput {
  /** Prezzo di riferimento della tratta, €/L. */
  referencePrice: number;
  /** Prezzo della stazione candidata, €/L. */
  stationPrice: number;
  /** Litri che si intende rifornire. */
  liters: number;
  /** Km extra del percorso A→stazione→B rispetto ad A→B. */
  detourKm: number;
  /** Minuti extra del percorso A→stazione→B rispetto ad A→B. */
  detourMinutes: number;
  /** Consumo del veicolo, km/L. */
  consumptionKmPerLiter: number;
  /** Valore del tempo, €/minuto. */
  valueOfTimePerMinute: number;
}

export interface NetSavingsBreakdown {
  /** (P_avg − P_station) × litri: può essere negativo se la stazione costa più della media. */
  grossSavings: number;
  /** Costo carburante dei km extra. */
  detourFuelCost: number;
  /** Costo del tempo extra. */
  detourTimeCost: number;
  /** grossSavings − detourFuelCost − detourTimeCost. */
  netSavings: number;
  costPerKm: number;
}

/** Costo marginale al km, €/km = P_avg / consumo. */
export function costPerKm(referencePrice: number, consumptionKmPerLiter: number): number {
  if (!(consumptionKmPerLiter > 0)) {
    throw new RangeError(`consumptionKmPerLiter deve essere > 0 (ricevuto ${consumptionKmPerLiter})`);
  }
  return referencePrice / consumptionKmPerLiter;
}

export function computeNetSavings(input: NetSavingsInput): NetSavingsBreakdown {
  const { referencePrice, stationPrice, liters, detourKm, detourMinutes, consumptionKmPerLiter, valueOfTimePerMinute } =
    input;

  for (const [name, value] of Object.entries({
    referencePrice,
    stationPrice,
    liters,
    detourKm,
    detourMinutes,
    valueOfTimePerMinute,
  })) {
    if (!Number.isFinite(value) || value < 0) {
      throw new RangeError(`${name} deve essere un numero finito >= 0 (ricevuto ${value})`);
    }
  }

  const perKm = costPerKm(referencePrice, consumptionKmPerLiter);

  const grossSavings = (referencePrice - stationPrice) * liters;
  const detourFuelCost = detourKm * perKm;
  const detourTimeCost = detourMinutes * valueOfTimePerMinute;

  return {
    grossSavings,
    detourFuelCost,
    detourTimeCost,
    netSavings: grossSavings - detourFuelCost - detourTimeCost,
    costPerKm: perKm,
  };
}

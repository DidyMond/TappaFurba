import type { FuelType } from "@tappafurba/shared";

/**
 * Mapping esplicito e verificato manualmente sulle ~60 varianti reali osservate
 * in prezzo_alle_8.csv (MIMIT, verificato dal vivo settembre 2026). Chiavi già
 * pre-processate (vedi preprocessFuelLabel): trim, lowercase, NFD senza
 * diacritici, spazi multipli collassati in uno solo.
 *
 * "HiQ Perform+" (senza indicazione B100) è trattato come diesel premium, non
 * biocarburante: solo la variante esplicitamente "B100" (biodiesel puro)
 * rientra nel bucket hvo.
 */
export const FUEL_TYPE_DICTIONARY: Record<string, FuelType> = {
  // benzina e varianti premium/brandizzate
  benzina: "benzina",
  "benzina 100 ottani": "benzina",
  "benzina 102 ottani": "benzina",
  "benzina energy 98 ottani": "benzina",
  "benzina plus 98": "benzina",
  "benzina shell v power": "benzina",
  "benzina speciale 98 ottani": "benzina",
  "benzina wr 100": "benzina",
  "benzina speciale": "benzina",
  "blue super": "benzina",
  "v-power": "benzina",
  "verde speciale": "benzina",

  // diesel/gasolio e varianti premium/brandizzate
  gasolio: "diesel",
  "gasolio alpino": "diesel",
  "gasolio artico": "diesel",
  "gasolio artico igloo": "diesel",
  "gasolio ecoplus": "diesel",
  "gasolio energy d": "diesel",
  "gasolio gelo": "diesel",
  "gasolio oro diesel": "diesel",
  "gasolio plus": "diesel",
  "gasolio premium": "diesel",
  "gasolio prestazionale": "diesel",
  "gasolio speciale": "diesel",
  "blu diesel alpino": "diesel",
  "blue diesel": "diesel",
  "diesel shell v power": "diesel",
  dieselmax: "diesel",
  "excellium diesel": "diesel",
  "gp diesel": "diesel",
  "hi-q diesel": "diesel",
  "s-diesel": "diesel",
  "supreme diesel": "diesel",
  "v-power diesel": "diesel",
  "hiq perform+": "diesel",

  gpl: "gpl",
  metano: "metano",

  // famiglia HVO/biocarburanti: esclusa dalla UI MVP ma normalizzata e conservata
  bchvo: "hvo",
  "diesel hvo": "hvo",
  "diesel hvo energy": "hvo",
  "gasolio hvo": "hvo",
  "gasolio bio hvo": "hvo",
  hvo: "hvo",
  "hvo energy diesel": "hvo",
  "hvo future": "hvo",
  "hvo eco diesel": "hvo",
  hvo100: "hvo",
  hvolution: "hvo",
  hvovolution: "hvo",
  "hiq perform b100 ottani": "hvo",
  rehvo: "hvo",

  // carburanti riconosciuti ma fuori scope MVP (distinti da Metano/CNG)
  gnl: "other",
  "l-gnc": "other",
};

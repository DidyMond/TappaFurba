/**
 * Logica pura del foglio dei Risultati su mobile (nessun DOM): punti di aggancio, effetto elastico ai bordi e scelta del
 * punto più vicino al rilascio. Il componente (`useBottomSheet`) la usa; qui è testabile con numeri.
 *
 * Il foglio ha TRE punti di aggancio, tutte altezze in px misurate dal fondo dello schermo:
 *  - `minimized` (ridotto): foglio nascosto tranne una zona maniglia di ~28 px sopra la barra inferiore (il foglio scende dietro
 *    la barra, quindi l'altezza è zona maniglia + ingombro della barra); la mappa occupa tutto il resto. Solo il trascinamento
 *    verso il basso porta qui: il tocco non riduce mai a icona;
 *  - `collapsed` (chiuso, predefinito a ogni nuova ricerca): il foglio parte sotto la mappa al 40% ma arriva fino al fondo dello
 *    schermo, dietro la barra inferiore: lo spazio morto sotto il foglio diventa altezza dell'elenco;
 *  - `expanded` (espanso): ~85% dell'altezza dello schermo. MAI il 100%: la mappa e l'header restano visibili.
 */
export type SheetSnap = "minimized" | "collapsed" | "expanded";

export interface SheetBounds {
  minimized: number;
  collapsed: number;
  expanded: number;
}

/** I punti di aggancio più le due altezze della mappa che ne derivano. */
export interface SheetLayout extends SheetBounds {
  /** Altezza della mappa da chiuso/espanso (40% dello schermo). */
  mapBase: number;
  /** Altezza della mappa da ridotto: fino al bordo superiore del foglio ridotto (meno la sovrapposizione). */
  mapTall: number;
}

/** Quota dell'altezza dello schermo occupata dal foglio espanso. */
export const SHEET_EXPANDED_RATIO = 0.85;
/** Quota dell'altezza dello schermo occupata dalla mappa quando il foglio è chiuso o espanso. */
export const SHEET_MAP_RATIO = 0.4;
/** Quanto il foglio sale sopra il bordo inferiore della mappa (la testata arrotondata copre l'angolo della mappa). */
export const SHEET_OVERLAP_PX = 12;
/** Zona maniglia visibile (e trascinabile) del foglio ridotto, sopra la barra inferiore. */
export const SHEET_HANDLE_ZONE_PX = 28;
/** Movimento minimo del dito (px) per considerare un trascinamento invece di un tocco. */
export const SHEET_DRAG_SLOP_PX = 6;
/** Durata dell'aggancio al rilascio (ms), ease-out. */
export const SHEET_SNAP_MS = 200;
/** Oltre i bordi il foglio segue il dito sempre meno, fino a questo massimo (px). */
export const SHEET_RUBBER_MAX_PX = 40;
/** Evento (su `window`) con cui la barra inferiore avvisa che si è toccata la scheda «Risultati» già attiva. */
export const RESULTS_TAB_RESELECTED_EVENT = "results-tab-reselected";

/**
 * Punti di aggancio dalle misure: altezza della regione sotto l'header (`containerHeight`), altezza dello schermo e ingombro
 * della barra inferiore (distanza del suo bordo superiore dal fondo dello schermo). Restituisce null se il layout non è
 * misurabile (contenitore nascosto o jsdom).
 */
export function computeSheetBounds(containerHeight: number, viewportHeight: number, navClearance = 0): SheetLayout | null {
  if (!(containerHeight > 0) || !(viewportHeight > 0)) return null;
  const mapBase = Math.round(viewportHeight * SHEET_MAP_RATIO);
  const collapsed = Math.min(containerHeight, Math.max(0, containerHeight - mapBase + SHEET_OVERLAP_PX));
  const expanded = Math.min(containerHeight, Math.max(collapsed, Math.round(viewportHeight * SHEET_EXPANDED_RATIO)));
  const minimized = Math.min(collapsed, SHEET_HANDLE_ZONE_PX + Math.max(0, navClearance));
  const mapTall = Math.min(containerHeight, Math.max(0, containerHeight - minimized + SHEET_OVERLAP_PX));
  return { minimized: Math.round(minimized), collapsed: Math.round(collapsed), expanded: Math.round(expanded), mapBase, mapTall: Math.round(mapTall) };
}

/** Spostamento oltre il bordo con resistenza crescente: tende a `max` senza mai raggiungerlo. */
function resist(overshoot: number, max: number): number {
  if (overshoot <= 0 || max <= 0) return 0;
  return (1 - 1 / ((overshoot * 0.55) / max + 1)) * max;
}

/**
 * Altezza mostrata mentre il dito trascina: uguale a quella richiesta tra il punto ridotto e l'espanso, elastica fuori (verso
 * l'alto al massimo fino a lasciare libero l'header, verso il basso fino a `SHEET_RUBBER_MAX_PX` sotto il punto ridotto).
 * `maxHeight` è l'altezza del contenitore: il foglio non lo supera mai.
 */
export function rubberBandHeight(requested: number, bounds: SheetBounds, maxHeight: number): number {
  if (requested > bounds.expanded) {
    const room = Math.max(0, maxHeight - bounds.expanded);
    return bounds.expanded + resist(requested - bounds.expanded, Math.min(SHEET_RUBBER_MAX_PX, room));
  }
  if (requested < bounds.minimized) return bounds.minimized - resist(bounds.minimized - requested, SHEET_RUBBER_MAX_PX);
  return requested;
}

/** Ordine di preferenza a pari distanza: prima «chiuso» (il punto di riposo), poi ridotto, poi espanso. */
const TIE_ORDER: readonly SheetSnap[] = ["collapsed", "minimized", "expanded"];

/** Punto di aggancio più vicino all'altezza di rilascio; a pari distanza vince «chiuso». */
export function nearestSnap(height: number, bounds: SheetBounds): SheetSnap {
  let best: SheetSnap = "collapsed";
  for (const snap of TIE_ORDER) {
    if (Math.abs(height - bounds[snap]) < Math.abs(height - bounds[best])) best = snap;
  }
  return best;
}

export function snapHeight(snap: SheetSnap, bounds: SheetBounds): number {
  return bounds[snap];
}

/**
 * Effetto del tocco sulla maniglia: ridotto → chiuso, chiuso → espanso, espanso → chiuso. Il tocco NON riduce mai: si riduce
 * solo trascinando verso il basso.
 */
export function nextTapSnap(snap: SheetSnap): SheetSnap {
  return snap === "collapsed" ? "expanded" : "collapsed";
}

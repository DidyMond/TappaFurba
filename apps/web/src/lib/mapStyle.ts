/**
 * Stili della mappa: i quattro disegnati in Mapbox Studio, tra cui l'utente sceglie in
 * Impostazioni → «Tema Mappa». La scelta sta solo in `localStorage` (chiave `tappafurba.mapStyle`) e `MapCanvas` la applica
 * all'avvio e a ogni evento `map-style-changed`. Predefinito: Light.
 */

export interface MapStyleDefinition {
  id: string;
  name: string;
  description: string;
  /** Anteprima 400×240 (stesso punto e stesso zoom per tutti gli stili), in `public/styles`. */
  preview: string;
  mapboxUrl: string;
}

export const MAP_STYLES = {
  monochrome: {
    id: "monochrome",
    name: "Monocromo",
    description: "Stile pulito e minimale, grigi neutri",
    preview: "/styles/preview-monochrome.jpg",
    mapboxUrl: "mapbox://styles/didymond/cmux5q9z5015t01saa48254g1",
  },
  duotono: {
    id: "duotono",
    name: "Duotono",
    description: "Grigi con accenti di colore, acqua azzurra tenue",
    preview: "/styles/preview-duotono.jpg",
    mapboxUrl: "mapbox://styles/didymond/cmuy7r1n0000601s79cnsfxpl",
  },
  stradale: {
    id: "stradale",
    name: "Carta Stradale",
    description: "Toni caldi neutri, effetto carta",
    preview: "/styles/preview-stradale.jpg",
    mapboxUrl: "mapbox://styles/didymond/cmuy7q69s001q01sg1lxrgqwr",
  },
  light: {
    id: "light",
    name: "Light",
    description: "Chiaro e leggero, con i colori del brand: la rotta e i prezzi risaltano",
    preview: "/styles/preview-light.jpg",
    mapboxUrl: "mapbox://styles/didymond/cmuyf14qc01aq01saegvu6owk",
  },
} as const satisfies Record<string, MapStyleDefinition>;

export type MapStyleId = keyof typeof MAP_STYLES;

export const DEFAULT_MAP_STYLE: MapStyleId = "light";

/** Ordine in cui il selettore li mostra. */
export const MAP_STYLE_ORDER: readonly MapStyleId[] = ["light", "duotono", "stradale", "monochrome"];

/** Evento (su `window`) che avvisa la mappa montata di un cambio di stile: `detail: { styleId }`. */
export const MAP_STYLE_CHANGED_EVENT = "map-style-changed";

export interface MapStyleChangedDetail {
  styleId: MapStyleId;
}

export const MAP_STYLE_KEY = "tappafurba.mapStyle";

/** Lingua delle etichette (opzione `language` di Map, GL JS ≥ 3.10). */
export const MAP_LANGUAGE = "it";

const MAPBOX_STYLE_URL = /^mapbox:\/\/styles\/[\w.-]+\/[\w.-]+$/;

export function isMapStyleId(value: unknown): value is MapStyleId {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(MAP_STYLES, value);
}

/** Copia in memoria: vale quando lo storage non è disponibile (navigazione privata, dati bloccati). */
let memory: MapStyleId | null = null;

/** Lo stile scelto; un valore sconosciuto o danneggiato nello storage vale come se non ci fosse (Light). */
export function getSelectedMapStyle(): MapStyleId {
  try {
    const stored = localStorage.getItem(MAP_STYLE_KEY);
    if (stored === null) return memory ?? DEFAULT_MAP_STYLE;
    return isMapStyleId(stored) ? stored : DEFAULT_MAP_STYLE;
  } catch {
    return memory ?? DEFAULT_MAP_STYLE;
  }
}

/** Salva lo stile e, se è cambiato, avvisa la mappa montata con `map-style-changed`. */
export function setMapStyle(styleId: MapStyleId): void {
  if (!isMapStyleId(styleId)) return;
  const previous = getSelectedMapStyle();
  memory = styleId;
  try {
    localStorage.setItem(MAP_STYLE_KEY, styleId);
  } catch {
    // storage pieno o bloccato: resta la copia in memoria
  }
  if (previous !== styleId) {
    window.dispatchEvent(new CustomEvent<MapStyleChangedDetail>(MAP_STYLE_CHANGED_EVENT, { detail: { styleId } }));
  }
}

/** Solo per i test: azzera la copia in memoria. */
export function resetMapStyleMemory(): void {
  memory = null;
}

export interface ResolvedMapStyle {
  id: MapStyleId;
  url: string;
}

/**
 * Lo stile da caricare per `styleId`. Se l'URL non è del tipo `mapbox://styles/utente/id` (non si passano mai URL
 * arbitrari a Mapbox) o l'id è sconosciuto, ripiega su Light con un warning.
 */
export function resolveMapStyle(styleId: unknown): ResolvedMapStyle {
  if (isMapStyleId(styleId) && MAPBOX_STYLE_URL.test(MAP_STYLES[styleId].mapboxUrl)) {
    return { id: styleId, url: MAP_STYLES[styleId].mapboxUrl };
  }
  console.warn(`Stile mappa «${String(styleId)}» non disponibile: uso «${DEFAULT_MAP_STYLE}».`);
  return { id: DEFAULT_MAP_STYLE, url: MAP_STYLES[DEFAULT_MAP_STYLE].mapboxUrl };
}

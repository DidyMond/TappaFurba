import type { SearchFuelType } from "@tappafurba/shared";
import { useSyncExternalStore } from "react";
import { FUEL_OPTIONS } from "./defaults";

/**
 * Storico delle ricerche per «Tragitti frequenti» (Home), solo in `localStorage`, sul dispositivo dell'utente.
 *
 * Per ogni tragitto si conserva SOLO il testo dei due campi (partenza/arrivo), il carburante, il conteggio, la data
 * dell'ultima ricerca e, per un estremo preso dal GPS, il flag «posizione attuale». **Mai coordinate né `mapbox_id`**:
 * il testo è cronologia di query dell'utente; tutte le volte che un tragitto viene riaperto i luoghi si risolvono con due
 * richieste di geocoding NUOVE (temporanee), e le posizioni attuali con il GPS del dispositivo. Nessuna risoluzione
 * viene quindi memorizzata (termini d'uso Mapbox §2.7.2).
 * Il carattere «solo testo» è garantito dalla lista dei campi ammessi in `sanitizeEndpoint`: anche dati letti dallo
 * storage con altri campi (es. le coordinate della versione 1) non vengono mai riscritti.
 */
export const RECENT_ROUTES_KEY = "tappafurba.recent-routes.v1";
/** Versione 2: solo testi. La versione 1 conservava anche le coordinate: viene migrata (testi) e riscritta all'avvio. */
export const RECENT_ROUTES_VERSION = 2;
/** Tragitti conservati (i più «frequenti» ne mostrano `RECENT_ROUTES_SHOWN`). */
export const RECENT_ROUTES_MAX = 10;
export const RECENT_ROUTES_SHOWN = 3;
/** Su schermi larghi (2xl, Full HD) la Home mostra fino a sei tragitti, su due colonne dal quarto. */
export const RECENT_ROUTES_SHOWN_WIDE = 6;
/** Testo salvato (e mostrato) per un estremo preso dal GPS: mai l'indirizzo ricavato dalla posizione. */
export const CURRENT_POSITION_TEXT = "Posizione attuale";

/** Un estremo del tragitto: il testo del campo, oppure la posizione attuale del dispositivo. */
export interface RecentEndpoint {
  text: string;
  /** true se l'estremo era la posizione GPS: al tocco si rilegge dal dispositivo, non da Mapbox. */
  current?: true;
}

export interface RecentRoute {
  /** Chiave del tragitto: testi di partenza e destinazione normalizzati. */
  id: string;
  origin: RecentEndpoint;
  destination: RecentEndpoint;
  /** Il carburante dell'ultima ricerca su questo tragitto. */
  fuelType: SearchFuelType;
  /** Quante volte è stato cercato. */
  count: number;
  /** Ultima ricerca (ms da epoch). */
  lastAt: number;
}

const FUELS = FUEL_OPTIONS.map((option) => option.value);
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

const norm = (label: string) =>
  label
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
const endpointKey = (endpoint: RecentEndpoint | string) => (typeof endpoint === "string" ? norm(endpoint) : endpoint.current ? "@gps" : norm(endpoint.text));
export const routeId = (origin: RecentEndpoint | string, destination: RecentEndpoint | string) => `${endpointKey(origin)}>${endpointKey(destination)}`;

/**
 * Lista dei campi ammessi: solo `text` e `current`. Legge anche il vecchio `label` della versione 1, ma scarta
 * qualunque altro campo (lon, lat, id…): il risultato non può contenere coordinate.
 */
function sanitizeEndpoint(raw: unknown): RecentEndpoint | null {
  if (!isRecord(raw)) return null;
  if (raw.current === true) return { text: CURRENT_POSITION_TEXT, current: true };
  const text = typeof raw.text === "string" ? raw.text : typeof raw.label === "string" ? raw.label : null;
  if (text === null || text.trim() === "" || text.length > 160) return null;
  return { text: text.trim() };
}

/** Ricostruisce l'elenco da dati di provenienza qualunque: le voci non valide si scartano una per una. */
export function sanitizeRecentRoutes(raw: unknown): RecentRoute[] {
  if (!Array.isArray(raw)) return [];
  const out = new Map<string, RecentRoute>();
  for (const item of raw) {
    if (!isRecord(item)) continue;
    const origin = sanitizeEndpoint(item.origin);
    const destination = sanitizeEndpoint(item.destination);
    if (!origin || !destination) continue;
    const fuelType = FUELS.includes(item.fuelType as SearchFuelType) ? (item.fuelType as SearchFuelType) : "benzina";
    const count = typeof item.count === "number" && Number.isInteger(item.count) && item.count >= 1 ? Math.min(item.count, 9999) : 1;
    const lastAt = typeof item.lastAt === "number" && Number.isFinite(item.lastAt) && item.lastAt >= 0 ? item.lastAt : 0;
    const id = routeId(origin, destination);
    if (!out.has(id)) out.set(id, { id, origin, destination, fuelType, count, lastAt });
  }
  return rank([...out.values()]).slice(0, RECENT_ROUTES_MAX);
}

/** Più cercati prima; a pari conteggio il più recente. */
const rank = (routes: RecentRoute[]) => [...routes].sort((a, b) => b.count - a.count || b.lastAt - a.lastAt);

/** Forma salvata: i campi sono elencati uno per uno (nessuno spread di oggetti arrivati da fuori). */
const storedEndpoint = (endpoint: RecentEndpoint) => (endpoint.current ? { text: endpoint.text, current: true } : { text: endpoint.text });
const toStored = (route: RecentRoute) => ({
  origin: storedEndpoint(route.origin),
  destination: storedEndpoint(route.destination),
  fuelType: route.fuelType,
  count: route.count,
  lastAt: route.lastAt,
});
const serialize = (routes: RecentRoute[]) => JSON.stringify({ version: RECENT_ROUTES_VERSION, routes: routes.map(toStored) });

// ---- storage: copia in memoria se localStorage manca o è bloccato; snapshot stabile per `useSyncExternalStore`.
let memoryRaw: string | null = null;
let cachedRaw: string | null | undefined;
let cachedValue: RecentRoute[] = [];
const listeners = new Set<() => void>();

function readRaw(): string | null {
  try {
    return localStorage.getItem(RECENT_ROUTES_KEY) ?? memoryRaw;
  } catch {
    return memoryRaw;
  }
}

function writeRaw(raw: string | null): void {
  memoryRaw = raw;
  try {
    if (raw === null) localStorage.removeItem(RECENT_ROUTES_KEY);
    else localStorage.setItem(RECENT_ROUTES_KEY, raw);
  } catch {
    // storage pieno o bloccato: resta la copia in memoria
  }
  for (const listener of listeners) listener();
}

/** Elenco ordinato per frequenza (al più `RECENT_ROUTES_MAX`). */
export function loadRecentRoutes(): RecentRoute[] {
  const raw = readRaw();
  if (raw === cachedRaw) return cachedValue;
  cachedRaw = raw;
  try {
    const parsed: unknown = raw === null ? null : JSON.parse(raw);
    // La versione 1 (con coordinate) si legge solo come testi: le coordinate non passano mai da sanitizeEndpoint.
    cachedValue = isRecord(parsed) && (parsed.version === RECENT_ROUTES_VERSION || parsed.version === 1) ? sanitizeRecentRoutes(parsed.routes) : [];
  } catch {
    cachedValue = [];
  }
  return cachedValue;
}

/** Registra una ricerca riuscita: incrementa il conteggio del tragitto o lo aggiunge (in coda scarta il meno cercato). */
export function recordRecentRoute(entry: { origin: RecentEndpoint; destination: RecentEndpoint; fuelType: SearchFuelType }, now: number = Date.now()): void {
  const origin = sanitizeEndpoint(entry.origin);
  const destination = sanitizeEndpoint(entry.destination);
  if (!origin || !destination) return;
  const id = routeId(origin, destination);
  const current = loadRecentRoutes();
  const existing = current.find((route) => route.id === id);
  const updated: RecentRoute = existing
    ? { ...existing, origin, destination, fuelType: entry.fuelType, count: Math.min(existing.count + 1, 9999), lastAt: now }
    : { id, origin, destination, fuelType: entry.fuelType, count: 1, lastAt: now };
  // La nuova voce (conteggio 1) non deve essere scartata subito a favore di vecchie voci con lo stesso conteggio: si
  // tolgono prima le meno cercate e, a pari conteggio, le più vecchie.
  const next = rank([updated, ...current.filter((route) => route.id !== id)]).slice(0, RECENT_ROUTES_MAX);
  writeRaw(serialize(next));
}

/**
 * Migrazione dalla versione 1 (che conservava anche le coordinate): si tengono i testi e si RISCRIVE lo storage senza
 * coordinate. Si esegue all'avvio dell'app; è innocua se non c'è nulla da migrare.
 */
export function migrateLegacyRecentRoutes(): void {
  try {
    const raw = readRaw();
    if (raw === null) return;
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed) || parsed.version !== 1) return;
    writeRaw(serialize(sanitizeRecentRoutes(parsed.routes)));
  } catch {
    // dati illeggibili: si lasciano (loadRecentRoutes li tratta come vuoti)
  }
}

/** Cancella tutto lo storico. */
export function clearRecentRoutes(): void {
  writeRaw(null);
}

/** Solo per i test: azzera la copia in memoria e la cache. */
export function resetRecentRoutesMemory(): void {
  memoryRaw = null;
  cachedRaw = undefined;
  cachedValue = [];
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === RECENT_ROUTES_KEY || event.key === null) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/** I tragitti salvati, aggiornati quando cambiano (anche da un'altra scheda). */
export function useRecentRoutes(): RecentRoute[] {
  return useSyncExternalStore(subscribe, loadRecentRoutes, () => []);
}

migrateLegacyRecentRoutes();

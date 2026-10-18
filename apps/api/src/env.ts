import "dotenv/config";
import { z } from "zod";

/** Una variabile lasciata vuota in .env (es. `MAPBOX_SERVER_TOKEN=`) vale come non impostata. */
const blankToUndefined = (value: unknown) => (typeof value === "string" && value.trim() === "" ? undefined : value);
const optionalString = z.preprocess(blankToUndefined, z.string().optional());
const optionalEnum = <T extends [string, ...string[]]>(values: T) =>
  z.preprocess(blankToUndefined, z.enum(values).optional());
/** `false`, `true` oppure il numero di proxy fidati (es. `1` dietro nginx): vedi TRUST_PROXY. */
const trustProxy = z
  .preprocess(blankToUndefined, z.string().regex(/^(true|false|[0-9]+)$/, "deve essere false, true oppure un numero di proxy").default("false"))
  .transform((value): boolean | number => (value === "true" ? true : value === "false" ? false : Number(value)));

/**
 * Validazione centralizzata delle variabili d'ambiente: l'API rifiuta di
 * avviarsi se manca un valore obbligatorio, invece di fallire più avanti
 * con un errore criptico. Nessun segreto ha un default hardcoded.
 */
const envObject = z.object({
  NODE_ENV: z.string().optional(),
  DATABASE_URL: z.string().min(1, "DATABASE_URL è obbligatoria"),
  API_PORT: z.coerce.number().int().positive().default(3001),
  API_HOST: z.string().default("0.0.0.0"),
  CORS_ORIGIN: z.string().default("http://localhost:5173"),
  /**
   * Dietro un reverse proxy: il NUMERO di proxy fidati (`1` con nginx davanti all'API), altrimenti il rate limit vedrebbe
   * sempre l'IP del proxy. `true` si fida dell'intero header X-Forwarded-For, che il client può falsificare (e con nginx
   * `$proxy_add_x_forwarded_for` lo accoda): chi lo imposta aggira i limiti per IP. Usare `true` solo se nessun client
   * raggiunge l'API se non da un proxy che SOVRASCRIVE l'header.
   */
  TRUST_PROXY: trustProxy,
  /**
   * Segreto (almeno 32 caratteri) per `POST /ingest`, con `Authorization: Bearer …`. Senza, l'endpoint è disattivato:
   * l'ingestione si lancia con `pnpm ingest` o dal timer. Generalo con `openssl rand -hex 32`.
   */
  INGEST_TOKEN: z.preprocess(blankToUndefined, z.string().min(32, "INGEST_TOKEN: servono almeno 32 caratteri").optional()),

  MIMIT_ANAGRAFICA_URL: z
    .string()
    .url()
    .default("https://www.mimit.gov.it/images/exportCSV/anagrafica_impianti_attivi.csv"),
  MIMIT_PREZZI_URL: z.string().url().default("https://www.mimit.gov.it/images/exportCSV/prezzo_alle_8.csv"),

  /**
   * Prezzi in tempo reale dal sito ufficiale Osservaprezzi (il file giornaliero MIMIT è indietro di 1-2 giorni).
   * 'off' lascia solo il file giornaliero.
   */
  LIVE_PRICES_PROVIDER: z.preprocess(blankToUndefined, z.enum(["ospz", "off"]).default("ospz")),
  LIVE_PRICES_BASE_URL: z.string().url().default("https://carburanti.mise.gov.it/ospzApi"),
  /** Identifica TappaFurba verso il ministero (CSV anagrafica/prezzi e prezzi in tempo reale): personalizzabile con un contatto. */
  LIVE_PRICES_USER_AGENT: z.string().default("TappaFurba/0.1 (app gratuita per confrontare i prezzi dei carburanti; dati MIMIT Osservaprezzi)"),
  /** Un riquadro aggiornato da meno di N minuti non viene richiesto di nuovo. */
  LIVE_PRICES_TTL_MIN: z.coerce.number().int().positive().default(60),
  /** Tetto di chiamate alla fonte per singola ricerca. */
  LIVE_PRICES_MAX_TILES_PER_SEARCH: z.coerce.number().int().positive().default(40),
  /** Attesa massima degli aggiornamenti prima di rispondere con i dati disponibili. */
  LIVE_PRICES_DEADLINE_MS: z.coerce.number().int().positive().default(10_000),
  /** Chiamate simultanee alla fonte, sommate su tutte le ricerche. */
  LIVE_PRICES_CONCURRENCY: z.coerce.number().int().positive().max(8).default(3),

  /** Token Mapbox usato SOLO lato server (Directions + Geocoding). Mai esposto al browser. */
  MAPBOX_SERVER_TOKEN: optionalString,
  /** Se omessi: 'mapbox' quando il token è presente, altrimenti 'fixture' / 'mock' (sviluppo senza chiavi). */
  GEOCODING_PROVIDER: optionalEnum(["mapbox", "fixture"]),
  ROUTING_PROVIDER: optionalEnum(["mapbox", "mock"]),

  /** Kill switch: oltre la soglia soft si disabilita il ricalcolo con routing reale (resta il proxy). */
  DIRECTIONS_SOFT_LIMIT: z.coerce.number().int().positive().default(80_000),
  /** Oltre la soglia hard si smette di chiamare Directions (free tier Mapbox: 100.000/mese). */
  DIRECTIONS_HARD_LIMIT: z.coerce.number().int().positive().default(98_000),

  /**
   * Tetto mensile delle chiamate di Geocoding (autocomplete e reverse) in uscita verso Mapbox, sommate su tutti gli IP: oltre
   * questa soglia l'API smette di chiamare Mapbox (503). Il piano gratuito del Temporary Geocoding è di 100.000 al mese.
   */
  GEOCODING_HARD_LIMIT: z.coerce.number().int().positive().default(95_000),

  SEARCH_RATE_LIMIT_PER_MIN: z.coerce.number().int().positive().default(20),
  GEOCODE_RATE_LIMIT_PER_MIN: z.coerce.number().int().positive().default(120),
});

/** Relazioni tra campi: una soglia soft oltre la hard renderebbe inutile il kill switch. */
const envSchema = envObject.superRefine((value, context) => {
  // Un token pubblico (pk.) usato come token del server: in produzione è un errore (vedi la nota in parseEnv).
  if (value.NODE_ENV === "production" && value.MAPBOX_SERVER_TOKEN?.startsWith("pk.")) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["MAPBOX_SERVER_TOKEN"],
      message: "MAPBOX_SERVER_TOKEN è un token PUBBLICO (pk.): in produzione serve un token segreto dedicato al server (sk.)",
    });
  }
  if (value.DIRECTIONS_SOFT_LIMIT > value.DIRECTIONS_HARD_LIMIT) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["DIRECTIONS_SOFT_LIMIT"],
      message: "DIRECTIONS_SOFT_LIMIT non può superare DIRECTIONS_HARD_LIMIT",
    });
  }
});

export type Env = z.infer<typeof envSchema>;

/** Valida un insieme di variabili (per i test); l'API usa `env`, letto da process.env all'avvio. */
export function parseEnv(source: NodeJS.ProcessEnv): Env {
  const parsed = envSchema.parse(source);
  // Un token `pk.` ha solo scope pubblici ed è pensato per il browser: se è anche quello del server, chi lo ricava da un
  // bundle o da una copia dell'ambiente può usarlo dal proprio computer. In sviluppo si avvisa, in produzione si rifiuta.
  if (parsed.MAPBOX_SERVER_TOKEN?.startsWith("pk.")) {
    console.warn("ATTENZIONE: MAPBOX_SERVER_TOKEN è un token pubblico (pk.). Crea un token segreto (sk.) dedicato al server: in produzione l'API rifiuta di avviarsi.");
  }
  return parsed;
}

export const env: Env = parseEnv(process.env);

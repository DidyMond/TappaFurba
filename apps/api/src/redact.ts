/**
 * Difesa in profondità sui log: i provider già non mettono mai l'URL (che contiene `access_token`) nei loro errori, ma un
 * errore nativo imprevisto (fetch, DNS, timeout) potrebbe portarlo nel messaggio o nello stack. Tutto ciò che arriva ai log
 * passa da qui.
 */
const ACCESS_TOKEN_PARAM = /(access_token=)[^&\s"'#)]+/gi;
/** Token Mapbox: `pk.`/`sk.`/`tk.` seguito da un JWT (segmenti separati da punti). */
const MAPBOX_TOKEN = /\b[pst]k\.[A-Za-z0-9_-]{16,}(?:\.[A-Za-z0-9_-]+)*/g;

export function redactSecrets(text: string): string {
  return text.replace(ACCESS_TOKEN_PARAM, "$1[REDACTED]").replace(MAPBOX_TOKEN, "[REDACTED_TOKEN]");
}

/** Copia di un valore da loggare con ogni stringa ripulita (profondità e dimensione limitate: sono solo log). */
export function redactDeep(value: unknown, depth = 0): unknown {
  if (typeof value === "string") return redactSecrets(value);
  if (value === null || typeof value !== "object" || depth > 4) return value;
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => redactDeep(item, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) out[key] = redactDeep(item, depth + 1);
  return out;
}

/**
 * Per il logger: ripulisce i campi dell'oggetto loggato TRANNE `req`, `res` ed `err`, che (formatter e serializzatori)
 * hanno il loro serializzatore e non vanno clonati prima: sono oggetti di Fastify, non dati semplici.
 */
export function redactLogObject(object: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(object)) {
    out[key] = key === "req" || key === "res" || key === "err" ? value : redactDeep(value);
  }
  return out;
}

/**
 * Per `hooks.logMethod` di pino: i messaggi (`msg`) non passano né dal formatter né dai serializzatori, e quando si logga
 * un `Error` pino ne copia il messaggio nel campo `msg`. Qui si ripuliscono le stringhe e si sposta l'errore sotto `err`
 * (così lo gestisce `serializeError`) con il messaggio già ripulito.
 */
export function redactLogArguments(args: unknown[]): unknown[] {
  const [first, ...rest] = args;
  if (first instanceof Error) {
    const message = typeof rest[0] === "string" ? rest.shift() : first.message;
    return [{ err: first }, redactSecrets(String(message)), ...rest.map((item) => (typeof item === "string" ? redactSecrets(item) : item))];
  }
  return args.map((item) => (typeof item === "string" ? redactSecrets(item) : item));
}

/** Serializzatore degli errori per il logger: tipo, messaggio e stack, senza segreti (compresa la `cause`). */
export function serializeError(error: unknown): { [key: string]: unknown; type: string; message: string; stack: string } {
  if (!(error instanceof Error)) return { type: "NonError", message: redactSecrets(String(error)), stack: "" };
  const serialized: { [key: string]: unknown; type: string; message: string; stack: string } = {
    type: error.name,
    message: redactSecrets(error.message),
    stack: error.stack ? redactSecrets(error.stack) : "",
  };
  if (error.cause !== undefined) serialized.cause = serializeError(error.cause);
  return serialized;
}

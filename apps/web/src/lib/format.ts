const decimal = (digits: number) =>
  new Intl.NumberFormat("it-IT", { minimumFractionDigits: digits, maximumFractionDigits: digits });

const formatters = { 0: decimal(0), 1: decimal(1), 2: decimal(2), 3: decimal(3) } as const;

/** Prezzo al litro, es. "1,862". */
export const formatPrice = (value: number) => formatters[3].format(value);

/** Importo in euro, es. "€ 12,31". */
export const formatEuro = (value: number) => `€ ${formatters[2].format(Math.abs(value))}`;

export const formatKm = (value: number) => `${formatters[1].format(value)} km`;

export function formatDetourMinutes(minutes: number): string {
  return minutes < 1 ? "<1 min" : `${formatters[0].format(minutes)} min`;
}

/** Durata complessiva, es. "2 h 33 min". */
export function formatDuration(totalMinutes: number): string {
  const rounded = Math.round(totalMinutes);
  const hours = Math.floor(rounded / 60);
  const minutes = rounded % 60;
  return hours > 0 ? `${hours} h ${minutes} min` : `${minutes} min`;
}

/** Durata compatta per la capsula sulla mappa, es. "2h 39m". */
export function formatDurationCompact(totalMinutes: number): string {
  const rounded = Math.round(totalMinutes);
  const hours = Math.floor(rounded / 60);
  const minutes = rounded % 60;
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

/** Data e ora locali, es. "28 set 2026, 21:13". */
export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(
    new Date(iso),
  );
}

/** Solo giorno e mese, es. "27 set". */
export function formatShortDate(iso: string): string {
  return new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "short" }).format(new Date(iso));
}

/**
 * Quando è stato usato per ultimo un tragitto salvato: «oggi», «ieri» o la data breve («3 ott», con l'anno se non è
 * quello corrente). Senza data valida (0 o non numero) restituisce null.
 */
export function formatLastUsed(timestampMs: number, now: number = Date.now()): string | null {
  if (!Number.isFinite(timestampMs) || timestampMs <= 0) return null;
  const day = (ms: number) => {
    const d = new Date(ms);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  };
  const diffDays = Math.round((day(now) - day(timestampMs)) / 86_400_000);
  if (diffDays === 0) return "oggi";
  if (diffDays === 1) return "ieri";
  const sameYear = new Date(timestampMs).getFullYear() === new Date(now).getFullYear();
  return new Intl.DateTimeFormat("it-IT", sameYear ? { day: "numeric", month: "short" } : { day: "numeric", month: "short", year: "numeric" }).format(new Date(timestampMs));
}

/** Importo con segno esplicito per i valori negativi, es. "€ 15,80" o "−€ 2,00" (meno tipografico). */
export function formatSignedEuro(value: number): string {
  const text = `€ ${formatters[2].format(Math.abs(value))}`;
  return value < 0 ? `−${text}` : text;
}

/** Differenza di prezzo al litro con segno, es. "−0,160" / "+0,150" (€/L). */
export function formatPriceDifference(value: number): string {
  const text = formatters[3].format(Math.abs(value));
  if (value < 0) return `−${text}`;
  return value > 0 ? `+${text}` : text;
}

/** Percentuale con segno e un decimale, es. "−7,4%" / "+3,0%". */
export function formatSignedPercent(value: number): string {
  const text = `${formatters[1].format(Math.abs(value))}%`;
  if (value < 0) return `−${text}`;
  return value > 0 ? `+${text}` : text;
}

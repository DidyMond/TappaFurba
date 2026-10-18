import manifest from "./brands.json";

/**
 * Loghi delle bandiere dei distributori: file statici in `public/brands`, scaricati a mano da MIMIT con
 * `pnpm --filter @tappafurba/web fetch:brands` (vedi docs/ATTRIBUTION.md). A runtime non c'è nessun fetch della fonte: il
 * nome della bandiera si cerca in `src/lib/brands.json` (generato dallo script, incluso nel bundle) e, se c'è, l'immagine è un file del nostro dominio.
 * Senza logo (bandiera sconosciuta, segnaposto generico del Ministero escluso) l'avatar resta sulle iniziali.
 */
export const BRAND_ATTRIBUTION = manifest.attribution;

/**
 * Chiave di confronto del nome: Unicode NFC, spazi ai lati tolti, minuscole, spazi multipli ridotti a uno.
 * DEVE restare identica a `normalizeBrand` di `scripts/lib/brands.mjs` (un test confronta le due).
 */
export function normalizeBrand(name: string): string {
  return name.normalize("NFC").trim().toLowerCase().replace(/\s+/g, " ");
}

const files = manifest.brands as Record<string, string>;

/** Il file (es. `1.png`) del logo di una bandiera, o `null` se non ne ha uno. */
export function brandLogoFile(bandiera: string): string | null {
  const key = normalizeBrand(bandiera);
  return Object.prototype.hasOwnProperty.call(files, key) ? files[key]! : null;
}

/** L'indirizzo del logo (`/brands/1.png`, stesso dominio dell'app), o `null` se la bandiera non ha un logo. */
export function brandLogoUrl(bandiera: string): string | null {
  const file = brandLogoFile(bandiera);
  return file ? `/brands/${file}` : null;
}

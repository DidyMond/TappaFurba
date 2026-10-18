// Logica pura (senza rete né file) di `fetch-brands.mjs`: normalizzazione dei nomi, scelta dei loghi, ricompressione.
// Sta qui, a parte, perché si prova nei test con un payload finto (nessuna chiamata a MIMIT, mai).
import { createHash } from "node:crypto";

export const SOURCE_URL = "https://carburanti.mise.gov.it/ospzApi/registry/alllogos";
export const ATTRIBUTION = "Loghi: marchi dei rispettivi titolari, forniti dall'Osservaprezzi Carburanti del MIMIT.";

/**
 * Il segnaposto generico del Ministero (una «pompa grigia») è il «logo» di questa bandiera: tutte le bandiere con la stessa
 * immagine (oggi anche Som/Omv) non hanno un logo vero e restano sulle iniziali. Se la bandiera di riferimento sparisse dalla
 * fonte, lo script si ferma invece di includere i segnaposto senza accorgersene.
 */
export const PLACEHOLDER_REFERENCE = "Pompe Bianche";

/**
 * Chiave di confronto del nome di una bandiera: Unicode NFC (lettere accentate in forma composta), spazi ai lati tolti,
 * minuscole, spazi multipli (anche non separabili) ridotti a uno. DEVE restare identica a `normalizeBrand` in
 * `src/lib/brandLogos.ts` (un test confronta le due).
 */
export function normalizeBrand(name) {
  return String(name).normalize("NFC").trim().toLowerCase().replace(/\s+/g, " ");
}

export const sha256 = (data) => createHash("sha256").update(data).digest("hex");

/**
 * Sceglie i loghi da tenere dalla risposta di `registry/alllogos`.
 * @param payload `{ loghi: [{ bandieraId, bandiera, logoMarkerList: [{ tipoFile, content (base64 PNG) }] }] }`
 * @returns `{ entries, excluded }`: `entries` = [{ id, name, key, png }] (PNG decodificato), `excluded` = nomi scartati per motivo.
 */
export function selectLogos(payload) {
  if (!payload || !Array.isArray(payload.loghi)) throw new Error("Risposta inattesa: manca `loghi`");
  const logoOf = (flag) => {
    const marker = (flag.logoMarkerList ?? []).find((m) => m.tipoFile === "logo");
    return marker?.content ? Buffer.from(marker.content, "base64") : null;
  };

  const reference = payload.loghi.find((flag) => normalizeBrand(flag.bandiera) === normalizeBrand(PLACEHOLDER_REFERENCE));
  const referenceLogo = reference ? logoOf(reference) : null;
  if (!referenceLogo) throw new Error(`Manca il logo di riferimento del segnaposto («${PLACEHOLDER_REFERENCE}»): la fonte è cambiata, controlla a mano`);
  const placeholderHash = sha256(referenceLogo);

  const entries = [];
  const excluded = { placeholder: [], noLogo: [], collisions: [] };
  const taken = new Map();
  for (const flag of [...payload.loghi].sort((a, b) => a.bandieraId - b.bandieraId)) {
    const png = logoOf(flag);
    if (!png) {
      excluded.noLogo.push(flag.bandiera.trim());
      continue;
    }
    if (sha256(png) === placeholderHash) {
      excluded.placeholder.push(flag.bandiera.trim());
      continue;
    }
    const key = normalizeBrand(flag.bandiera);
    if (taken.has(key)) {
      // Due bandiere con lo stesso nome dopo la normalizzazione: vale la prima (id più basso).
      excluded.collisions.push(`${flag.bandiera.trim()} (#${flag.bandieraId}) = #${taken.get(key)}`);
      continue;
    }
    taken.set(key, flag.bandieraId);
    entries.push({ id: flag.bandieraId, name: flag.bandiera.trim(), key, png });
  }
  return { entries, excluded };
}

/**
 * PNG a palette ricompresso con sharp (i loghi sono 50×50 a tinte piatte: la palette pesa molto meno). Se per un'immagine
 * particolare la palette pesasse di più dell'originale, si tiene l'originale. Le dimensioni non cambiano.
 */
export async function compressLogo(sharp, png) {
  const palette = await sharp(png).png({ palette: true, quality: 100, effort: 10, compressionLevel: 9, dither: 0 }).toBuffer();
  return palette.length < png.length ? palette : png;
}

/** `brands.json`: nome normalizzato → file, con la provenienza (data e impronta della fonte) e gli esclusi. */
export function buildManifest({ entries, excluded, sha, downloadedAt }) {
  return {
    source: SOURCE_URL,
    downloadedAt,
    sha256: sha,
    attribution: ATTRIBUTION,
    count: entries.length,
    excluded,
    brands: Object.fromEntries(entries.map((entry) => [entry.key, `${entry.id}.png`])),
  };
}

// Scarica i loghi delle bandiere dei distributori dall'Osservaprezzi Carburanti del MIMIT e li salva in apps/web/public/brands.
// Uso (A MANO, quando serve rinfrescarli; i file generati si committano come le icone):
//   pnpm --filter @tappafurba/web fetch:brands                    # una sola GET a MIMIT
//   pnpm --filter @tappafurba/web fetch:brands -- --from-file x.json   # rilegge una copia salvata della risposta (nessuna rete)
//
//   public/brands/{bandieraId}.png   il tipoFile «logo» (50×50), ricompresso con sharp (PNG a palette)
//   src/lib/brands.json              { source, downloadedAt, sha256, attribution, count, excluded, brands: nome normalizzato → file }
//                                    (in src, non in public: lo importa il codice, e Vite non permette di importare da public)
//
// Esclusi: il segnaposto generico del Ministero (la «pompa grigia» di Pompe Bianche e Som/Omv) e le bandiere senza logo: per
// loro l'app resta sulle iniziali. La build e la CI NON chiamano mai MIMIT e a runtime non c'è nessun fetch della fonte.
// Dettagli e licenza (marchi di terzi): docs/ATTRIBUTION.md.
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { buildManifest, compressLogo, selectLogos, sha256, SOURCE_URL } from "./lib/brands.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, "../public/brands");
const manifestPath = resolve(here, "../src/lib/brands.json");
const USER_AGENT = "TappaFurba/0.1 (app gratuita per confrontare i prezzi dei carburanti; fetch:brands, una tantum a mano)";

const fromFile = process.argv.includes("--from-file") ? process.argv[process.argv.indexOf("--from-file") + 1] : null;

let body;
if (fromFile) {
  body = await readFile(resolve(fromFile));
  console.log(`Letta la copia locale ${fromFile} (nessuna rete)`);
} else {
  // Una sola GET; solo se la connessione cade a metà dei 10 MB si riprova (al massimo 3 tentativi in tutto, con pausa).
  for (let attempt = 1; ; attempt++) {
    try {
      console.log(`GET ${SOURCE_URL}${attempt > 1 ? ` (tentativo ${attempt})` : ""}`);
      const response = await fetch(SOURCE_URL, { headers: { Accept: "application/json", "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(180_000) });
      if (!response.ok) throw new Error(`MIMIT ha risposto HTTP ${response.status}`);
      body = Buffer.from(await response.arrayBuffer());
      break;
    } catch (error) {
      if (attempt >= 3 || /HTTP 4\d\d/.test(String(error.message))) throw error;
      console.log(`  interrotta (${error.cause?.code ?? error.message}): riprovo tra 10 s`);
      await new Promise((resolveWait) => setTimeout(resolveWait, 10_000));
    }
  }
}

const payload = JSON.parse(body.toString("utf8"));
const { entries, excluded } = selectLogos(payload);

// Si riparte da una cartella pulita: una bandiera sparita dalla fonte non lascia il suo file.
await mkdir(out, { recursive: true });
for (const name of await readdir(out)) if (/\.png$/.test(name)) await rm(resolve(out, name));

let rawBytes = 0;
let writtenBytes = 0;
for (const entry of entries) {
  const png = await compressLogo(sharp, entry.png);
  rawBytes += entry.png.length;
  writtenBytes += png.length;
  await writeFile(resolve(out, `${entry.id}.png`), png);
}
const manifest = buildManifest({ entries, excluded, sha: sha256(body), downloadedAt: new Date().toISOString() });
await writeFile(manifestPath, JSON.stringify(manifest, null, 1) + "\n");

console.log(`${entries.length} loghi salvati in public/brands (${(rawBytes / 1024).toFixed(0)} KB grezzi → ${(writtenBytes / 1024).toFixed(0)} KB)`);
console.log(`esclusi: ${excluded.placeholder.length} segnaposto (${excluded.placeholder.join(", ")}), ${excluded.noLogo.length} senza logo, ${excluded.collisions.length} nomi doppi`);
console.log(`sha256 della fonte: ${manifest.sha256}`);

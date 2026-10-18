// Verifica la build della PWA (dopo `pnpm build`): service worker, manifest, icone e regole di cache.
// Uso: pnpm --filter @tappafurba/web verify:pwa      (esce con codice 1 se qualcosa non va)
import { readFile, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const dist = resolve(dirname(fileURLToPath(import.meta.url)), "../dist");
const failures = [];
const check = (condition, message) => {
  if (!condition) failures.push(message);
  console.log(`${condition ? "ok  " : "FAIL"} ${message}`);
};
const exists = (file) => stat(resolve(dist, file)).then((s) => s.isFile(), () => false);
const text = (file) => readFile(resolve(dist, file), "utf8");

// --- file prodotti
check(await exists("sw.js"), "dist/sw.js esiste");
check(await exists("manifest.webmanifest"), "dist/manifest.webmanifest esiste");
check(await exists("index.html"), "dist/index.html esiste");

// --- manifest
const manifest = JSON.parse(await text("manifest.webmanifest"));
check(manifest.name === "TappaFurba" && manifest.short_name === "TappaFurba", "manifest: name e short_name «TappaFurba»");
check(manifest.description === "Trova il carburante al minor costo sul tuo tragitto", "manifest: description");
check(manifest.display === "standalone", "manifest: display standalone");
check(manifest.orientation === "portrait", "manifest: orientation portrait");
check(manifest.start_url === "/", "manifest: start_url «/»");
check(manifest.theme_color === "#059669", "manifest: theme_color #059669 (primary)");
check(manifest.background_color === "#f8f9ff", "manifest: background_color #f8f9ff (surface)");

/** Dimensioni di un PNG dal suo header IHDR (nessuna dipendenza). */
async function pngSize(file) {
  const buffer = await readFile(resolve(dist, file));
  const isPng = buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  return isPng ? { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) } : null;
}
for (const size of [192, 512]) {
  const icon = manifest.icons?.find((i) => i.sizes === `${size}x${size}` && i.type === "image/png" && i.purpose === "any");
  const dimensions = icon ? await pngSize(icon.src) : null;
  check(dimensions?.width === size && dimensions?.height === size, `manifest: icona PNG ${size}x${size} presente e della misura giusta`);
}
const maskable = manifest.icons?.find((i) => i.purpose === "maskable");
const maskableSize = maskable ? await pngSize(maskable.src) : null;
check(maskableSize?.width === 512 && maskableSize?.height === 512, "manifest: icona maskable 512x512");
const appleTouch = await pngSize("apple-touch-icon.png");
check(appleTouch?.width === 180, "apple-touch-icon.png 180x180");
check(await exists("favicon.ico"), "favicon.ico esiste");
check(await exists("favicon.svg"), "favicon.svg esiste (il mark senza i puntini della rotta)");
check((await exists("robots.txt")) && /^User-agent:/m.test(await text("robots.txt")), "robots.txt valido (altrimenti il server restituirebbe index.html)");

// --- index.html
const html = await text("index.html");
check(/<link rel="manifest" href="\/manifest\.webmanifest"/.test(html), "index.html: link al manifest");
check(/<meta name="theme-color" content="#059669"/.test(html), "index.html: theme-color");
check(/<link rel="apple-touch-icon" href="\/apple-touch-icon\.png"/.test(html), "index.html: apple-touch-icon");
check(/media="print"\s+onload="this\.media='all'"/.test(html), "index.html: Google Fonts non bloccante per il rendering");

// --- SEO e anteprime social
const description = html.match(/<meta\s+name="description"\s+content="([^"]*)"/)?.[1] ?? "";
check(description.length >= 70 && description.length <= 160 && /distributore più economico lungo il percorso/.test(description), "index.html: meta description in italiano (≤160 caratteri) con la parola chiave di prodotto");
check(/<title>[^<]*carburante più conveniente lungo il percorso[^<]*<\/title>/i.test(html), "index.html: title con «carburante più conveniente lungo il percorso»");
for (const property of ["og:type", "og:site_name", "og:locale", "og:title", "og:description", "og:image:width", "og:image:alt"]) {
  check(new RegExp(`<meta\\s+property="${property}"\\s+content="[^"]+"`).test(html), `index.html: ${property}`);
}
check(/<meta property="og:locale" content="it_IT"/.test(html), "index.html: og:locale it_IT");
check(/<meta name="twitter:card" content="summary_large_image"/.test(html), "index.html: twitter:card");
const jsonLd = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)?.[1];
check(jsonLd !== undefined && JSON.parse(jsonLd)["@type"] === "WebApplication", "index.html: JSON-LD WebApplication valido");
const og = await pngSize("og-image.png");
check(og?.width === 1200 && og?.height === 630, "og-image.png 1200x630");

// --- service worker: shell in precache, dati mai in cache
const sw = await text("sw.js");
check(/precacheAndRoute/.test(sw) && sw.includes("index.html"), "sw.js: precache della shell (index.html incluso)");
check(/cleanupOutdatedCaches/.test(sw), "sw.js: pulizia delle cache vecchie a ogni deploy");
check(/NavigationRoute/.test(sw), "sw.js: fallback di navigazione sulla shell (/results, /settings… anche offline)");
// Le rotte dell'app (compresa /privacy) devono aprire la shell anche offline: nessuna deve finire nella denylist del fallback.
const denylist = [...(sw.match(/NavigationRoute\([^)]*\)\s*,\s*\{denylist:\[([^\]]*)\]/)?.[1] ?? "").matchAll(/\/(.+?)\/(?=,|$)/g)].map((m) => new RegExp(m[1]));
check(denylist.length > 0, "sw.js: la denylist del fallback di navigazione è leggibile (solo gli endpoint dati)");
for (const route of ["/", "/results", "/settings", "/privacy", "/station/abc/12"]) {
  check(!denylist.some((pattern) => pattern.test(route)), `sw.js: la rotta ${route} apre la shell anche offline (non è nella denylist)`);
}
for (const route of ["/search", "/geocode/autocomplete", "/health"]) {
  check(denylist.some((pattern) => pattern.test(route)), `sw.js: ${route} resta fuori dal fallback (è un endpoint dati)`);
}
check(/NetworkOnly/.test(sw), "sw.js: i dati usano NetworkOnly");
check(!/NetworkFirst/.test(sw), "sw.js: nessuna strategia NetworkFirst (che servirebbe prezzi vecchi offline)");
const precacheList = sw.match(/precacheAndRoute\(\[([\s\S]*?)\]/)?.[1] ?? "";
check(precacheList.length > 0 && !/MapCanvas/.test(precacheList), "sw.js: il chunk della mappa (Mapbox GL) non è nella precache");
check(!/\/(search|geocode)\b/.test(precacheList), "sw.js: nessun endpoint dati nella precache");
check(!/brands\//.test(precacheList), "sw.js: i loghi delle bandiere (brands/) non sono nella precache");
check(/tappafurba-brand-logos/.test(sw) && /CacheFirst/.test(sw), "sw.js: i loghi delle bandiere sono salvati a runtime con CacheFirst");
check(!(await exists("brands/brands.json")), "dist: nessun brands.json da scaricare (la mappa nome → file è nel bundle: nessun fetch della fonte)");
check(await exists("brands/1.png"), "dist: i loghi sono file statici in brands/");
check(/skipWaiting|clientsClaim/.test(sw), "sw.js: aggiornamento automatico (skipWaiting / clientsClaim)");

if (failures.length > 0) {
  console.error(`\n${failures.length} controlli falliti.`);
  process.exit(1);
}
console.log("\nBuild PWA verificata.");

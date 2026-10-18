// Genera le icone della PWA da assets/logo.svg (unica sorgente) in apps/web/public.
// Uso: pnpm --filter @tappafurba/web generate:icons   (i PNG generati sono committati: la build non dipende da sharp)
//
//   logo.svg                              copia del mark (usata dal banner d'installazione e dal manifest)
//   pwa-192x192.png, pwa-512x512.png      icone «any»: il logo com'è (angoli arrotondati trasparenti)
//   pwa-maskable-512x512.png              «maskable»: fondo a tutto campo + logo entro la zona sicura (80%)
//   apple-touch-icon.png (180x180)        iOS non ammette trasparenza: fondo a tutto campo, il sistema arrotonda
//   favicon.svg, favicon.ico              favicon: il mark SENZA i puntini della rotta (<g id="route-dots">), che a 16 px sono rumore, e con il pin
//                                         ingrandito di 1,3×;
//                                         .ico con due immagini PNG, 16x16 e 32x32
//
// Il mark è «Pin-goccia»: il pin di destinazione con la goccia di carburante in negativo e, sotto, i puntini della rotta.
//   og-image.png (1200x630)               anteprima per i social: logo, nome e claim su fondo scuro (tertiary)
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const here = dirname(fileURLToPath(import.meta.url));
const source = resolve(here, "../../../assets/logo.svg");
const out = resolve(here, "../public");

const svg = await readFile(source, "utf8");

// Il logo è un quadrato 200x200 con un rect arrotondato di sfondo (gradiente) e i segni sopra.
const ROUTE_DOTS = /<g id="route-dots">[\s\S]*?<\/g>/;
if (!ROUTE_DOTS.test(svg)) throw new Error("assets/logo.svg: manca <g id=\"route-dots\"> (serve per il favicon)");
const BACKGROUND_RECT = /<rect width="200" height="200" rx="44" fill="url\(#rf-grad\)"\/>/;
if (!BACKGROUND_RECT.test(svg)) throw new Error("assets/logo.svg è cambiato: aggiorna BACKGROUND_RECT in generate-icons.mjs");
/**
 * Il mark per il favicon (16/32 px): senza i puntini della rotta (nessun dettaglio sotto i 3 px) e con il pin ingrandito di 1,3×
 * attorno al suo centro (il pin occupa più della metà del lato: a 16 px resta un segno leggibile, non un puntino).
 */
const FAVICON_ZOOM = 1.3;
const faviconSvg = svg
  .replace(ROUTE_DOTS, "")
  .replace(BACKGROUND_RECT, (rect) => `${rect}<g transform="translate(100 100) scale(${FAVICON_ZOOM}) translate(-100 -105)">`)
  .replace(/<\/svg>\s*$/, "</g></svg>");
const defs = svg.match(/<defs>[\s\S]*?<\/defs>/)[0];
const marks = svg.replace(/^[\s\S]*?<\/defs>/, "").replace(BACKGROUND_RECT, "").replace(/<\/svg>\s*$/, "");

/** Stesso logo ma con fondo a tutto campo e un margine attorno ai segni (`padding` in unità del logo, su 200). */
const fullBleed = (padding) => {
  const start = -padding;
  const size = 200 + padding * 2;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${start} ${start} ${size} ${size}" width="${size}" height="${size}">` +
    `${defs}<rect x="${start}" y="${start}" width="${size}" height="${size}" fill="url(#rf-grad)"/>${marks}</svg>`
  );
};

const png = (markup, size) => sharp(Buffer.from(markup)).resize(size, size).png({ compressionLevel: 9 }).toBuffer();

/** ICO con più immagini PNG (supportato da tutti i browser moderni): `images` = [{ size, data }]. */
function ico(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // riservato
  header.writeUInt16LE(1, 2); // tipo: icona
  header.writeUInt16LE(images.length, 4);
  let offset = header.length + 16 * images.length;
  const entries = images.map(({ size, data }) => {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size, 0); // larghezza
    entry.writeUInt8(size, 1); // altezza
    entry.writeUInt16LE(1, 4); // piani
    entry.writeUInt16LE(32, 6); // bit per pixel
    entry.writeUInt32LE(data.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += data.length;
    return entry;
  });
  return Buffer.concat([header, ...entries, ...images.map((image) => image.data)]);
}

/** Anteprima social: fondo `tertiary` (#0F172A), logo a sinistra, nome e claim a destra (font di sistema: niente font da incorporare). */
const ogImage = () => {
  const font = "'Plus Jakarta Sans', Inter, 'Segoe UI', Arial, Helvetica, sans-serif";
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" width="1200" height="630">` +
    `<rect width="1200" height="630" fill="#0F172A"/>` +
    `<g transform="translate(90 125) scale(1.9)">${svg.replace(/^<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "")}</g>` +
    `<text x="520" y="285" font-family="${font}" font-size="92" font-weight="800" fill="#FFFFFF">TappaFurba</text>` +
    `<text x="522" y="360" font-family="${font}" font-size="38" font-weight="600" fill="#CBD5E1">Il carburante più conveniente</text>` +
    `<text x="522" y="412" font-family="${font}" font-size="38" font-weight="600" fill="#CBD5E1">lungo il percorso</text>` +
    `<text x="522" y="488" font-family="${font}" font-size="26" font-weight="500" fill="#10B981">Prezzi MIMIT Osservaprezzi · risparmio netto A→B</text>` +
    `</svg>`
  );
};

await mkdir(out, { recursive: true });
const files = {
  "logo.svg": Buffer.from(svg),
  "favicon.svg": Buffer.from(faviconSvg),
  "og-image.png": await sharp(Buffer.from(ogImage())).png({ compressionLevel: 9 }).toBuffer(),
  "pwa-192x192.png": await png(svg, 192),
  "pwa-512x512.png": await png(svg, 512),
  "pwa-maskable-512x512.png": await png(fullBleed(28), 512), // 200/256 = 78% < 80% della zona sicura
  "apple-touch-icon.png": await png(fullBleed(8), 180),
  "favicon.ico": ico([
    { size: 16, data: await png(faviconSvg, 16) },
    { size: 32, data: await png(faviconSvg, 32) },
  ]),
};
for (const [name, data] of Object.entries(files)) {
  await writeFile(resolve(out, name), data);
  console.log(`${name}  ${data.length} byte`);
}

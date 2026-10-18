// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";

const root = join(__dirname, "../../..");
const web = join(root, "apps/web");
const pub = (name: string) => join(web, "public", name);
const text = (path: string) => readFileSync(path, "utf8");
const logo = text(join(root, "assets/logo.svg"));

/** Pixel RGBA di un PNG. */
async function pixels(path: string | Buffer) {
  const { data, info } = await sharp(path).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const at = (x: number, y: number) => [...data.subarray((y * info.width + x) * 4, (y * info.width + x) * 4 + 4)] as [number, number, number, number];
  return { width: info.width, height: info.height, at };
}
const isWhite = ([r, g, b, a]: number[]) => a > 200 && r > 235 && g > 235 && b > 235;
const isNavy = ([r, g, b, a]: number[]) => a > 200 && r < 40 && g < 60 && b < 90;

describe("mark «Pin-goccia»: sorgente e derivati", () => {
  it("assets/logo.svg: gradiente #0284C7 → #10B981, pin bianco, goccia blu notte #0F172A, puntini della rotta in un gruppo a parte", () => {
    expect(logo).toMatch(/<stop offset="0%" stop-color="#0284C7"\/>/);
    expect(logo).toMatch(/<stop offset="100%" stop-color="#10B981"\/>/);
    expect(logo).toContain('<rect width="200" height="200" rx="44" fill="url(#rf-grad)"/>');
    expect(logo).toContain('d="M100 164 C100 164 54 124 54 92 A46 46 0 1 1 146 92 C146 124 100 164 100 164 Z" fill="#FFFFFF"'); // il pin
    expect(logo).toContain('d="M100 66 C100 66 82 90 82 101 A18 18 0 0 0 118 101 C118 90 100 66 100 66 Z" fill="#0F172A"'); // la goccia
    expect(logo).toMatch(/<g id="route-dots">[\s\S]*stroke-dasharray="1 16"[\s\S]*<\/g>/);
  });

  it("public/logo.svg è la copia del sorgente; public/favicon.svg è lo stesso mark senza i puntini della rotta", () => {
    expect(text(pub("logo.svg"))).toBe(logo);
    const favicon = text(pub("favicon.svg"));
    expect(favicon).not.toContain("route-dots");
    expect(favicon).toContain("M100 164 C100 164 54 124 54 92 A46 46 0 1 1 146 92 C146 124 100 164 100 164 Z"); // lo stesso pin
    expect(favicon).toContain("M100 66 C100 66 82 90 82 101"); // e la stessa goccia
    expect(favicon).toContain('<g transform="translate(100 100) scale(1.3) translate(-100 -105)">'); // ingrandito per i 16 px
  });

  it("nessun residuo del vecchio mark (rotta tratteggiata con freccia + disco con la «R») in sorgenti e pagina", () => {
    const old = ["M60 145 C60 120", "M125 55 L145 70", "M96 90 L102 90", 'r="26" fill="#0F172A"', 'stroke-dasharray="2 16"'];
    const files = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) return files(path);
        return /\.(tsx?|css|html|svg|mjs)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
      });
    const scanned = [...files(join(web, "src")), join(web, "index.html"), ...files(join(web, "scripts")), ...files(join(root, "assets")), pub("logo.svg"), pub("favicon.svg")];
    const hits = scanned.flatMap((file) => old.filter((fragment) => text(file).includes(fragment)).map((fragment) => `${file}: ${fragment}`));
    expect(hits).toEqual([]);
  });

  it("le icone PNG hanno le misure del manifest: 192, 512, maskable 512, apple-touch 180, OG 1200×630", async () => {
    for (const [name, w, h] of [["pwa-192x192.png", 192, 192], ["pwa-512x512.png", 512, 512], ["pwa-maskable-512x512.png", 512, 512], ["apple-touch-icon.png", 180, 180], ["og-image.png", 1200, 630]] as const) {
      const meta = await sharp(pub(name)).metadata();
      expect([name, meta.width, meta.height]).toEqual([name, w, h]);
    }
  });

  it("«any»: angoli arrotondati trasparenti, pin bianco e goccia blu notte al centro; maskable e apple-touch: fondo a tutto campo (angoli opachi)", async () => {
    const any = await pixels(pub("pwa-512x512.png"));
    expect(any.at(0, 0)[3]).toBe(0); // angolo trasparente
    expect(any.at(256, 192)[3]).toBe(255);
    expect(isWhite(any.at(256, 150))).toBe(true); // il pin, sopra la goccia
    expect(isNavy(any.at(256, 270))).toBe(true); // la goccia, al centro della testa del pin
    for (const name of ["pwa-maskable-512x512.png", "apple-touch-icon.png"]) {
      const full = await pixels(pub(name));
      for (const [x, y] of [[0, 0], [full.width - 1, 0], [0, full.height - 1], [full.width - 1, full.height - 1]] as const) expect([name, full.at(x, y)[3]]).toEqual([name, 255]);
    }
  });

  it("maskable: tutto il disegno (pixel bianchi o blu notte) sta nel cerchio della zona sicura (raggio 40% del lato)", async () => {
    const m = await pixels(pub("pwa-maskable-512x512.png"));
    const centre = m.width / 2;
    let farthest = 0;
    let markPixels = 0;
    for (let y = 0; y < m.height; y++) {
      for (let x = 0; x < m.width; x++) {
        const px = m.at(x, y);
        if (!isWhite(px) && !isNavy(px)) continue;
        markPixels++;
        farthest = Math.max(farthest, Math.hypot(x + 0.5 - centre, y + 0.5 - centre));
      }
    }
    expect(markPixels).toBeGreaterThan(5000); // il disegno c'è
    expect(farthest).toBeLessThanOrEqual(0.4 * m.width); // 204,8 px su 512
  });

  it("favicon.ico: due immagini PNG, 16×16 e 32×32, senza i puntini; a 16 px pin bianco e goccia restano distinguibili", async () => {
    const ico = readFileSync(pub("favicon.ico"));
    expect(ico.readUInt16LE(2)).toBe(1); // tipo icona
    expect(ico.readUInt16LE(4)).toBe(2); // due immagini
    const images = [0, 1].map((i) => {
      const entry = 6 + 16 * i;
      const size = ico.readUInt8(entry);
      const length = ico.readUInt32LE(entry + 8);
      const offset = ico.readUInt32LE(entry + 12);
      return { size, data: ico.subarray(offset, offset + length) };
    });
    expect(images.map((i) => i.size)).toEqual([16, 32]);
    for (const image of images) expect(image.data.subarray(1, 4).toString()).toBe("PNG");
    const small = await pixels(images[0]!.data);
    expect([small.width, small.height]).toEqual([16, 16]);
    let white = 0;
    let navy = 0;
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        const [r, g, b, a] = small.at(x, y);
        if (a > 200 && r > 200 && g > 200 && b > 200) white++; // chiaro (bordo del pin sfumato incluso)
        if (isNavy([r, g, b, a])) navy++;
      }
    }
    expect(white).toBeGreaterThanOrEqual(30); // il pin
    expect(navy).toBeGreaterThanOrEqual(5); // la goccia, ancora leggibile
  });
});

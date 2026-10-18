// @vitest-environment node
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildManifest, compressLogo, normalizeBrand as scriptNormalize, PLACEHOLDER_REFERENCE, selectLogos, sha256 } from "../scripts/lib/brands.mjs";
import { BRAND_ATTRIBUTION, brandLogoFile, brandLogoUrl, normalizeBrand } from "./lib/brandLogos";

const web = join(__dirname, "..");
const brandsDir = join(web, "public/brands");
const manifest = JSON.parse(readFileSync(join(web, "src/lib/brands.json"), "utf8"));

afterEach(() => vi.unstubAllGlobals());

describe("brandLogos — mappatura nome → file (nessuna rete)", () => {
  it("trova il logo per maiuscole, spazi ai lati e spazi multipli diversi", () => {
    const file = brandLogoFile("Agip Eni");
    expect(file).toMatch(/^\d+\.png$/);
    for (const variant of ["agip eni", "AGIP ENI", "  Agip Eni  ", "Agip   Eni", "agip eni", "Agip\tEni", "\nAGIP  eni "]) expect(brandLogoFile(variant)).toBe(file);
    expect(brandLogoUrl("Agip Eni")).toBe(`/brands/${file}`);
  });

  it("le lettere accentate valgono in forma composta e scomposta (NFC), con le maiuscole accentate", () => {
    expect(normalizeBrand("Caffè Carburanti")).toBe(normalizeBrand("Caffè Carburanti")); // è / e + accento
    expect(normalizeBrand("CAFFÈ")).toBe("caffè");
    expect(normalizeBrand("  Società   Petroli ")).toBe("società petroli");
  });

  it("bandiere senza logo: sconosciute, vuote e i segnaposto generici (Pompe Bianche, Som/Omv) → null (iniziali)", () => {
    for (const unknown of ["", "   ", "Bandiera inventata", "Pompe Bianche", "pompe bianche", "Som/Omv", "VULCANGAS"]) {
      expect(brandLogoFile(unknown)).toBeNull();
      expect(brandLogoUrl(unknown)).toBeNull();
    }
  });

  it("i nomi di proprietà di Object non sono bandiere («constructor», «__proto__», «toString»)", () => {
    for (const name of ["constructor", "__proto__", "toString", "hasOwnProperty", "valueOf"]) expect(brandLogoUrl(name)).toBeNull();
  });

  it("la normalizzazione dell'app è IDENTICA a quella dello script che genera brands.json", () => {
    for (const name of ["Agip Eni", "  Api-Ip ", "Q8", "SOM/OMV", "Società  Petroli", "Caffè", "a  b", "\tTamoil\n", "KEROPETROL", ""]) {
      expect(normalizeBrand(name)).toBe(scriptNormalize(name));
    }
  });
});

describe("public/brands — i file generati da fetch:brands", () => {
  const files = readdirSync(brandsDir).filter((name) => name.endsWith(".png"));

  it("brands.json dichiara provenienza (URL, data, impronta sha256 della fonte) e attribuzione; il conteggio coincide coi file", () => {
    expect(manifest.source).toBe("https://carburanti.mise.gov.it/ospzApi/registry/alllogos");
    expect(manifest.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(Number.isNaN(Date.parse(manifest.downloadedAt))).toBe(false);
    expect(manifest.attribution).toBe("Loghi: marchi dei rispettivi titolari, forniti dall'Osservaprezzi Carburanti del MIMIT.");
    expect(BRAND_ATTRIBUTION).toBe(manifest.attribution);
    expect(manifest.count).toBe(files.length);
    expect(Object.keys(manifest.brands).length).toBe(files.length); // un nome per file (nessun nome doppio)
  });

  it("ogni voce punta a un PNG (di norma 50×50, qualcuno un po' diverso) che esiste; ogni chiave è già normalizzata", async () => {
    for (const [key, file] of Object.entries<string>(manifest.brands)) {
      expect(key).toBe(scriptNormalize(key));
      expect(file).toMatch(/^\d+\.png$/);
      expect(existsSync(join(brandsDir, file)), file).toBe(true);
    }
    for (const sample of files.slice(0, 40)) {
      const meta = await sharp(join(brandsDir, sample)).metadata();
      expect([meta.format, meta.width <= 56 && meta.height <= 56 && meta.width >= 8 && meta.height >= 8]).toEqual(["png", true]);
    }
  });

  it("i segnaposto generici e le bandiere senza logo sono ESCLUSI: non hanno né file né voce", () => {
    expect(manifest.excluded.placeholder).toEqual(expect.arrayContaining(["Pompe Bianche", "Som/Omv"]));
    for (const name of [...manifest.excluded.placeholder, ...manifest.excluded.noLogo]) expect(manifest.brands[scriptNormalize(name)], name).toBeUndefined();
    // nessun file del segnaposto: tutte le immagini sono distinte tra loro tranne i marchi davvero condivisi
    const hashes = new Map<string, number>();
    for (const file of files) hashes.set(sha256(readFileSync(join(brandsDir, file))), (hashes.get(sha256(readFileSync(join(brandsDir, file)))) ?? 0) + 1);
    expect(files.length - hashes.size).toBeLessThan(5);
  });

  it("peso totale contenuto (loghi a palette): meno di 700 KB per oltre 300 file", () => {
    const total = files.reduce((sum, file) => sum + statSync(join(brandsDir, file)).size, 0);
    expect(files.length).toBeGreaterThan(300);
    expect(total).toBeLessThan(700 * 1024);
  });
});

describe("nessun URL esterno per i loghi (zero fetch della fonte a runtime)", () => {
  const files = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) return files(path);
      return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
    });

  it("i sorgenti dell'app non nominano il servizio MIMIT dei loghi né altri host di loghi", () => {
    const forbidden = [/carburanti\.mise\.gov\.it/i, /ospzApi/, /alllogos/, /fabiodisconzi/i, /logoMarker/];
    const offenders = files(join(web, "src")).flatMap((file) => forbidden.filter((re) => re.test(readFileSync(file, "utf8"))).map((re) => `${file}: ${re}`));
    expect(offenders).toEqual([]);
  });

  it("l'unico indirizzo di un logo nei sorgenti è il file locale /brands/…", () => {
    const urls = files(join(web, "src")).flatMap((file) => [...readFileSync(file, "utf8").matchAll(/["'`](https?:\/\/[^"'`\s]*(?:\.png|logo)[^"'`\s]*)["'`]/gi)].map((m) => m[1]));
    expect(urls).toEqual([]);
    expect(brandLogoUrl("Agip Eni")!.startsWith("/brands/")).toBe(true);
  });

  it("brandLogoUrl non fa chiamate di rete", () => {
    const fetchSpy = vi.fn(() => Promise.reject(new Error("rete vietata")));
    vi.stubGlobal("fetch", fetchSpy);
    for (const name of ["Agip Eni", "Pompe Bianche", "sconosciuta"]) brandLogoUrl(name);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("script fetch:brands — logica pura con un payload finto (nessuna chiamata a MIMIT)", () => {
  const png = (color: { r: number; g: number; b: number }) => sharp({ create: { width: 50, height: 50, channels: 4, background: { ...color, alpha: 1 } } }).png().toBuffer();
  const flag = (bandieraId: number, bandiera: string, logo: Buffer | null, withThumbOnly = false) => ({
    bandieraId,
    bandiera,
    logoMarkerList: logo
      ? [{ tipoFile: "th1", estensione: "png", content: logo.toString("base64") }, { tipoFile: "logo", estensione: "png", content: logo.toString("base64") }]
      : withThumbOnly
        ? [{ tipoFile: "th1", estensione: "png", content: "AAAA" }]
        : [],
  });

  it("tiene i loghi veri, esclude segnaposto (stessa impronta della bandiera di riferimento) e bandiere senza logo; ordina per id", async () => {
    const grey = await png({ r: 150, g: 150, b: 150 });
    const eni = await png({ r: 250, g: 200, b: 0 });
    const esso = await png({ r: 0, g: 60, b: 160 });
    const payload = {
      loghi: [
        flag(11, PLACEHOLDER_REFERENCE, grey),
        flag(6, "Api-Ip", esso),
        flag(0, "Bandiera non selezionata", null),
        flag(1, "Agip Eni", eni),
        flag(2, "Som/Omv", grey), // stessa pompa grigia: segnaposto
        flag(3, "Solo Miniature", null, true), // solo th*, nessun «logo»
      ],
    };
    const { entries, excluded } = selectLogos(payload);
    expect(entries.map((e) => [e.id, e.key])).toEqual([[1, "agip eni"], [6, "api-ip"]]);
    expect(excluded.placeholder.sort()).toEqual(["Pompe Bianche", "Som/Omv"]);
    expect(excluded.noLogo.sort()).toEqual(["Bandiera non selezionata", "Solo Miniature"]);
    expect(entries[0]!.png.equals(eni)).toBe(true); // il PNG è quello decodificato dalla fonte
  });

  it("se manca la bandiera di riferimento del segnaposto lo script si ferma (non include segnaposto senza accorgersene)", async () => {
    const eni = await png({ r: 250, g: 200, b: 0 });
    expect(() => selectLogos({ loghi: [flag(1, "Agip Eni", eni)] })).toThrow(/segnaposto/);
    expect(() => selectLogos({} as never)).toThrow(/loghi/);
  });

  it("due nomi uguali dopo la normalizzazione: vale il primo (id più basso) e l'altro è segnalato", async () => {
    const grey = await png({ r: 150, g: 150, b: 150 });
    const a = await png({ r: 1, g: 2, b: 3 });
    const b = await png({ r: 9, g: 9, b: 9 });
    const { entries, excluded } = selectLogos({ loghi: [flag(11, PLACEHOLDER_REFERENCE, grey), flag(20, "ENERGAS ", b), flag(5, "Energas", a)] });
    expect(entries.map((e) => e.id)).toEqual([5]);
    expect(excluded.collisions).toEqual(["ENERGAS (#20) = #5"]);
  });

  it("la ricompressione a palette non peggiora (mai più grande dell'originale) e non cambia le dimensioni; il manifest ha forma e conteggio giusti", async () => {
    const original = await sharp({ create: { width: 50, height: 50, channels: 4, background: { r: 10, g: 120, b: 200, alpha: 1 } } }).png({ compressionLevel: 0 }).toBuffer();
    const out = await compressLogo(sharp, original);
    expect(out.length).toBeLessThanOrEqual(original.length);
    const meta = await sharp(out).metadata();
    expect([meta.width, meta.height]).toEqual([50, 50]);
    const grey = await png({ r: 150, g: 150, b: 150 });
    const selected = selectLogos({ loghi: [flag(11, PLACEHOLDER_REFERENCE, grey), flag(1, "Agip Eni", original)] });
    const made = buildManifest({ ...selected, sha: sha256("x"), downloadedAt: "2026-10-06T00:00:00.000Z" });
    expect(made).toMatchObject({ source: "https://carburanti.mise.gov.it/ospzApi/registry/alllogos", count: 1, sha256: sha256("x"), downloadedAt: "2026-10-06T00:00:00.000Z" });
    expect(made.brands).toEqual({ "agip eni": "1.png" });
  });

  it("la logica non usa la rete", async () => {
    const fetchSpy = vi.fn(() => Promise.reject(new Error("rete vietata")));
    vi.stubGlobal("fetch", fetchSpy);
    const grey = await png({ r: 150, g: 150, b: 150 });
    selectLogos({ loghi: [flag(11, PLACEHOLDER_REFERENCE, grey)] });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

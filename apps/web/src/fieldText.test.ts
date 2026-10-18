import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import postcss, { type AtRule, type Rule } from "postcss";
import tailwind from "tailwindcss";
import { describe, expect, it } from "vitest";
import config from "../tailwind.config";

/**
 * Zoom al focus su iOS: Safari ingrandisce la pagina quando si tocca un campo di testo con font-size
 * sotto i 16px. Fix: ogni campo usa `field-text` (16px sotto md o con puntatore impreciso, 14px da md in su con il mouse),
 * SENZA toccare il meta viewport. jsdom non applica i CSS: il font-size computato si ricava compilando davvero Tailwind
 * con la configurazione del progetto e valutando le media query; in più si scorrono i sorgenti per non lasciare campi fuori.
 */

const SRC = __dirname;

async function compiledRules() {
  const result = await postcss([tailwind({ ...config, content: [{ raw: '<input class="field-text">', extension: "html" }] })]).process("@tailwind components;", { from: undefined });
  const root = result.root;
  const base: string[] = [];
  const media: Array<{ params: string; sizes: string[] }> = [];
  root.walkRules(".field-text", (rule: Rule) => {
    const sizes: string[] = [];
    rule.walkDecls("font-size", (decl) => void sizes.push(decl.value));
    if (rule.parent?.type === "atrule") media.push({ params: (rule.parent as AtRule).params, sizes });
    else base.push(...sizes);
  });
  return { base, media };
}

/** Valuta la regola come il browser: la dimensione base, poi quella delle media query che combaciano con lo schermo. */
function computedFontSize(rules: Awaited<ReturnType<typeof compiledRules>>, screen: { width: number; coarse: boolean }): number {
  let size = rules.base.at(-1);
  for (const m of rules.media) {
    // L'unica media query usata: «(max-width: 767.98px), (pointer: coarse)» (virgola = OR).
    const alternatives = m.params.split(",").map((p) => p.trim());
    const matches = alternatives.some((alt) => {
      const maxWidth = /^\(max-width:\s*([\d.]+)px\)$/.exec(alt);
      if (maxWidth) return screen.width <= Number(maxWidth[1]);
      if (alt === "(pointer: coarse)") return screen.coarse;
      throw new Error(`media query non prevista: ${alt}`);
    });
    if (matches) size = m.sizes.at(-1);
  }
  expect(size, "font-size definito").toMatch(/^\d+(\.\d+)?px$/);
  return parseFloat(size!);
}

describe("field-text — font-size dei campi di testo (zoom al focus su iOS)", () => {
  it("su telefono (390 px, dito) e su iPad (768 e 1024 px, dito) il testo è ≥ 16 px: Safari non zooma", async () => {
    const rules = await compiledRules();
    for (const screen of [
      { width: 360, coarse: true },
      { width: 390, coarse: true },
      { width: 430, coarse: true },
      { width: 768, coarse: true },
      { width: 1024, coarse: true },
    ]) {
      expect(computedFontSize(rules, screen), JSON.stringify(screen)).toBeGreaterThanOrEqual(16);
    }
  });

  it("sotto md (767 px) è ≥ 16 px anche con il mouse (finestra stretta)", async () => {
    const rules = await compiledRules();
    expect(computedFontSize(rules, { width: 767, coarse: false })).toBeGreaterThanOrEqual(16);
    expect(computedFontSize(rules, { width: 500, coarse: false })).toBeGreaterThanOrEqual(16);
  });

  it("da md in su con il mouse (desktop) resta la dimensione di sempre, 14 px: nessun cambiamento", async () => {
    const rules = await compiledRules();
    for (const width of [768, 1024, 1280, 1920]) expect(computedFontSize(rules, { width, coarse: false }), `${width}px`).toBe(14);
  });

  it("i valori vengono dai token tipografici esistenti (body-lg 16px, body-md 14px), non da misure nuove", () => {
    const sizes = config.theme?.extend?.fontSize as Record<string, [string, unknown]>;
    expect(sizes["body-lg"]![0]).toBe("16px");
    expect(sizes["body-md"]![0]).toBe("14px");
  });

  it("il meta viewport non blocca lo zoom (niente maximum-scale né user-scalable: accessibilità, e iOS li ignora)", () => {
    const html = readFileSync(join(SRC, "../index.html"), "utf8");
    const viewport = /<meta[^>]*name="viewport"[^>]*>/s.exec(html)?.[0] ?? "";
    expect(viewport).toContain("width=device-width");
    expect(viewport).not.toMatch(/maximum-scale|user-scalable|minimum-scale/);
  });
});

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx$/.test(name) && !/\.test\.tsx$/.test(name) ? [path] : [];
  });
}

/** Ogni elemento di input trovato nei sorgenti con il testo che compone (da `<input` alla chiusura `/>`). */
function textFields(): Array<{ file: string; source: string; type: string | null }> {
  const found: Array<{ file: string; source: string; type: string | null }> = [];
  for (const file of sourceFiles(SRC)) {
    const text = readFileSync(file, "utf8").replace(/\r\n/g, "\n");
    for (const match of text.matchAll(/<(input|textarea|select)\b/g)) {
      const start = match.index!;
      const end = text.indexOf("/>", start);
      // Il commento di documentazione che cita «<input type="range">» non è un elemento: si salta.
      const before = text.slice(Math.max(0, start - 3), start);
      if (/`$|\*\s$/.test(before) || end < 0) continue;
      const source = text.slice(start, end + 2);
      found.push({ file: file.slice(SRC.length + 1), source, type: /type=["{]\s*"?([a-z]+)/.exec(source)?.[1] ?? null });
    }
  }
  return found;
}

const NON_TEXT_TYPES = new Set(["range", "radio", "checkbox", "hidden", "file", "button", "submit", "reset", "image", "color"]);

describe("field-text — copertura di TUTTI i campi di testo trovati nei sorgenti", () => {
  const fields = textFields();

  it("il controllo trova i campi attesi (indirizzi, numeri e modello nelle Impostazioni): non passa a vuoto", () => {
    const files = fields.map((f) => f.file.replace(/\\/g, "/"));
    expect(files).toContain("components/AddressInput.tsx");
    expect(files).toContain("components/settings/NumberField.tsx");
    expect(files).toContain("components/settings/SettingsScreen.tsx");
    expect(files).toContain("components/RangeInput.tsx");
  });

  it("ogni input/textarea/select di testo ha `field-text` e nessuna altra classe di dimensione del testo che la coprirebbe", () => {
    const textual = fields.filter((f) => !(f.type && NON_TEXT_TYPES.has(f.type)));
    expect(textual.length).toBeGreaterThanOrEqual(3);
    for (const field of textual) {
      expect(field.source, `${field.file}: campo di testo senza field-text`).toContain("field-text");
      expect(field.source, `${field.file}: classe text-* di dimensione insieme a field-text`).not.toMatch(/\btext-(headline|body|label|numeric)-[a-z0-9-]+/);
    }
  });

  it("slider e radio non zoomano e non devono portare field-text", () => {
    for (const field of fields.filter((f) => f.type && NON_TEXT_TYPES.has(f.type))) expect(field.source).not.toContain("field-text");
  });
});

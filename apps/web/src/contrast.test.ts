import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import config from "../tailwind.config";

/**
 * Contrasto del testo bianco su riempimento verde (WCAG AA, testo ≤14px: 4,5:1).
 * Regola (DESIGN.md): le superfici con testo bianco usano `bg-primary-strong` (#047857); `bg-primary` (#059669) resta per
 * icone, linee, pallini e riempimenti chiari con testo scuro. Qui la regola è verificata sul codice sorgente, non su
 * qualche schermata campione: ogni classe `text-on-primary` (bianco) del frontend deve stare su un riempimento ≥ 4,5:1.
 */
const colors = (config.theme?.extend?.colors ?? {}) as Record<string, string>;
const WHITE = "#ffffff";
const MIN_TEXT_CONTRAST = 4.5;

type Rgb = [number, number, number];
const toRgb = (hex: string): Rgb => {
  const h = hex.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as Rgb;
};
const luminance = ([r, g, b]: Rgb) => {
  const channel = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
};
const contrast = (a: Rgb, b: Rgb) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
};
const blend = (fill: Rgb, alpha: number, under: Rgb): Rgb => fill.map((v, i) => v * alpha + under[i]! * (1 - alpha)) as Rgb;

describe("contrasto: token", () => {
  it("primary-strong è #047857 e supera 4,5:1 col testo bianco (≈5,5:1); #059669 no", () => {
    expect(colors["primary-strong"]).toBe("#047857");
    expect(colors["on-primary"]).toBe(WHITE);
    expect(contrast(toRgb(WHITE), toRgb(colors["primary-strong"]!))).toBeGreaterThanOrEqual(5.4);
    expect(contrast(toRgb(WHITE), toRgb(colors["primary"]!))).toBeLessThan(MIN_TEXT_CONTRAST); // 3,77:1: per questo il testo bianco non sta su `primary`
  });

  it("il token è anche in DESIGN.md (unica fonte di verità) e primary resta #059669", () => {
    const design = readFileSync(join(__dirname, "../../../DESIGN.md"), "utf8");
    expect(design).toMatch(/primary-strong:\s*'#047857'/);
    expect(design).toMatch(/\n {2}primary:\s*'#059669'/);
    expect(colors["primary"]).toBe("#059669");
  });
});

/** Tutti i letterali di stringa (", ', `) di un sorgente, anche quelli dentro le espressioni `${…}` dei template. */
function stringLiterals(source: string): string[] {
  const out: string[] = [];
  const re = /(["'`])((?:\\.|(?!\1)[^\\])*)\1/g;
  const scan = (text: string) => {
    for (const match of text.matchAll(re)) {
      const [, quote, body] = match;
      if (quote === "`") {
        const expressions = [...body!.matchAll(/\$\{([^}]*)\}/g)].map((m) => m[1]!);
        out.push(body!.replace(/\$\{[^}]*\}/g, " "));
        expressions.forEach(scan);
      } else {
        out.push(body!);
      }
    }
  };
  scan(source);
  return out;
}

/** Via i commenti (blocchi, righe intere e code « // … »): un apostrofo in una frase non deve aprire un «letterale». */
const withoutComments = (source: string) =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\s\/\/\s.*$/gm, "");

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sources(path);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

interface Found {
  file: string;
  classes: string[];
}
const found: Found[] = sources(__dirname).flatMap((file) =>
  stringLiterals(withoutComments(readFileSync(file, "utf8"))).map((literal) => ({ file: file.slice(__dirname.length + 1).replace(/\\/g, "/"), classes: literal.split(/\s+/).filter(Boolean) })),
);

/** I riempimenti scuri sovrapposti (es. `bg-on-primary-fixed/25`) stanno sopra un pulsante `primary-strong`. */
function fillOf(classes: string[]): Rgb | null {
  const bg = classes.map((c) => /^bg-([a-z-]+?)(?:\/(\d+))?$/.exec(c)).find((m) => m && colors[m[1]!] !== undefined);
  if (!bg) return null;
  const under = toRgb(colors["primary-strong"]!);
  return bg[2] ? blend(toRgb(colors[bg[1]!]!), Number(bg[2]) / 100, under) : toRgb(colors[bg[1]!]!);
}

describe("contrasto: ogni testo bianco (text-on-primary) del frontend sta su un riempimento ≥ 4,5:1", () => {
  const whiteText = found.filter((f) => f.classes.includes("text-on-primary"));

  it("la scansione trova i pulsanti, i chip, il badge «Migliore» e il pin sulla mappa (non è vuota)", () => {
    expect(whiteText.length).toBeGreaterThanOrEqual(15);
    const files = new Set(whiteText.map((f) => f.file));
    for (const expected of ["components/FuelChips.tsx", "components/results/ResultCard.tsx", "components/results/MapCanvas.tsx", "components/settings/SettingsScreen.tsx", "components/SearchForm.tsx"]) {
      expect(files, expected).toContain(expected);
    }
  });

  it("nessun riempimento di una superficie con testo bianco è sotto 4,5:1", () => {
    const offenders: string[] = [];
    for (const { file, classes } of whiteText) {
      const fill = fillOf(classes);
      if (!fill) continue; // il riempimento sta sul genitore: lo controlla il test seguente
      const ratio = contrast(toRgb(WHITE), fill);
      if (ratio < MIN_TEXT_CONTRAST) offenders.push(`${file}: ${classes.filter((c) => c.startsWith("bg-")).join(" ")} → ${ratio.toFixed(2)}:1`);
    }
    expect(offenders).toEqual([]);
  });

  it("nessun testo bianco ha un riempimento che non sia primary-strong o più scuro: il verde chiaro `bg-primary` non porta testo bianco", () => {
    const onPrimary = whiteText.filter((f) => f.classes.includes("bg-primary") || f.classes.includes("bg-primary-container"));
    expect(onPrimary.map((f) => f.file)).toEqual([]);
  });

  it("`bg-primary` (#059669) esiste solo dove non c'è testo: pallini, indicatore «live», interruttore", () => {
    const users = found.filter((f) => f.classes.includes("bg-primary")).map((f) => f.file).sort();
    expect(users).toEqual(
      ["components/SearchForm.tsx", "components/ToggleRow.tsx", "components/home/HomeScreen.tsx", "components/results/PricesBanner.tsx", "components/results/PricesBanner.tsx"].sort(),
    );
  });

  it("le header non portano più testo bianco (le header non hanno avatar)", () => {
    const inHeaders = whiteText.filter((f) => f.file === "components/Header.tsx" || f.file === "components/station/StationHeader.tsx");
    expect(inHeaders).toEqual([]);
  });

  it("il pin «Migliore» sulla mappa e la sua coda usano primary-strong", () => {
    const pin = found.filter((f) => f.file === "components/results/MapCanvas.tsx");
    expect(pin.some((f) => f.classes.includes("bg-primary-strong") && f.classes.includes("text-on-primary"))).toBe(true);
    expect(pin.some((f) => f.classes.includes("bg-primary-strong") && !f.classes.includes("text-on-primary"))).toBe(true); // la coda
    expect(pin.some((f) => f.classes.includes("bg-primary"))).toBe(false);
  });

  it("il badge «Consigliato» (bianco su un overlay scuro dentro il pulsante verde) resta ≥ 4,5:1", () => {
    const badge = found.find((f) => f.file === "components/results/NavigateSheet.tsx" && f.classes.includes("text-on-primary") && f.classes.some((c) => c.startsWith("bg-on-primary-fixed/")))!;
    expect(badge).toBeDefined();
    expect(contrast(toRgb(WHITE), fillOf(badge.classes)!)).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST);
  });
});

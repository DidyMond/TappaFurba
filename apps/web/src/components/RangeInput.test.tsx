import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RangeInput } from "./RangeInput";

const css = readFileSync(join(__dirname, "../index.css"), "utf8");
/** Il blocco `.range-touch` (da «.range-touch {» alla fine del suo layer). */
const block = (selector: string) => {
  const match = new RegExp(`${selector.replace(/[.:()]/g, "\\$&")}\\s*\\{([^}]*)\\}`).exec(css);
  return match?.[1] ?? "";
};

describe("RangeInput — slider nativo con bersaglio da dito", () => {
  it("resta un <input type=range> nativo (tastiera e ARIA del browser) con min, max, step, valore e nome accessibile", () => {
    const onChange = vi.fn();
    render(<RangeInput aria-label="Deviazione" min={1} max={10} step={1} value={4} onChange={onChange} />);
    const slider = screen.getByRole("slider", { name: "Deviazione" }) as HTMLInputElement;
    expect(slider.tagName).toBe("INPUT");
    expect(slider).toHaveAttribute("type", "range");
    expect(slider).toHaveAttribute("min", "1");
    expect(slider).toHaveAttribute("max", "10");
    expect(slider).toHaveAttribute("step", "1");
    expect(slider).toHaveValue("4");
    expect(slider).toHaveClass("range-touch");
    fireEvent.change(slider, { target: { value: "7" } });
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("espone la parte percorsa del binario come --range-ratio (0–1) e la tiene nei limiti", () => {
    const { rerender } = render(<RangeInput aria-label="s" min={1} max={10} value={1} onChange={() => {}} />);
    const ratio = () => (screen.getByRole("slider") as HTMLInputElement).style.getPropertyValue("--range-ratio");
    expect(ratio()).toBe("0");
    rerender(<RangeInput aria-label="s" min={1} max={10} value={10} onChange={() => {}} />);
    expect(ratio()).toBe("1");
    rerender(<RangeInput aria-label="s" min={0} max={40} value={10} onChange={() => {}} />);
    expect(ratio()).toBe("0.25");
    rerender(<RangeInput aria-label="s" min={1} max={10} value={99} onChange={() => {}} />); // fuori scala: non esce dal binario
    expect(ratio()).toBe("1");
  });

  it("CSS: area di tocco alta 44 px (tutta la fascia, trasparente), binario ≥ 6 px, cursore 28 px (32 px con pointer coarse)", () => {
    const root = block(".range-touch");
    expect(root).toMatch(/height:\s*44px/);
    expect(root).toMatch(/--thumb:\s*28px/);
    expect(root).toMatch(/--track:\s*6px/);
    expect(root).toMatch(/background:\s*transparent/);
    expect(root).toMatch(/appearance:\s*none/);
    expect(css).toMatch(/@media \(pointer: coarse\)\s*\{\s*\.range-touch\s*\{\s*--thumb:\s*32px/);
    const track = Number(/--track:\s*(\d+)px/.exec(root)![1]);
    expect(track).toBeGreaterThanOrEqual(6);
    for (const part of ["::-webkit-slider-runnable-track", "::-moz-range-track"]) expect(block(`.range-touch${part}`)).toMatch(/height:\s*var\(--track\)/);
    for (const part of ["::-webkit-slider-thumb", "::-moz-range-thumb"]) {
      const thumb = block(`.range-touch${part}`);
      expect(thumb).toMatch(/width:\s*var\(--thumb\)/);
      expect(thumb).toMatch(/height:\s*var\(--thumb\)/);
    }
  });

  it("CSS: a dito premuto il cursore cresce di ~1,25 (iOS) e con prefers-reduced-motion non c'è transizione", () => {
    expect(css).toMatch(/\.range-touch:active::-webkit-slider-thumb,\s*\.range-touch\[data-dragging="true"\]::-webkit-slider-thumb\s*\{\s*transform:\s*scale\(1\.25\)/);
    expect(css).toMatch(/\.range-touch:active::-moz-range-thumb,\s*\.range-touch\[data-dragging="true"\]::-moz-range-thumb\s*\{\s*transform:\s*scale\(1\.25\)/);
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)\s*\{[^@]*range-touch::-webkit-slider-thumb\s*\{\s*transition:\s*none/);
    expect(block(".range-touch:focus-visible::-webkit-slider-thumb")).toMatch(/box-shadow/); // il focus da tastiera resta visibile
  });
});

describe("RangeInput — stato «preso» durante il trascinamento (la scala del cursore)", () => {
  it("data-dragging dal primo contatto al rilascio; anche il pointercancel (la pagina prende lo scorrimento) e il blur lo tolgono", () => {
    render(<RangeInput aria-label="s" min={1} max={10} value={5} onChange={() => {}} />);
    const slider = screen.getByRole("slider");
    expect(slider).not.toHaveAttribute("data-dragging");
    fireEvent.pointerDown(slider);
    expect(slider).toHaveAttribute("data-dragging", "true");
    act(() => {
      window.dispatchEvent(new Event("pointerup"));
    });
    expect(slider).not.toHaveAttribute("data-dragging");
    fireEvent.pointerDown(slider);
    act(() => {
      window.dispatchEvent(new Event("pointercancel"));
    });
    expect(slider).not.toHaveAttribute("data-dragging");
    fireEvent.pointerDown(slider);
    fireEvent.blur(slider);
    expect(slider).not.toHaveAttribute("data-dragging");
  });

  it("i gestori passati dall'esterno (onPointerDown, onBlur) continuano a funzionare", () => {
    const down = vi.fn();
    const blur = vi.fn();
    render(<RangeInput aria-label="s" min={1} max={10} value={5} onChange={() => {}} onPointerDown={down} onBlur={blur} />);
    fireEvent.pointerDown(screen.getByRole("slider"));
    fireEvent.blur(screen.getByRole("slider"));
    expect(down).toHaveBeenCalledTimes(1);
    expect(blur).toHaveBeenCalledTimes(1);
  });
});

describe("tutti gli slider dell'app usano RangeInput (deviazione e raggio nel foglio, consumo, tempo personalizzato, deviazione predefinita)", () => {
  const files = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) return files(path);
      return /\.tsx$/.test(entry.name) && !/\.test\.tsx$/.test(entry.name) ? [path] : [];
    });
  const src = join(__dirname, "..");

  it("nessun <input type=\"range\"> fuori da RangeInput", () => {
    const raw = files(src).filter((file) => /type="range"/.test(readFileSync(file, "utf8")));
    expect(raw.map((file) => file.slice(src.length + 1).replace(/\\/g, "/"))).toEqual(["components/RangeInput.tsx"]);
  });

  it("i cinque usi ci sono: SearchForm (2: deviazione massima e raggio di «Intorno a me») e SettingsScreen (3)", () => {
    const count = (file: string) => (readFileSync(join(src, file), "utf8").match(/<RangeInput/g) ?? []).length;
    expect(count("components/SearchForm.tsx")).toBe(2);
    expect(count("components/settings/SettingsScreen.tsx")).toBe(3);
  });
});

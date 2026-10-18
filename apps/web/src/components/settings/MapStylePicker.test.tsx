import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MAP_STYLES, type MapStyleId } from "../../lib/mapStyle";
import { MapStylePicker } from "./MapStylePicker";

afterEach(cleanup);

const NAMES = ["Light", "Duotono", "Carta Stradale", "Monocromo"];
const radio = (name: string) => screen.getByRole("radio", { name: `Seleziona stile mappa ${name}` }) as HTMLInputElement;
const card = (id: MapStyleId) => screen.getByTestId(`map-style-${id}`);

function renderPicker(value: MapStyleId = "light", onChange: (id: MapStyleId) => void = () => {}) {
  return render(<MapStylePicker value={value} onChange={onChange} />);
}

describe("MapStylePicker — struttura", () => {
  it("sotto-titolo e un gruppo di radio etichettato, con le quattro card nell'ordine Light, Duotono, Carta Stradale, Monocromo", () => {
    renderPicker();
    expect(screen.getByText("Scegli lo stile della mappa che preferisci")).toBeInTheDocument();
    const group = screen.getByRole("radiogroup", { name: "Scegli lo stile della mappa che preferisci" });
    const radios = within(group).getAllByRole("radio");
    expect(radios.map((r) => r.getAttribute("aria-label"))).toEqual(NAMES.map((n) => `Seleziona stile mappa ${n}`));
  });

  it("ogni card: anteprima 400×240 (5:3) con alt «Anteprima stile {nome}», nome e descrizione", () => {
    renderPicker();
    for (const style of Object.values(MAP_STYLES)) {
      const img = screen.getByAltText(`Anteprima stile ${style.name}`) as HTMLImageElement;
      expect(img.getAttribute("src")).toBe(style.preview);
      expect([img.width, img.height]).toEqual([400, 240]); // dimensioni esplicite: nessuno spostamento quando l'immagine arriva
      expect(img).toHaveClass("aspect-[5/3]", "w-full", "object-cover");
      expect(img).toHaveAttribute("loading", "lazy");
      const root = card(style.id);
      expect(within(root).getByText(style.name)).toBeInTheDocument();
      expect(within(root).getByText(style.description)).toBeInTheDocument();
    }
  });

  it("griglia: un elenco su mobile, 2×2 da lg (1024 px)", () => {
    renderPicker();
    expect(screen.getByRole("radiogroup")).toHaveClass("grid", "grid-cols-1", "lg:grid-cols-2");
  });

  it("il radio è nascosto alla vista (sr-only) ma presente per lettori di schermo e tastiera, uno solo con lo stesso name", () => {
    renderPicker();
    for (const name of NAMES) {
      expect(radio(name)).toHaveClass("sr-only");
      expect(radio(name)).toHaveAttribute("name", "map-style");
      expect(radio(name)).toHaveAttribute("type", "radio");
    }
  });
});

describe("MapStylePicker — selezione", () => {
  it("la card scelta ha il bordo verde (border-primary) e la spunta; le altre il bordo grigio; tutte 2 px (nessuno spostamento)", () => {
    renderPicker("duotono");
    expect(radio("Duotono").checked).toBe(true);
    for (const name of ["Light", "Carta Stradale", "Monocromo"]) expect(radio(name).checked).toBe(false);

    expect(card("duotono")).toHaveClass("border-2", "border-primary");
    expect(card("duotono")).toHaveAttribute("data-selected", "true");
    expect(within(card("duotono")).getByTestId("map-style-check")).toBeInTheDocument();
    for (const id of ["light", "stradale", "monochrome"] as const) {
      expect(card(id)).toHaveClass("border-2", "border-outline-variant");
      expect(card(id)).not.toHaveClass("border-primary");
      expect(card(id)).toHaveAttribute("data-selected", "false");
      expect(within(card(id)).queryByTestId("map-style-check")).toBeNull();
    }
  });

  it("il bordo cambia colore all'istante: nessuna transizione sulla card", () => {
    renderPicker("duotono");
    for (const id of ["light", "duotono", "stradale", "monochrome"] as const) expect(card(id).className).not.toMatch(/transition/);
  });

  it("toccare una card seleziona quello stile, subito", async () => {
    const onChange = vi.fn();
    renderPicker("light", onChange);
    await userEvent.setup().click(screen.getByAltText("Anteprima stile Carta Stradale"));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("stradale");
  });

  it("toccare il nome o la descrizione vale quanto toccare l'anteprima (tutta la card è il bersaglio)", async () => {
    const onChange = vi.fn();
    renderPicker("light", onChange);
    const user = userEvent.setup();
    await user.click(screen.getByText("Monocromo"));
    await user.click(screen.getByText(MAP_STYLES.duotono.description));
    expect(onChange.mock.calls).toEqual([["monochrome"], ["duotono"]]);
  });
});

describe("MapStylePicker — tastiera e accessibilità", () => {
  it("Tab porta il focus sul gruppo (sulla card scelta); le frecce passano alla card successiva", async () => {
    const onChange = vi.fn();
    renderPicker("duotono", onChange);
    const user = userEvent.setup();
    await user.tab();
    expect(radio("Duotono")).toHaveFocus();
    await user.keyboard("{ArrowDown}");
    expect(onChange).toHaveBeenLastCalledWith("stradale"); // le frecce passano alla card successiva del gruppo
  });

  it("Enter seleziona la card con il focus (i radio nativi non lo fanno da soli)", async () => {
    const onChange = vi.fn();
    renderPicker("light", onChange);
    const user = userEvent.setup();
    radio("Carta Stradale").focus();
    await user.keyboard("{Enter}");
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("stradale");
  });

  it("Spazio seleziona la card con il focus", async () => {
    const onChange = vi.fn();
    renderPicker("light", onChange);
    const user = userEvent.setup();
    radio("Monocromo").focus();
    await user.keyboard(" ");
    expect(onChange).toHaveBeenCalledWith("monochrome");
  });

  it("l'anello di focus (verde, 2 px) compare solo con la tastiera (focus-visible) ed è sulla card", () => {
    renderPicker();
    for (const id of ["light", "duotono", "stradale", "monochrome"] as const) {
      expect(card(id)).toHaveClass("has-[:focus-visible]:ring-2", "has-[:focus-visible]:ring-primary");
    }
  });

  it("le immagini sono contenuto, non decorazione: ognuna ha il suo alt; la spunta è decorativa (aria-hidden)", () => {
    renderPicker("light");
    expect(screen.getAllByRole("img")).toHaveLength(4);
    expect(screen.getByTestId("map-style-check")).toHaveAttribute("aria-hidden", "true");
  });
});

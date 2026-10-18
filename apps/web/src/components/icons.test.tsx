import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import * as icons from "./icons";

const ICONS = Object.entries(icons) as Array<[string, React.ComponentType<{ className?: string }>]>;
// Il «Spinner» è un anello con arco: ha un proprio tratto (3) per restare leggibile mentre ruota.
const OWN_STROKE = new Set(["SpinnerIcon"]);

describe("set di icone inline: coerenza di tratto", () => {
  it("il set non è vuoto", () => {
    expect(ICONS.length).toBeGreaterThanOrEqual(30);
  });

  it.each(ICONS.filter(([name]) => !OWN_STROKE.has(name)))("%s: griglia 24, tratto 2, estremi e giunzioni arrotondati, colore da currentColor", (_name, Icon) => {
    const { container } = render(<Icon />);
    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("viewBox")).toBe("0 0 24 24");
    expect(svg.getAttribute("stroke")).toBe("currentColor");
    expect(svg.getAttribute("stroke-width")).toBe("2");
    expect(svg.getAttribute("stroke-linecap")).toBe("round");
    expect(svg.getAttribute("stroke-linejoin")).toBe("round");
    expect(svg.getAttribute("aria-hidden")).toBe("true");
    expect(svg.getAttribute("fill")).toBe("none");
  });

  it("senza misura propria un'icona è 20 px (w-5 h-5)", () => {
    const { container } = render(<icons.CloseIcon />);
    expect(container.querySelector("svg")).toHaveClass("w-5", "h-5", "shrink-0");
  });

  it("con una misura propria vince quella del chiamante: la base w-5 non si somma (nel CSS w-5 batterebbe w-3.5 e w-4)", () => {
    for (const size of ["w-3.5 h-3.5", "w-4 h-4", "w-[18px] h-[18px]", "w-12 h-12"]) {
      const { container, unmount } = render(<icons.CloseIcon className={size} />);
      const svg = container.querySelector("svg")!;
      expect(svg.getAttribute("class")).toBe(`shrink-0 ${size}`);
      expect(svg).not.toHaveClass("w-5");
      unmount();
    }
  });

  it("lo Spinner conserva la rotazione e rispetta anche lui la misura del chiamante", () => {
    const { container } = render(<icons.SpinnerIcon className="w-4 h-4" />);
    expect(container.querySelector("svg")).toHaveClass("animate-spin", "w-4", "h-4");
    expect(container.querySelector("svg")).not.toHaveClass("w-5");
  });

  it("Impostazioni è un ingranaggio (anello dentato + foro), non un cerchio con raggi", () => {
    const { container } = render(<icons.SettingsIcon />);
    const paths = [...container.querySelectorAll("path")];
    expect(container.querySelectorAll("circle")).toHaveLength(1); // il foro
    expect(paths).toHaveLength(1);
    expect((paths[0]!.getAttribute("d")!.match(/L/g) ?? []).length).toBeGreaterThanOrEqual(24); // 8 denti: 3 segmenti l'uno
    expect(paths[0]!.getAttribute("d")).toContain("A6.9 6.9"); // i fondi tra un dente e l'altro sono archi
  });
});

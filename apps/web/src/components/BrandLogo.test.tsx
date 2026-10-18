import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Header } from "./Header";
import { BrandLogo } from "./BrandLogo";
import { StationHeader } from "./station/StationHeader";

const source = readFileSync(join(__dirname, "../../../../assets/logo.svg"), "utf8");
/** Gli attributi `d` dei tracciati del sorgente, nell'ordine. */
const sourcePaths = [...source.matchAll(/ d="([^"]+)"/g)].map((m) => m[1]);

describe("BrandLogo — mark «Pin-goccia»", () => {
  it("i tracciati sono quelli di assets/logo.svg (unica sorgente): pin, goccia, puntini della rotta", () => {
    render(<BrandLogo />);
    const drawn = [...screen.getByTestId("brand-logo").querySelectorAll("path")].map((p) => p.getAttribute("d"));
    expect(drawn).toEqual(sourcePaths);
    expect(drawn).toHaveLength(3);
  });

  it("stesso gradiente (#0284C7 → #10B981), blu notte #0F172A per la goccia, bianco per pin e puntini", () => {
    render(<BrandLogo />);
    const svg = screen.getByTestId("brand-logo");
    expect([...svg.querySelectorAll("stop")].map((s) => [s.getAttribute("offset"), s.getAttribute("stop-color")])).toEqual([["0%", "#0284C7"], ["100%", "#10B981"]]);
    expect(svg.querySelector("rect")).toHaveAttribute("rx", "44");
    const [pin, drop] = [...svg.querySelectorAll("path")];
    expect(pin).toHaveAttribute("fill", "#FFFFFF");
    expect(drop).toHaveAttribute("fill", "#0F172A");
    expect(svg).toHaveAttribute("aria-hidden", "true"); // decorativo: il nome «TappaFurba» è già nel testo accanto
  });

  it("con detail={false} (come il favicon) mancano i puntini della rotta", () => {
    render(<BrandLogo detail={false} />);
    expect(screen.getByTestId("brand-logo").querySelectorAll("path")).toHaveLength(2);
    expect(screen.getByTestId("brand-logo").querySelector("#route-dots")).toBeNull();
  });

  it("l'header globale lo mostra a 36 px (w-9 h-9) accanto al nome; l'header a pila a 32 px (w-8 h-8)", () => {
    const { unmount } = render(<Header />);
    expect(screen.getByTestId("brand-logo")).toHaveClass("w-9", "h-9");
    expect(screen.getByTestId("header-brand")).toHaveTextContent("TappaFurba");
    unmount();
    render(<StationHeader onBack={() => {}} onShare={() => {}} actionsDisabled={false} />);
    expect(screen.getByTestId("brand-logo")).toHaveClass("w-8", "h-8");
  });
});

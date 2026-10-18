import { act, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Header, HEADER_SCROLL_THRESHOLD_PX } from "./Header";

const scrollTo = (y: number) => {
  act(() => {
    Object.defineProperty(window, "scrollY", { value: y, configurable: true });
    window.dispatchEvent(new Event("scroll"));
  });
};

afterEach(() => scrollTo(0));

describe("Header — trasparente a riposo sulla Home, glass quando si scorre", () => {
  it("sulla Home a scrollTop=0 è trasparente e senza sfocatura (niente bordo sopra l'alone)", () => {
    render(<Header transparentAtTop />);
    const header = screen.getByTestId("app-header");
    expect(header).toHaveClass("bg-transparent");
    expect(header.className).not.toMatch(/backdrop-blur|bg-surface/);
    expect(header).toHaveAttribute("data-glass", "false");
  });

  it("scorrendo oltre la soglia passa al glass (surface/85 + sfocatura) e tornando in cima torna trasparente", () => {
    render(<Header transparentAtTop />);
    const header = screen.getByTestId("app-header");
    scrollTo(HEADER_SCROLL_THRESHOLD_PX); // alla soglia (non oltre) resta trasparente
    expect(header).toHaveAttribute("data-glass", "false");
    scrollTo(HEADER_SCROLL_THRESHOLD_PX + 1);
    expect(header).toHaveClass("bg-surface/85", "backdrop-blur-xl");
    expect(header).not.toHaveClass("bg-transparent");
    expect(header).toHaveAttribute("data-glass", "true");
    scrollTo(0);
    expect(header).toHaveClass("bg-transparent");
  });

  it("sulle altre schermate è sempre glass, anche in cima", () => {
    render(<Header />);
    const header = screen.getByTestId("app-header");
    expect(header).toHaveClass("bg-surface/85", "backdrop-blur-xl");
    expect(header).toHaveAttribute("data-glass", "true");
  });

  it("parte già glass se la pagina è aperta già scorsa", () => {
    Object.defineProperty(window, "scrollY", { value: 300, configurable: true });
    render(<Header transparentAtTop />);
    expect(screen.getByTestId("app-header")).toHaveAttribute("data-glass", "true");
  });
});

describe("Header — senza avatar", () => {
  it("la header globale ha solo il brand, centrato in una griglia vuota | brand | vuota: nessun pulsante, nessun «RF»", () => {
    render(<Header />);
    const header = screen.getByTestId("app-header");
    expect(within(header).queryAllByRole("button")).toHaveLength(0);
    expect(within(header).queryByLabelText(/profilo/i)).not.toBeInTheDocument();
    expect(header.textContent).toBe("TappaFurba");
    const grid = header.firstElementChild as HTMLElement;
    expect(grid).toHaveClass("grid", "grid-cols-[1fr_auto_1fr]", "items-center");
    expect(grid.children).toHaveLength(3);
    expect(grid.children[1]).toBe(screen.getByTestId("header-brand")); // il brand sta nella colonna centrale
  });
});

describe("Header — variante larga da lg", () => {
  it("con wide il contenuto si allarga (max-w-6xl, px-8) da lg in su; senza resta nella colonna mobile", () => {
    const { unmount } = render(<Header wide />);
    const inner = screen.getByTestId("app-header").firstElementChild as HTMLElement;
    expect(inner).toHaveClass("max-w-md", "lg:max-w-6xl", "lg:px-8");
    unmount();
    render(<Header />);
    expect((screen.getByTestId("app-header").firstElementChild as HTMLElement).className).not.toMatch(/lg:/);
  });
});

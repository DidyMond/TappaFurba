import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RESULTS_TAB_RESELECTED_EVENT } from "../lib/sheetSnap";
import { BottomNav, NAV_INDICATOR_MS } from "./BottomNav";

/** jsdom non fa il layout: le misure delle schede (offset*) si simulano per etichetta, come le avrebbe il browser. */
const BOXES: Record<string, { x: number; width: number }> = { Cerca: { x: 10, width: 80 }, Risultati: { x: 120, width: 90 }, Impostazioni: { x: 240, width: 110 } };
const labelOf = (el: HTMLElement) => Object.keys(BOXES).find((label) => el.textContent === label);
const proto = HTMLElement.prototype;
const originals = new Map<string, PropertyDescriptor | undefined>();

beforeEach(() => {
  const define = (name: string, value: (el: HTMLElement) => number) => {
    originals.set(name, Object.getOwnPropertyDescriptor(proto, name));
    Object.defineProperty(proto, name, { configurable: true, get(this: HTMLElement) { return value(this); } });
  };
  define("offsetLeft", (el) => BOXES[labelOf(el) ?? ""]?.x ?? 0);
  define("offsetWidth", (el) => BOXES[labelOf(el) ?? ""]?.width ?? 0);
  define("offsetTop", (el) => (labelOf(el) ? 2 : 0));
  define("offsetHeight", (el) => (labelOf(el) ? 48 : 0));
});
afterEach(() => {
  for (const [name, descriptor] of originals) {
    if (descriptor) Object.defineProperty(proto, name, descriptor);
    else Reflect.deleteProperty(proto, name);
  }
  originals.clear();
});

const renderNav = (path: string, hasResults = true) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <BottomNav hasResults={hasResults} />
    </MemoryRouter>,
  );
const indicator = () => screen.getByTestId("nav-indicator");
const settled = () => waitFor(() => expect(indicator().className).toContain("transition-[transform,width,opacity]"));

describe("BottomNav — indicatore che scorre tra le schede", () => {
  it("al caricamento sta sotto la scheda attiva, già in posizione e SENZA animazione (non «arriva» da 0)", () => {
    renderNav("/");
    expect(indicator()).toHaveAttribute("data-index", "0");
    expect(indicator().style.transform).toBe("translate(10px, 2px)");
    expect(indicator().style.width).toBe("80px");
    expect(indicator().style.height).toBe("48px");
    expect(indicator()).toHaveClass("transition-none");
  });

  it("poi la transizione è di transform (e larghezza), ~220 ms ease-out, e sparisce con prefers-reduced-motion", async () => {
    renderNav("/");
    await settled();
    expect(indicator()).toHaveClass("ease-out", "motion-reduce:transition-none");
    expect(indicator().style.transitionDuration).toBe(`${NAV_INDICATOR_MS}ms`);
    expect(NAV_INDICATOR_MS).toBeGreaterThanOrEqual(200);
    expect(NAV_INDICATOR_MS).toBeLessThanOrEqual(250);
  });

  it("cambiando scheda l'indicatore si sposta (transform e larghezza), con la stessa transizione", async () => {
    const user = userEvent.setup();
    renderNav("/");
    await settled();
    await user.click(screen.getByRole("link", { name: "Impostazioni" }));
    expect(indicator()).toHaveAttribute("data-index", "2");
    expect(indicator().style.transform).toBe("translate(240px, 2px)");
    expect(indicator().style.width).toBe("110px");
    expect(indicator().className).toContain("transition-[transform,width,opacity]"); // in movimento, non salta
    await user.click(screen.getByRole("link", { name: "Risultati" }));
    expect(indicator().style.transform).toBe("translate(120px, 2px)");
    expect(indicator().style.width).toBe("90px");
    await user.click(screen.getByRole("link", { name: "Cerca" }));
    expect(indicator().style.transform).toBe("translate(10px, 2px)");
  });

  it("senza ricerca la scheda Risultati è disattivata e fuori dal tab order; l'indicatore non va mai lì", async () => {
    const user = userEvent.setup();
    renderNav("/", false);
    expect(screen.queryByRole("link", { name: "Risultati" })).not.toBeInTheDocument();
    expect(screen.getByText("Risultati").closest("[aria-disabled=true]")).not.toBeNull();
    await user.click(screen.getByRole("link", { name: "Impostazioni" }));
    expect(indicator().style.transform).toBe("translate(240px, 2px)");
  });

  it("su un percorso senza scheda (es. dettaglio a pagina intera) l'indicatore è nascosto", () => {
    renderNav("/station/s/1");
    expect(indicator()).toHaveClass("opacity-0");
    expect(indicator()).toHaveAttribute("data-index", "-1");
  });

  it("sta DIETRO le etichette (assoluto, non intercetta i tocchi, schede sopra) e non aggiunge sfocature: il pill resta un riempimento piano", () => {
    renderNav("/");
    expect(indicator()).toHaveClass("absolute", "pointer-events-none", "rounded-full", "bg-primary-fixed/30");
    expect(indicator()).toHaveAttribute("aria-hidden", "true");
    expect(indicator().className).not.toMatch(/blur|backdrop|glass/);
    for (const name of ["Cerca", "Impostazioni"]) expect(screen.getByRole("link", { name })).toHaveClass("relative", "z-10");
    // le schede non hanno più un proprio sfondo attivo: lo dà solo l'indicatore
    expect(screen.getByRole("link", { name: "Cerca" }).className).not.toMatch(/bg-primary-fixed/);
    expect(screen.getByRole("link", { name: "Cerca" })).toHaveClass("text-on-primary-fixed-variant");
  });

  it("tastiera e ARIA invariati: aria-current sulla scheda attiva, Tab + Invio cambiano scheda e l'indicatore segue", async () => {
    const user = userEvent.setup();
    renderNav("/");
    expect(screen.getByRole("link", { name: "Cerca" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("navigation", { name: "Navigazione principale" })).toBeInTheDocument();
    await user.tab();
    expect(screen.getByRole("link", { name: "Cerca" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("link", { name: "Risultati" })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("link", { name: "Risultati" })).toHaveAttribute("aria-current", "page");
    expect(indicator().style.transform).toBe("translate(120px, 2px)");
  });
});

describe("BottomNav — ingombro per i fogli che scendono dietro la barra", () => {
  afterEach(() => document.documentElement.style.removeProperty("--bottom-nav-height"));

  it("sta a --bottom-nav-offset dal fondo e pubblica la propria altezza in --bottom-nav-height (la usa il foglio dei Risultati)", () => {
    Object.defineProperty(proto, "offsetHeight", {
      configurable: true,
      get(this: HTMLElement) {
        return this.tagName === "NAV" ? 62 : labelOf(this) ? 48 : 0;
      },
    });
    renderNav("/results");
    const nav = screen.getByRole("navigation", { name: "Navigazione principale" });
    expect(nav).toHaveClass("bottom-[var(--bottom-nav-offset)]");
    expect(document.documentElement.style.getPropertyValue("--bottom-nav-height")).toBe("62px");
  });

  it("senza misura (layout non calcolato) non scrive un'altezza a zero: vale il valore di ripiego in CSS", () => {
    renderNav("/");
    expect(document.documentElement.style.getPropertyValue("--bottom-nav-height")).toBe("");
  });
});

describe("BottomNav — tocco sulla scheda «Risultati» già attiva (foglio ridotto)", () => {
  const listen = () => {
    const handler = vi.fn();
    window.addEventListener(RESULTS_TAB_RESELECTED_EVENT, handler);
    return { handler, stop: () => window.removeEventListener(RESULTS_TAB_RESELECTED_EVENT, handler) };
  };

  it("un tocco su «Risultati» mentre è già la scheda attiva avvisa il foglio (che, se ridotto, torna a «chiuso»)", async () => {
    const user = userEvent.setup();
    const { handler, stop } = listen();
    renderNav("/results");
    await user.click(screen.getByRole("link", { name: "Risultati" }));
    await user.click(screen.getByRole("link", { name: "Risultati" }));
    expect(handler).toHaveBeenCalledTimes(2);
    stop();
  });

  it("da un'altra scheda il tocco su «Risultati» naviga soltanto: nessun avviso", async () => {
    const user = userEvent.setup();
    const { handler, stop } = listen();
    renderNav("/");
    await user.click(screen.getByRole("link", { name: "Risultati" }));
    expect(handler).not.toHaveBeenCalled();
    stop();
  });

  it("i tocchi su Cerca e Impostazioni non avvisano nessuno", async () => {
    const user = userEvent.setup();
    const { handler, stop } = listen();
    renderNav("/results");
    await user.click(screen.getByRole("link", { name: "Cerca" }));
    await user.click(screen.getByRole("link", { name: "Impostazioni" }));
    expect(handler).not.toHaveBeenCalled();
    stop();
  });
});

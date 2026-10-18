import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SearchState } from "../../hooks/useSearch";
import { RESULTS_TAB_RESELECTED_EVENT } from "../../lib/sheetSnap";
import { makeResponse, REQUEST } from "../../test/fixtures";

// La mappa (WebGL) non c'entra con il foglio: stub vuoto.
vi.mock("./MapView", () => ({ MapView: () => <div data-testid="map-stub" /> }));

import { ResultsScreen } from "./ResultsScreen";

type SuccessState = Extract<SearchState, { status: "success" }>;

function makeState(searchId = "s1"): SuccessState {
  const response = makeResponse({ searchId });
  return {
    status: "success",
    response,
    results: response.results,
    refinement: response.refinement,
    request: REQUEST,
    labels: { origin: "Via Roma 1, 20100 Milano", destination: "Piazza Maggiore, 40124 Bologna" },
  };
}

const screenFor = (state: SuccessState) => (
  <ResultsScreen state={state} onOpenStation={vi.fn()} routeDefaults={{ avoidMotorway: false, avoidTolls: false, avoidFerries: false }} onApplyRouteOptions={vi.fn()} />
);
const renderScreen = () => render(screenFor(makeState()));

// jsdom non fa il layout: si simulano le misure di un iPhone 12 (schermo 844, header 72 → regione 772; barra inferiore 16 + 62 = 78).
// Punti di aggancio attesi: ridotto 106 (28 di maniglia + 78 di barra), chiuso 446 (772 − 338 + 12), espanso 717 (85% di 844).
const MINIMIZED = 106;
const COLLAPSED = 446;
const EXPANDED = 717;
const CONTAINER = 772;
const MAP_BASE = 338; // 40% di 844
const MAP_TALL = 678; // 772 − 106 + 12
const proto = HTMLElement.prototype;
const originals = new Map<string, PropertyDescriptor | undefined>();
const originalInnerHeight = window.innerHeight;
let computedStyleSpy: { mockRestore(): void } | null = null;

beforeEach(() => {
  const define = (name: string, value: (el: HTMLElement) => number) => {
    originals.set(name, Object.getOwnPropertyDescriptor(proto, name));
    Object.defineProperty(proto, name, { configurable: true, get(this: HTMLElement) { return value(this); } });
  };
  define("clientHeight", (el) => (el.tagName === "MAIN" ? CONTAINER : 0));
  Object.defineProperty(window, "innerHeight", { configurable: true, value: 844 });
  // Il fondo del foglio ha il padding inferiore = ingombro della barra (var(--bottom-nav-clearance)): jsdom non carica i CSS.
  const real = window.getComputedStyle.bind(window);
  computedStyleSpy = vi.spyOn(window, "getComputedStyle").mockImplementation((element: Element, pseudo?: string | null) => {
    const style = real(element, pseudo);
    if (!(element instanceof HTMLElement) || element.dataset.testid !== "sheet-footer") return style;
    return new Proxy(style, {
      get(target, key) {
        if (key === "paddingBottom") return "78px";
        const value = Reflect.get(target, key, target);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
  });
});
afterEach(() => {
  computedStyleSpy?.mockRestore();
  for (const [name, descriptor] of originals) {
    if (descriptor) Object.defineProperty(proto, name, descriptor);
    else Reflect.deleteProperty(proto, name);
  }
  originals.clear();
  Object.defineProperty(window, "innerHeight", { configurable: true, value: originalInnerHeight });
});

const sheet = () => screen.getByTestId("bottom-sheet");
const header = () => screen.getByTestId("sheet-header");
const handle = () => screen.getByRole("button", { name: /elenco stazioni/ });
const mapRegion = () => screen.getByTestId("map-region");
const sheetHeight = () => sheet().style.getPropertyValue("--sheet-h");
const mapHeight = () => mapRegion().style.getPropertyValue("--map-h");
const pointer = (type: "pointerDown" | "pointerMove" | "pointerUp" | "pointerCancel", target: Element, clientY: number, pointerId = 1) =>
  fireEvent[type](target, { pointerId, pointerType: "touch", clientY, button: 0 });

/** Dito che parte da `fromY`, passa per `viaY` e si stacca. */
function drag(target: Element, fromY: number, viaY: number, pointerId = 1) {
  pointer("pointerDown", target, fromY, pointerId);
  pointer("pointerMove", target, viaY, pointerId);
  pointer("pointerUp", target, viaY, pointerId);
}
const dragUp = (px: number) => drag(handle(), 800, 800 - px);
const dragDown = (px: number) => drag(handle(), 400, 400 + px);

describe("foglio dei Risultati su mobile — ancoraggio e punti di aggancio", () => {
  it("parte chiuso: altezza = punto chiuso (fino al fondo dello schermo), mappa al 40%", () => {
    renderScreen();
    expect(sheet()).toHaveAttribute("data-snap", "collapsed");
    expect(sheetHeight()).toBe(`${COLLAPSED}px`);
    expect(mapHeight()).toBe(`${MAP_BASE}px`);
  });

  it("è ancorato in basso (bottom-0) e il fondo tiene lo spazio della barra inferiore: nessuno spazio morto", () => {
    renderScreen();
    expect(sheet()).toHaveClass("absolute", "bottom-0", "inset-x-0");
    const footer = screen.getByTestId("sheet-footer");
    expect(footer).toHaveClass("pb-[var(--bottom-nav-clearance)]");
    expect(footer).toContainElement(screen.getByTestId("prices-banner"));
    expect(sheet().parentElement).not.toHaveClass("pb-28");
  });

  it("la maniglia è un <button> con anello di focus visibile da tastiera", () => {
    renderScreen();
    expect(handle().tagName).toBe("BUTTON");
    expect(handle()).toHaveClass("focus-visible:ring-2");
  });

  it("con prefers-reduced-motion l'aggancio è senza transizione; altrimenti ~200 ms ease-out (foglio e mappa)", () => {
    renderScreen();
    expect(sheet()).toHaveClass("transition-[height]", "duration-200", "ease-out", "motion-reduce:transition-none");
    expect(mapRegion()).toHaveClass("transition-[height]", "duration-200", "ease-out", "motion-reduce:transition-none");
  });
});

describe("foglio dei Risultati — accessibilità per stato", () => {
  it("aria-expanded è false SOLO da ridotto, true da chiuso e da espanso; l'etichetta dice cosa fa il prossimo tocco", () => {
    renderScreen();
    // chiuso
    expect(handle()).toHaveAttribute("aria-expanded", "true");
    expect(handle()).toHaveAccessibleName("Espandi elenco stazioni");
    // ridotto
    dragDown(400);
    expect(sheet()).toHaveAttribute("data-snap", "minimized");
    expect(handle()).toHaveAttribute("aria-expanded", "false");
    expect(handle()).toHaveAccessibleName("Espandi elenco stazioni");
    // espanso
    dragUp(700);
    expect(sheet()).toHaveAttribute("data-snap", "expanded");
    expect(handle()).toHaveAttribute("aria-expanded", "true");
    expect(handle()).toHaveAccessibleName("Comprimi elenco stazioni");
  });
});

describe("foglio dei Risultati — trascinamento a tre punti", () => {
  it("sequenza giù fino a ridotto → su fino a espanso → ritorno a chiuso", () => {
    renderScreen();
    dragDown(400); // 446 − 400 = 46: oltre il ridotto, si aggancia a 106
    expect(sheet()).toHaveAttribute("data-snap", "minimized");
    expect(sheetHeight()).toBe(`${MINIMIZED}px`);

    dragUp(700); // 106 + 700 = 806: oltre l'espanso (elastico), si aggancia a 717
    expect(sheet()).toHaveAttribute("data-snap", "expanded");
    expect(sheetHeight()).toBe(`${EXPANDED}px`);

    dragDown(270); // 717 − 270 = 447 → chiuso
    expect(sheet()).toHaveAttribute("data-snap", "collapsed");
    expect(sheetHeight()).toBe(`${COLLAPSED}px`);
  });

  it("da ridotto un trascinamento breve verso l'alto porta a chiuso, uno lungo a espanso", () => {
    renderScreen();
    dragDown(400);
    expect(sheet()).toHaveAttribute("data-snap", "minimized");
    dragUp(300); // 106 + 300 = 406 → più vicino a 446
    expect(sheet()).toHaveAttribute("data-snap", "collapsed");
    dragDown(400);
    dragUp(560); // 106 + 560 = 666 → più vicino a 717
    expect(sheet()).toHaveAttribute("data-snap", "expanded");
  });

  it("verso il basso: poco sposta e torna a chiuso, abbastanza (oltre metà corsa) riduce", () => {
    renderScreen();
    dragDown(60); // 386: più vicino a 446
    expect(sheet()).toHaveAttribute("data-snap", "collapsed");
    dragDown(200); // 246: più vicino a 106
    expect(sheet()).toHaveAttribute("data-snap", "minimized");
  });

  it("l'altezza segue il dito mentre si trascina, senza transizione, e resta dentro la regione (mai il 100%)", () => {
    renderScreen();
    pointer("pointerDown", header(), 700);
    pointer("pointerMove", header(), 600); // su di 100 px
    expect(sheet()).toHaveAttribute("data-dragging", "true");
    expect(sheet()).toHaveClass("transition-none");
    expect(sheetHeight()).toBe(`${COLLAPSED + 100}px`);
    pointer("pointerMove", header(), 100); // su di 600 px: oltre l'espanso, con resistenza
    const stretched = parseFloat(sheetHeight());
    expect(stretched).toBeGreaterThan(EXPANDED);
    expect(stretched).toBeLessThan(CONTAINER); // header e mappa restano visibili
    pointer("pointerMove", header(), -4000); // dito fuori schermo: sempre sotto la regione
    expect(parseFloat(sheetHeight())).toBeLessThan(CONTAINER);
    pointer("pointerUp", header(), -4000);
    expect(sheet()).toHaveAttribute("data-dragging", "false");
    expect(sheet()).not.toHaveClass("transition-none");
    expect(sheetHeight()).toBe(`${EXPANDED}px`);
  });

  it("verso il basso oltre il ridotto c'è l'elasticità (mai sotto ridotto − 40 px) e al rilascio torna al ridotto", () => {
    renderScreen();
    pointer("pointerDown", header(), 300);
    pointer("pointerMove", header(), 300 + 346); // 446 − 346 = 100: leggermente sotto il ridotto (106)
    const h = parseFloat(sheetHeight());
    expect(h).toBeLessThan(MINIMIZED);
    pointer("pointerMove", header(), 5000);
    expect(parseFloat(sheetHeight())).toBeGreaterThan(MINIMIZED - 40);
    pointer("pointerUp", header(), 5000);
    expect(sheetHeight()).toBe(`${MINIMIZED}px`);
  });

  it("la mappa si allunga fino al foglio quando questo scende sotto «chiuso» (anche durante il trascinamento) e torna al 40% altrimenti", () => {
    renderScreen();
    expect(mapHeight()).toBe(`${MAP_BASE}px`);
    pointer("pointerDown", header(), 400);
    pointer("pointerMove", header(), 420); // giù di 20 px: 426 < 446
    expect(mapHeight()).toBe(`${MAP_TALL}px`);
    pointer("pointerMove", header(), 300); // su di 100 px: di nuovo sopra il chiuso
    expect(mapHeight()).toBe(`${MAP_BASE}px`);
    pointer("pointerMove", header(), 700); // giù di 300
    pointer("pointerUp", header(), 700);
    expect(sheet()).toHaveAttribute("data-snap", "minimized");
    expect(mapHeight()).toBe(`${MAP_TALL}px`); // occupa tutto lo spazio restante
    dragUp(700);
    expect(sheet()).toHaveAttribute("data-snap", "expanded");
    expect(mapHeight()).toBe(`${MAP_BASE}px`);
  });

  it("da ridotto il contenuto (elenco e banner) è nascosto con visibility (fuori dall'ordine di Tab) con ritardo pari all'aggancio; mentre si trascina, o in altri punti, è visibile", () => {
    renderScreen();
    expect(screen.getByTestId("sheet-scroll")).not.toHaveClass("invisible");
    dragDown(400);
    for (const el of [screen.getByTestId("sheet-scroll"), screen.getByTestId("sheet-footer")]) {
      expect(el).toHaveClass("invisible", "delay-200", "motion-reduce:delay-0");
    }
    pointer("pointerDown", header(), 800);
    pointer("pointerMove", header(), 500); // su di 300 px da ridotto: il contenuto si vede subito
    expect(screen.getByTestId("sheet-scroll")).not.toHaveClass("invisible");
    pointer("pointerUp", header(), 500);
    expect(sheet()).toHaveAttribute("data-snap", "collapsed");
    expect(screen.getByTestId("sheet-footer")).not.toHaveClass("invisible");
  });

  it("il puntatore si cattura (setPointerCapture) alla pressione: il mouse non ha cattura implicita e la striscia è alta 18 px", () => {
    renderScreen();
    const capture = vi.fn();
    (header() as unknown as { setPointerCapture: typeof capture }).setPointerCapture = capture;
    pointer("pointerDown", header(), 700, 7);
    expect(capture).toHaveBeenCalledTimes(1);
    expect(capture).toHaveBeenCalledWith(7);
    pointer("pointerMove", header(), 698, 7); // 2 px: ancora un tocco, il foglio non si muove
    expect(sheet()).toHaveAttribute("data-dragging", "false");
    pointer("pointerMove", header(), 600, 7);
    expect(sheet()).toHaveAttribute("data-dragging", "true");
  });

  it("si trascina SOLO da maniglia e testata: dall'elenco il foglio non si muove (l'elenco ha il suo scorrimento)", () => {
    renderScreen();
    const list = screen.getByTestId("sheet-scroll");
    drag(list, 700, 300);
    drag(list, 300, 700);
    expect(sheet()).toHaveAttribute("data-snap", "collapsed");
    expect(sheet()).toHaveAttribute("data-dragging", "false");
    expect(sheetHeight()).toBe(`${COLLAPSED}px`);
    expect(list).toHaveClass("overflow-y-auto");
    expect(header()).toHaveClass("touch-none");
    expect(list).not.toHaveClass("touch-none");
  });

  it("un secondo dito (altro pointerId) non interferisce", () => {
    renderScreen();
    pointer("pointerDown", header(), 700, 1);
    pointer("pointerMove", header(), 300, 2);
    expect(sheet()).toHaveAttribute("data-dragging", "false");
    pointer("pointerUp", header(), 300, 2);
    pointer("pointerMove", header(), 600, 1);
    expect(sheet()).toHaveAttribute("data-dragging", "true");
    pointer("pointerCancel", header(), 600, 1);
    expect(sheet()).toHaveAttribute("data-dragging", "false");
  });
});

describe("foglio dei Risultati — tocco, tastiera, ripristino e invarianza", () => {
  it("il ciclo del tocco: chiuso → espanso → chiuso → espanso…; il tocco NON riduce mai", async () => {
    const user = userEvent.setup();
    renderScreen();
    const seen: string[] = [];
    for (let i = 0; i < 4; i++) {
      await user.click(handle());
      seen.push(sheet().getAttribute("data-snap")!);
    }
    expect(seen).toEqual(["expanded", "collapsed", "expanded", "collapsed"]);
    expect(seen).not.toContain("minimized");
  });

  it("da ridotto il tocco sulla maniglia porta a chiuso (non a espanso)", async () => {
    const user = userEvent.setup();
    renderScreen();
    dragDown(400);
    expect(sheet()).toHaveAttribute("data-snap", "minimized");
    await user.click(handle());
    expect(sheet()).toHaveAttribute("data-snap", "collapsed");
    expect(sheetHeight()).toBe(`${COLLAPSED}px`);
    await user.click(handle());
    expect(sheet()).toHaveAttribute("data-snap", "expanded");
  });

  it("Invio e Spazio sul pulsante seguono lo stesso ciclo", async () => {
    const user = userEvent.setup();
    renderScreen();
    handle().focus();
    await user.keyboard("{Enter}");
    expect(sheet()).toHaveAttribute("data-snap", "expanded");
    await user.keyboard(" ");
    expect(sheet()).toHaveAttribute("data-snap", "collapsed");
  });

  it("il tocco sulla scheda «Risultati» già attiva (evento della barra) riporta da ridotto a chiuso", () => {
    renderScreen();
    dragDown(400);
    expect(sheet()).toHaveAttribute("data-snap", "minimized");
    act(() => void window.dispatchEvent(new Event(RESULTS_TAB_RESELECTED_EVENT)));
    expect(sheet()).toHaveAttribute("data-snap", "collapsed");
    expect(sheetHeight()).toBe(`${COLLAPSED}px`);
    expect(mapHeight()).toBe(`${MAP_BASE}px`);
  });

  it("lo stesso evento da chiuso o da espanso non cambia nulla", () => {
    renderScreen();
    act(() => void window.dispatchEvent(new Event(RESULTS_TAB_RESELECTED_EVENT)));
    expect(sheet()).toHaveAttribute("data-snap", "collapsed");
    dragUp(700);
    act(() => void window.dispatchEvent(new Event(RESULTS_TAB_RESELECTED_EVENT)));
    expect(sheet()).toHaveAttribute("data-snap", "expanded");
  });

  it("lo stato non si salva: una nuova ricerca (nuovo searchId) riparte da chiuso; a pari ricerca resta com'è", () => {
    const { rerender } = renderScreen();
    dragDown(400);
    expect(sheet()).toHaveAttribute("data-snap", "minimized");
    rerender(screenFor(makeState("s1"))); // stessa ricerca (es. nuovo rendering): invariato
    expect(sheet()).toHaveAttribute("data-snap", "minimized");
    rerender(screenFor(makeState("s2")));
    expect(sheet()).toHaveAttribute("data-snap", "collapsed");
    expect(sheetHeight()).toBe(`${COLLAPSED}px`);
    dragUp(700);
    expect(sheet()).toHaveAttribute("data-snap", "expanded");
    rerender(screenFor(makeState("s3")));
    expect(sheet()).toHaveAttribute("data-snap", "collapsed");
  });

  it("dopo un trascinamento il clic che il mouse può generare NON cambia di nuovo il foglio", () => {
    vi.useFakeTimers();
    try {
      renderScreen();
      dragUp(300);
      expect(sheet()).toHaveAttribute("data-snap", "expanded");
      fireEvent.click(handle()); // clic subito dopo il rilascio
      expect(sheet()).toHaveAttribute("data-snap", "expanded");
      act(() => void vi.advanceTimersByTime(5));
      fireEvent.click(handle()); // un clic vero, dopo
      expect(sheet()).toHaveAttribute("data-snap", "collapsed");
    } finally {
      vi.useRealTimers();
    }
  });

  it("tutti i contenuti dell'elenco restano (filtri, prezzo di riferimento, schede, banner)", () => {
    renderScreen();
    dragUp(300);
    expect(screen.getByRole("group", { name: "Ordina per" })).toBeInTheDocument();
    expect(screen.getByTestId("reference-price")).toBeInTheDocument();
    expect(screen.getAllByTestId("station-card").length).toBeGreaterThan(0);
    expect(screen.getByTestId("prices-banner")).toBeInTheDocument();
  });

  it("desktop (≥md) invariato: pannello laterale di 440 px, altezza dai margini, nessuna maniglia né transizioni, mappa a tutta pagina", () => {
    renderScreen();
    expect(sheet()).toHaveClass("md:left-space-lg", "md:top-space-lg", "md:bottom-28", "md:w-[440px]", "md:h-auto", "md:rounded-3xl", "md:transition-none");
    expect(header()).toHaveClass("md:hidden");
    expect(mapRegion()).toHaveClass("md:absolute", "md:inset-0", "md:h-auto", "md:transition-none");
    expect(screen.getByTestId("sheet-footer")).toHaveClass("md:pb-0");
  });

  it("se il layout non è misurabile (contenitore nascosto) il foglio e la mappa usano il ripiego in CSS e non scrivono altezze a zero", () => {
    Reflect.deleteProperty(proto, "clientHeight");
    renderScreen();
    expect(sheetHeight()).toBe("");
    expect(mapHeight()).toBe("");
    expect(sheet().className).toContain("h-[var(--sheet-h,calc(100%_-_40vh_+_12px))]");
    expect(mapRegion().className).toContain("h-[var(--map-h,40vh)]");
  });
});

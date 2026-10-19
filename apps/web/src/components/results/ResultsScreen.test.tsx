import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SearchState } from "../../hooks/useSearch";
import { brandLogoUrl } from "../../lib/brandLogos";
import { makeDivergingResults, makeNearbyResponse, makeResponse, makeResult, makeTiedDetourResults, NEARBY_REQUEST, REQUEST } from "../../test/fixtures";
import type { MapStation } from "./MapCanvas";

// Mapbox GL richiede WebGL, assente in jsdom: la mappa è sostituita da uno stub che espone le props ricevute.
interface StubProps {
  geometry: ReadonlyArray<[number, number]>;
  center?: readonly [number, number] | null;
  radiusKm?: number;
  stations: MapStation[];
  selectedId: number | null;
  stopRoute: ReadonlyArray<[number, number]> | null;
  onSelectStation: (id: number) => void;
  onDeselect: () => void;
}
const mapProps: { current: StubProps | null } = { current: null };
vi.mock("./MapView", () => ({
  MapView: (props: StubProps) => {
    mapProps.current = props;
    return (
      <div data-testid="map-stub" data-stop-route={props.stopRoute ? props.stopRoute.length : "none"}>
        {props.stations.map((s) => s.id).join(",")}
      </div>
    );
  },
}));

import { ResultsScreen as RealResultsScreen } from "./ResultsScreen";

type SuccessState = Extract<SearchState, { status: "success" }>;

// Tap su scheda o «Info»: la schermata chiede di aprire il dettaglio (la navigazione è di App, qui si osserva soltanto).
const openStation = vi.fn();
const applyRouteOptions = vi.fn();
const NO_EXCLUSIONS = { avoidMotorway: false, avoidTolls: false, avoidFerries: false };
function ResultsScreen({
  state,
  routeDefaults = NO_EXCLUSIONS,
  searching,
  onOpenFreshnessSettings,
}: {
  state: SuccessState;
  routeDefaults?: typeof NO_EXCLUSIONS;
  searching?: boolean;
  onOpenFreshnessSettings?: () => void;
}) {
  return (
    <RealResultsScreen
      state={state}
      onOpenStation={openStation}
      routeDefaults={routeDefaults}
      onApplyRouteOptions={applyRouteOptions}
      onOpenFreshnessSettings={onOpenFreshnessSettings}
      searching={searching}
    />
  );
}

function makeState(overrides: Partial<SuccessState> = {}): SuccessState {
  const response = overrides.response ?? makeResponse();
  return {
    status: "success",
    response,
    results: response.results,
    refinement: response.refinement,
    request: REQUEST,
    labels: { origin: "Via Roma 1, 20100 Milano città metropolitana di Milano, Italia", destination: "Piazza Maggiore, 40124 Bologna, Italia" },
    ...overrides,
  };
}

const cardIds = () => screen.getAllByTestId("station-card").map((el) => Number(el.getAttribute("data-station-id")));

let fetchSpy: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchSpy = vi.fn();
  vi.stubGlobal("fetch", fetchSpy);
  mapProps.current = null;
  openStation.mockReset();
  applyRouteOptions.mockReset();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ResultsScreen — contenuto", () => {
  it("mostra capsula di telemetria, elenco e nome delle stazioni", () => {
    render(<ResultsScreen state={makeState()} />);

    expect(screen.getByTitle("Milano → Bologna")).toBeInTheDocument();
    expect(screen.getByTitle("Milano → Bologna")).toHaveTextContent("Milano→Bologna"); // partenza e destinazione si accorciano ciascuna
    expect(screen.getByText("217 km")).toBeInTheDocument();
    expect(screen.getByText("2h 33m")).toBeInTheDocument();
    expect(screen.getByText("3 staz.")).toBeInTheDocument();
    expect(cardIds()).toEqual([1, 2, 3]);
    expect(screen.getByRole("heading", { name: "Alfa Autostrada" })).toBeInTheDocument();
  });

  it("la card mostra brand (logo o iniziali), prezzo, deviazione e risparmio", () => {
    render(<ResultsScreen state={makeState()} />);
    const card = screen.getAllByTestId("station-card")[0]!;

    // Agip Eni ha il logo (file locale, alt vuoto); Pompe Bianche (segnaposto generico del Ministero) ripiega sulle iniziali.
    const logo = within(card).getByTestId("brand-avatar").querySelector("img")!;
    expect(logo.getAttribute("src")).toBe(brandLogoUrl("Agip Eni"));
    expect(logo.getAttribute("alt")).toBe("");
    expect(within(screen.getAllByTestId("station-card")[2]!).getByTestId("brand-avatar")).toHaveTextContent("PB");
    expect(within(card).getByText("€1,890")).toBeInTheDocument();
    expect(within(card).getByText("Benzina Self")).toBeInTheDocument();
    expect(within(card).getByText(/~\+3,0 km \(\+3 min\)/)).toBeInTheDocument(); // stima proxy → "~"
    expect(within(card).getByText(/Risparmi ~€ 12,00/)).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: /Info su/ })).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: /Naviga verso/ })).toBeInTheDocument();
  });

  it("le cifre sono tabulari (tabular-nums) su prezzi, distanze e importi", () => {
    render(<ResultsScreen state={makeState()} />);
    const card = screen.getAllByTestId("station-card")[0]!;
    expect(within(card).getByText("€1,890")).toHaveClass("tabular-nums");
    expect(within(card).getByText(/Risparmi/)).toHaveClass("tabular-nums");
    expect(screen.getByText("3 staz.")).toHaveClass("tabular-nums");
  });

  it("un risparmio negativo è «Non conviene» e una verifica sul routing reale toglie la tilde", () => {
    render(<ResultsScreen state={makeState()} />);
    const gamma = screen.getAllByTestId("station-card")[2]!;
    expect(within(gamma).getByText(/Non conviene € 2,00/)).toBeInTheDocument();
    expect(within(gamma).getByText(/\+1,5 km/)).not.toHaveTextContent("~");
    expect(within(gamma).getByText("Solo servito")).toBeInTheDocument();
  });

  it("la card mostra la deviazione verificata se disponibile, altrimenti la stima proxy con «~»", () => {
    const results = [
      makeResult({ station: { id: 1 }, detourSource: "routing", detourKm: 1.6, detourMinutes: 2.9, netSavings: 6 }),
      makeResult({ station: { id: 2 }, detourSource: "proxy", detourKm: 2, detourMinutes: 3, netSavings: 5 }),
    ];
    render(<ResultsScreen state={makeState({ response: makeResponse({ results }), results })} />);
    const [verified, estimated] = screen.getAllByTestId("station-card");

    const verifiedPill = within(verified!).getByText(/\+1,6 km/);
    expect(verifiedPill).toHaveTextContent("+1,6 km (+3 min)");
    expect(verifiedPill).not.toHaveTextContent("~");
    expect(verifiedPill).toHaveAttribute("title", "Calcolato sul percorso reale");
    expect(within(verified!).getByText(/Risparmi/)).not.toHaveTextContent("~");

    const estimatedPill = within(estimated!).getByText(/\+2,0 km/);
    expect(estimatedPill).toHaveTextContent("~+2,0 km (+3 min)");
    expect(estimatedPill).toHaveAttribute("title", expect.stringContaining("Stima"));
    expect(within(estimated!).getByText(/Risparmi/)).toHaveTextContent("~");
  });

  it("i pin sulla mappa ricevono l'indirizzo del logo della bandiera (file locale) o null se non ce l'ha", () => {
    render(<ResultsScreen state={makeState()} />);
    const byId = new Map(mapProps.current!.stations.map((s) => [s.id, s.logoUrl]));
    expect(byId.get(1)).toBe(brandLogoUrl("Agip Eni")); // Alfa Autostrada
    expect(byId.get(2)).toBe(brandLogoUrl("Q8"));
    expect(byId.get(3)).toBeNull(); // Pompe Bianche: segnaposto generico → solo il prezzo
    for (const url of byId.values()) if (url !== null) expect(url).toMatch(/^\/brands\/\d+\.png$/);
  });

  it("solo la stazione con il maggior risparmio ha il badge «Migliore»", () => {
    render(<ResultsScreen state={makeState()} />);
    const badges = screen.getAllByText("Migliore");
    expect(badges).toHaveLength(1);
    expect(badges[0]!.closest("[data-testid=station-card]")).toHaveAttribute("data-station-id", "1");
    expect(mapProps.current?.stations.filter((s) => s.best).map((s) => s.id)).toEqual([1]);
  });

  it("dichiara il prezzo di riferimento e il livello usato (P_avg)", () => {
    render(<ResultsScreen state={makeState()} />);
    expect(screen.getByTestId("reference-price")).toHaveTextContent("Prezzo di riferimento €2,150/L (prezzo tipico di 40 stazioni sul percorso)");
  });

  it("nessun «Migliore» se nessuna stazione conviene", () => {
    const results = [makeResult({ station: { id: 1 }, netSavings: -1 }), makeResult({ station: { id: 2 }, netSavings: 0 })];
    render(<ResultsScreen state={makeState({ response: makeResponse({ results }), results })} />);
    expect(screen.queryByText("Migliore")).not.toBeInTheDocument();
  });

  it("nessuna stazione → messaggio, senza card", () => {
    render(<ResultsScreen state={makeState({ response: makeResponse({ results: [] }), results: [] })} />);
    expect(screen.getByText("Nessuna stazione conveniente sul percorso")).toBeInTheDocument();
    expect(screen.queryAllByTestId("station-card")).toHaveLength(0);
  });
});

describe("ResultsScreen — avviso «stazioni non mostrate» per età del prezzo", () => {
  const stateWith = (count: number, maxAgeHours = 72) => makeState({ response: makeResponse({ staleStations: { count, maxAgeHours } }) });

  it("a zero non compare (nessun rumore)", () => {
    render(<ResultsScreen state={stateWith(0)} onOpenFreshnessSettings={vi.fn()} />);
    expect(screen.queryByTestId("stale-notice")).not.toBeInTheDocument();
  });

  it("dice quante stazioni non sono mostrate e la soglia usata, al plurale e al singolare", () => {
    const { unmount } = render(<ResultsScreen state={stateWith(60)} onOpenFreshnessSettings={vi.fn()} />);
    expect(screen.getByTestId("stale-notice")).toHaveTextContent("60 stazioni non mostrate: prezzo non aggiornato da più di 72 h");
    unmount();
    render(<ResultsScreen state={stateWith(1, 120)} onOpenFreshnessSettings={vi.fn()} />);
    expect(screen.getByTestId("stale-notice")).toHaveTextContent("1 stazione non mostrata: prezzo non aggiornato da più di 120 h");
  });

  it("«Cambia soglia» porta alla soglia nelle Impostazioni; senza il gestore dell'azione resta solo l'informazione", async () => {
    const user = userEvent.setup();
    const go = vi.fn();
    const { unmount } = render(<ResultsScreen state={stateWith(5)} onOpenFreshnessSettings={go} />);
    await user.click(within(screen.getByTestId("stale-notice")).getByRole("button", { name: "Cambia soglia" }));
    expect(go).toHaveBeenCalledTimes(1);
    unmount();
    render(<ResultsScreen state={stateWith(5)} />);
    expect(screen.getByTestId("stale-notice")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cambia soglia" })).not.toBeInTheDocument();
  });

  it("una risposta senza il campo (server più vecchio) non rompe la schermata", () => {
    const response = makeResponse();
    delete (response as { staleStations?: unknown }).staleStations;
    render(<ResultsScreen state={makeState({ response })} />);
    expect(screen.queryByTestId("stale-notice")).not.toBeInTheDocument();
  });
});

describe("ResultsScreen — ordinamento e filtri (client-side, senza rete)", () => {
  it("«Minor deviazione» riordina l'elenco e la mappa, e «Più conveniente» li ripristina, senza alcuna chiamata di rete", async () => {
    const user = userEvent.setup();
    render(<ResultsScreen state={makeState()} />);
    expect(cardIds()).toEqual([1, 2, 3]);

    await user.click(screen.getByRole("button", { name: "Minor deviazione" }));
    expect(cardIds()).toEqual([2, 3, 1]);
    expect(screen.getByTestId("map-stub")).toHaveTextContent("2,3,1");

    await user.click(screen.getByRole("button", { name: "Più conveniente" }));
    expect(cardIds()).toEqual([1, 2, 3]);

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("restano solo due ordinamenti: «Sul percorso» non c'è più", () => {
    render(<ResultsScreen state={makeState()} />);
    const group = screen.getByRole("group", { name: "Ordina per" });
    expect(within(group).getAllByRole("button").map((b) => b.textContent)).toEqual(["Più conveniente", "Minor deviazione"]);
    expect(screen.queryByRole("button", { name: "Sul percorso" })).not.toBeInTheDocument();
  });

  it("il chip attivo è verde (bg-primary) e l'inattivo no; lo stato è esposto con aria-pressed", async () => {
    const user = userEvent.setup();
    render(<ResultsScreen state={makeState()} />);
    const savings = screen.getByRole("button", { name: "Più conveniente" });
    const detour = screen.getByRole("button", { name: "Minor deviazione" });
    expect(savings).toHaveAttribute("aria-pressed", "true");
    expect(savings).toHaveClass("bg-primary-strong", "text-on-primary");
    expect(detour).toHaveAttribute("aria-pressed", "false");
    expect(detour).not.toHaveClass("bg-primary-strong");

    await user.click(detour);
    expect(detour).toHaveClass("bg-primary-strong");
    expect(savings).not.toHaveClass("bg-primary-strong");
  });

  it("«Solo Self» nasconde le stazioni solo servito e si può disattivare (ricerca fatta senza Solo Self)", async () => {
    const user = userEvent.setup();
    render(<ResultsScreen state={makeState()} />);
    const pill = screen.getByRole("button", { name: "Solo Self" });
    expect(pill).toHaveAttribute("aria-pressed", "false");
    expect(pill).toBeEnabled();

    await user.click(pill);
    expect(cardIds()).toEqual([1, 2]);
    expect(screen.getByText("2 staz.")).toBeInTheDocument();

    await user.click(pill);
    expect(cardIds()).toEqual([1, 2, 3]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("se la ricerca era già «Solo Self» la pill è attiva e bloccata (non c'è nulla da aggiungere lato client)", () => {
    render(<ResultsScreen state={makeState({ request: { ...REQUEST, onlySelf: true } })} />);
    const pill = screen.getByRole("button", { name: "Solo Self" });
    expect(pill).toHaveAttribute("aria-pressed", "true");
    expect(pill).toBeDisabled();
  });

  it("«Autostrada» filtra per Tipo Impianto", async () => {
    const user = userEvent.setup();
    render(<ResultsScreen state={makeState()} />);

    await user.click(screen.getByRole("button", { name: "Autostrada" }));
    expect(cardIds()).toEqual([1]);
    expect(screen.getByText("1 staz.")).toBeInTheDocument();
    expect(mapProps.current?.stations.map((s) => s.id)).toEqual([1]);
  });

  it("filtri senza risultati → messaggio e «Azzera i filtri» ripristina l'elenco", async () => {
    const user = userEvent.setup();
    const results = [makeResult({ station: { id: 5, tipoImpianto: "stradale" } })];
    render(<ResultsScreen state={makeState({ response: makeResponse({ results }), results })} />);

    await user.click(screen.getByRole("button", { name: "Autostrada" }));
    expect(screen.getByText("Nessuna stazione con questi filtri")).toBeInTheDocument();
    expect(screen.queryAllByTestId("station-card")).toHaveLength(0);

    await user.click(screen.getByRole("button", { name: "Azzera i filtri" }));
    expect(cardIds()).toEqual([5]);
  });

  it("due ordinamenti che divergono per forza: ognuno riordina davvero l'elenco e la mappa, senza rete", async () => {
    const user = userEvent.setup();
    const results = makeDivergingResults();
    render(<ResultsScreen state={makeState({ response: makeResponse({ results }), results })} />);

    expect(screen.getByRole("button", { name: "Più conveniente" })).toHaveAttribute("aria-pressed", "true");
    expect(cardIds()).toEqual([11, 12, 13, 14]); // risparmio netto

    await user.click(screen.getByRole("button", { name: "Minor deviazione" }));
    expect(screen.getByRole("button", { name: "Minor deviazione" })).toHaveAttribute("aria-pressed", "true");
    expect(cardIds()).toEqual([12, 13, 14, 11]); // km extra
    expect(screen.getByTestId("map-stub")).toHaveTextContent("12,13,14,11");

    await user.click(screen.getByRole("button", { name: "Più conveniente" }));
    expect(cardIds()).toEqual([11, 12, 13, 14]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("«Minor deviazione» a pari km spareggia per distanza laterale, ordine di incontro e risparmio", async () => {
    const user = userEvent.setup();
    const results = makeTiedDetourResults();
    render(<ResultsScreen state={makeState({ response: makeResponse({ results }), results })} />);
    expect(cardIds()).toEqual([24, 21, 23, 22]); // risparmio
    await user.click(screen.getByRole("button", { name: "Minor deviazione" }));
    expect(cardIds()).toEqual([24, 23, 22, 21]);
  });

  it("una nuova ricerca (searchId diverso) riparte da filtri puliti", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<ResultsScreen state={makeState()} />);
    await user.click(screen.getByRole("button", { name: "Minor deviazione" }));
    await user.click(screen.getByRole("button", { name: "Autostrada" }));
    expect(cardIds()).toEqual([1]);

    rerender(<ResultsScreen state={makeState({ response: makeResponse({ searchId: "s2" }) })} />);
    expect(screen.getByRole("button", { name: "Più conveniente" })).toHaveAttribute("aria-pressed", "true");
    expect(cardIds()).toEqual([1, 2, 3]);
  });
});

describe("ResultsScreen — elenco lungo", () => {
  const many = (n: number) => Array.from({ length: n }, (_, i) => makeResult({ station: { id: 1000 + i }, netSavings: 100 - i }));

  it("mostra subito le prime 20 schede, «Mostra altre» aggiunge le successive; la mappa riceve tutte le stazioni", async () => {
    const user = userEvent.setup();
    const results = many(45);
    render(<ResultsScreen state={makeState({ response: makeResponse({ results }), results })} />);

    expect(screen.getAllByTestId("station-card")).toHaveLength(20);
    expect(mapProps.current?.stations).toHaveLength(45);
    expect(screen.getByText("45 staz.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Mostra altre 20 stazioni (25 rimaste)" }));
    expect(screen.getAllByTestId("station-card")).toHaveLength(40);
    await user.click(screen.getByRole("button", { name: "Mostra altre 5 stazioni (5 rimaste)" }));
    expect(screen.getAllByTestId("station-card")).toHaveLength(45);
    expect(screen.queryByRole("button", { name: /Mostra altre/ })).not.toBeInTheDocument();
  });

  it("toccare sulla mappa il pin di una stazione oltre le schede mostrate la rende visibile nell'elenco", async () => {
    const { act } = await import("@testing-library/react");
    const results = many(45);
    render(<ResultsScreen state={makeState({ response: makeResponse({ results }), results })} />);
    expect(document.getElementById("station-1035")).toBeNull();

    act(() => mapProps.current?.onSelectStation(1035));
    expect(document.getElementById("station-1035")).not.toBeNull();
    expect(document.getElementById("station-1035")).toHaveAttribute("aria-current", "true");
  });
});

describe("ResultsScreen — contrasto del testo piccolo (WCAG AA, regola ≤14px)", () => {
  it("nessun testo ≤14px usa text-primary, text-secondary o text-outline: si usano le varianti scure", () => {
    const { container } = render(<ResultsScreen state={makeState()} />);
    const small = container.querySelectorAll(".text-label-sm, .text-label-md, .text-label-lg, .text-body-sm, .text-body-md");
    expect(small.length).toBeGreaterThan(10);
    const weak = ["text-primary", "text-secondary", "text-outline"];
    const offenders = [...small].filter((el) => weak.some((cls) => el.classList.contains(cls))).map((el) => el.outerHTML.slice(0, 90));
    expect(offenders).toEqual([]);
  });

  it("pill di deviazione e avatar in azzurro usano on-secondary-fixed-variant; indirizzo e modalità in on-surface-variant", () => {
    render(<ResultsScreen state={makeState()} />);
    const card = screen.getAllByTestId("station-card")[1]!; // non «Migliore»
    expect(within(card).getByText(/\+0,4 km/)).toHaveClass("text-on-secondary-fixed-variant");
    // l'avatar con le iniziali (bandiera senza logo: Pompe Bianche, terza scheda) usa lo stesso azzurro scuro
    expect(within(screen.getAllByTestId("station-card")[2]!).getByText("PB")).toHaveClass("text-on-secondary-fixed-variant");
    expect(within(card).getByText("Benzina Self")).toHaveClass("text-on-surface-variant");
    expect(within(card).getByText("Via Roma 1 · Bregnano")).toHaveClass("text-on-surface-variant");
    expect(within(card).getByRole("button", { name: /Naviga verso/ })).toHaveClass("text-on-primary-fixed-variant");
  });

  it("il risparmio (pill verde chiara) e il conteggio in capsula usano il verde scuro", () => {
    render(<ResultsScreen state={makeState()} />);
    expect(within(screen.getAllByTestId("station-card")[0]!).getByText(/Risparmi/)).toHaveClass("text-on-primary-fixed-variant", "bg-primary/10");
    expect(screen.getByText("3 staz.")).toHaveClass("text-on-primary-fixed-variant");
  });
});

describe("ResultsScreen — «Opzioni percorso»", () => {
  const chip = () => screen.getByTestId("route-options-chip");
  const withOptions = (patch: Partial<typeof REQUEST>) => makeState({ request: { ...REQUEST, ...patch } });

  it("senza esclusioni è un chip-pulsante «Opzioni percorso» (nessuno stato attivo) e non c'è più il banner", () => {
    render(<ResultsScreen state={makeState()} />);
    expect(chip()).toHaveTextContent(/^Opzioni percorso$/);
    expect(chip()).toHaveAttribute("aria-haspopup", "dialog");
    expect(screen.queryByTestId("avoid-motorway-badge")).not.toBeInTheDocument();
    expect(screen.queryByText(/Evita autostrada attivo/)).not.toBeInTheDocument();
  });

  it("mostra lo stato attivo nel chip: «Opzioni percorso · senza autostrada»", () => {
    render(<ResultsScreen state={withOptions({ avoidMotorway: true })} />);
    expect(chip()).toHaveTextContent("Opzioni percorso · senza autostrada");
    expect(chip()).toBeVisible();
    expect(chip()).toHaveClass("rounded-full", "text-on-secondary-fixed-variant");
    expect(chip()).toHaveAttribute("title", expect.stringContaining("stesse opzioni"));
  });

  it("elenca più esclusioni: autostrada e pedaggi / autostrada, pedaggi e traghetti / solo traghetti", () => {
    const { rerender } = render(<ResultsScreen state={withOptions({ avoidMotorway: true, avoidTolls: true })} />);
    expect(chip()).toHaveTextContent("Opzioni percorso · senza autostrada e pedaggi");
    rerender(<ResultsScreen state={withOptions({ avoidMotorway: true, avoidTolls: true, avoidFerries: true })} />);
    expect(chip()).toHaveTextContent("Opzioni percorso · senza autostrada, pedaggi e traghetti");
    rerender(<ResultsScreen state={withOptions({ avoidFerries: true })} />);
    expect(chip()).toHaveTextContent("Opzioni percorso · senza traghetti");
  });

  it("il chip sta nel foglio dei risultati, sopra le schede", () => {
    render(<ResultsScreen state={withOptions({ avoidMotorway: true })} />);
    expect(screen.getByTestId("sheet-scroll")).toContainElement(chip());
    const firstCard = screen.getAllByTestId("station-card")[0]!;
    expect(chip().compareDocumentPosition(firstCard) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("il pulsante apre un foglio con tre toggle precompilati dalla ricerca corrente", async () => {
    const user = userEvent.setup();
    render(<ResultsScreen state={withOptions({ avoidTolls: true })} />);
    expect(screen.queryByRole("dialog", { name: "Opzioni percorso" })).not.toBeInTheDocument();
    await user.click(chip());

    const dialog = screen.getByRole("dialog", { name: "Opzioni percorso" });
    expect(dialog).toHaveClass("rounded-t-3xl");
    expect(within(dialog).getAllByRole("switch").map((s) => [s.getAttribute("aria-checked"), s.getAttribute("aria-labelledby") && document.getElementById(s.getAttribute("aria-labelledby")!)!.textContent])).toEqual([
      ["false", "Evita autostrade"],
      ["true", "Evita pedaggi"],
      ["false", "Evita traghetti"],
    ]);
  });

  it("le descrizioni del foglio seguono la regola editoriale (prima frase = effetto; l'ultima solo per ciò che non entra nel calcolo), senza «verifiche» né «Default»", async () => {
    const user = userEvent.setup();
    render(<ResultsScreen state={withOptions({})} />);
    await user.click(chip());
    const dialog = screen.getByRole("dialog", { name: "Opzioni percorso" });
    expect(within(dialog).getByText("Il percorso consigliato e il calcolo delle deviazioni evitano le autostrade.")).toBeInTheDocument();
    expect(within(dialog).getByText("Il percorso consigliato evita le strade a pedaggio. Il costo del pedaggio non è incluso nel risparmio calcolato.")).toBeInTheDocument();
    expect(within(dialog).getByText("Il percorso consigliato evita i traghetti.")).toBeInTheDocument();
    expect(dialog.textContent).not.toMatch(/verifiche|default|mediana|corridoio/i);
  });

  it("«Applica» rilancia la ricerca con le nuove esclusioni e chiude il foglio; la richiesta (A/B) la compone il chiamante", async () => {
    const user = userEvent.setup();
    render(<ResultsScreen state={withOptions({ avoidMotorway: true })} />);
    await user.click(chip());
    await user.click(screen.getByRole("switch", { name: "Evita pedaggi" }));
    await user.click(screen.getByRole("switch", { name: "Evita traghetti" }));
    await user.click(screen.getByRole("switch", { name: "Evita autostrade" })); // lo spegne
    await user.click(screen.getByRole("button", { name: "Applica" }));

    expect(applyRouteOptions).toHaveBeenCalledTimes(1);
    expect(applyRouteOptions).toHaveBeenCalledWith({ avoidMotorway: false, avoidTolls: true, avoidFerries: true });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("«Applica» è disattivato finché non cambia nulla: niente ricerche inutili", async () => {
    const user = userEvent.setup();
    render(<ResultsScreen state={withOptions({ avoidMotorway: true })} />);
    await user.click(chip());
    expect(screen.getByRole("button", { name: "Applica" })).toBeDisabled();
    await user.click(screen.getByRole("switch", { name: "Evita traghetti" }));
    expect(screen.getByRole("button", { name: "Applica" })).toBeEnabled();
    await user.click(screen.getByRole("switch", { name: "Evita traghetti" }));
    expect(screen.getByRole("button", { name: "Applica" })).toBeDisabled();
  });

  it("«Reimposta» riporta i toggle ai default delle Impostazioni (e non rilancia da sola)", async () => {
    const user = userEvent.setup();
    render(<ResultsScreen state={withOptions({ avoidMotorway: false, avoidTolls: true })} routeDefaults={{ avoidMotorway: true, avoidTolls: false, avoidFerries: true }} />);
    await user.click(chip());
    await user.click(screen.getByRole("button", { name: "Reimposta" }));

    expect(screen.getByRole("switch", { name: "Evita autostrade" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("switch", { name: "Evita pedaggi" })).toHaveAttribute("aria-checked", "false");
    expect(screen.getByRole("switch", { name: "Evita traghetti" })).toHaveAttribute("aria-checked", "true");
    expect(applyRouteOptions).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Applica" }));
    expect(applyRouteOptions).toHaveBeenCalledWith({ avoidMotorway: true, avoidTolls: false, avoidFerries: true });
  });

  it("chiudere senza applicare (Chiudi o Escape) non cambia nulla", async () => {
    const user = userEvent.setup();
    render(<ResultsScreen state={withOptions({})} />);
    await user.click(chip());
    await user.click(screen.getByRole("switch", { name: "Evita pedaggi" }));
    await user.click(screen.getByRole("button", { name: "Chiudi" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await user.click(chip());
    expect(screen.getByRole("switch", { name: "Evita pedaggi" })).toHaveAttribute("aria-checked", "false"); // ripartono dalla ricerca
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(applyRouteOptions).not.toHaveBeenCalled();
  });

  it("durante il ricalcolo i risultati restano, con un avviso, e il chip non si può riaprire", () => {
    render(<ResultsScreen state={withOptions({ avoidMotorway: true })} searching />);
    expect(screen.getByText("Ricalcolo con le nuove opzioni…")).toBeInTheDocument();
    expect(chip()).toBeDisabled();
    expect(screen.getAllByTestId("station-card").length).toBeGreaterThan(0);
  });
});

describe("ResultsScreen — pill «Autostrada» e «Evita autostrada»", () => {
  const pill = () => screen.getByRole("button", { name: "Autostrada" });

  it("con evita-autostrade la pill è disabilitata, grigia, con il tooltip «Non disponibile con Evita autostrada»", () => {
    render(<ResultsScreen state={makeState({ request: { ...REQUEST, avoidMotorway: true } })} />);
    expect(pill()).toBeDisabled();
    expect(pill()).toHaveAttribute("aria-pressed", "false");
    expect(pill()).toHaveAttribute("title", "Non disponibile con Evita autostrada");
    expect(pill()).toHaveClass("bg-surface-container-low", "opacity-50");
    expect(pill()).not.toHaveClass("bg-primary-strong");
  });

  it("senza evita-autostrade la pill è attiva e senza tooltip", () => {
    render(<ResultsScreen state={makeState()} />);
    expect(pill()).toBeEnabled();
    expect(pill()).not.toHaveAttribute("title");
  });

  it("se la pill è attiva e una nuova ricerca attiva evita-autostrade, si disattiva da sola (e l'elenco non è più filtrato)", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<ResultsScreen state={makeState()} />);
    await user.click(pill());
    expect(pill()).toHaveAttribute("aria-pressed", "true");
    expect(cardIds()).toEqual([1]);

    // Nuova ricerca (nuovo searchId) con evita-autostrade: tutti i risultati senza il filtro Tipo Impianto.
    const next = makeResponse({ searchId: "second-search" });
    rerender(<ResultsScreen state={makeState({ response: next, results: next.results, request: { ...REQUEST, avoidMotorway: true } })} />);
    expect(pill()).toBeDisabled();
    expect(pill()).toHaveAttribute("aria-pressed", "false");
    expect(cardIds()).toEqual([1, 2, 3]);
  });

  it("anche se evita-autostrade arriva senza cambiare ricerca, il filtro attivo decade", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<ResultsScreen state={makeState()} />);
    await user.click(pill());
    rerender(<ResultsScreen state={makeState({ request: { ...REQUEST, avoidMotorway: true } })} />);
    expect(pill()).toHaveAttribute("aria-pressed", "false");
    expect(cardIds()).toEqual([1, 2, 3]);
  });

  it("NESSUN auto-disable con evita-pedaggi (o traghetti): il filtro Tipo Impianto non dipende dal tracciato", async () => {
    const user = userEvent.setup();
    render(<ResultsScreen state={makeState({ request: { ...REQUEST, avoidTolls: true, avoidFerries: true } })} />);
    expect(pill()).toBeEnabled();
    await user.click(pill());
    expect(pill()).toHaveAttribute("aria-pressed", "true");
    expect(cardIds()).toEqual([1]);
  });
});

describe("ResultsScreen — prezzo di riferimento manuale", () => {

  it("riferimento impostato a mano: lo dichiara invece di parlare di mediane", () => {
    const response = makeResponse({ referencePrice: { value: 2.3, level: "manual", sampleSize: 0 } });
    render(<ResultsScreen state={makeState({ response, results: response.results })} />);
    expect(screen.getByTestId("reference-price")).toHaveTextContent("Prezzo di riferimento €2,300/L (impostato da te nelle Impostazioni)");
  });
});

describe("ResultsScreen — banner fonte dati", () => {
  it("mostra timestamp del file MIMIT e stato «in tempo reale»", () => {
    render(<ResultsScreen state={makeState()} />);
    const banner = screen.getByTestId("prices-banner");
    expect(banner).toHaveTextContent("MIMIT Osservaprezzi");
    expect(banner).toHaveTextContent(/file del 28 set 2026/);
    expect(banner).toHaveTextContent("Prezzi in tempo reale · aggiornati 4 min fa");
  });

  it.each([
    [{ status: "partial", tilesTotal: 37, tilesLive: 29, oldestLiveAgeMinutes: 1 } as const, "Tempo reale su 29 zone su 37 · per il resto file giornaliero"],
    [{ status: "unavailable", tilesTotal: 4, tilesLive: 0, oldestLiveAgeMinutes: null } as const, "Tempo reale non raggiungibile · uso il file giornaliero"],
    [{ status: "disabled", tilesTotal: 0, tilesLive: 0, oldestLiveAgeMinutes: null } as const, "Prezzi dal file giornaliero MIMIT"],
  ])("stato %j", (livePrices, text) => {
    render(<ResultsScreen state={makeState({ response: makeResponse({ livePrices }) })} />);
    expect(screen.getByTestId("prices-banner")).toHaveTextContent(text);
  });

  it("senza ingestione registrata lo dichiara invece di inventare una data", () => {
    render(<ResultsScreen state={makeState({ response: makeResponse({ pricesUpdatedAt: null }) })} />);
    expect(screen.getByTestId("prices-banner")).toHaveTextContent("nessuna ingestione registrata");
  });

  it("segnala la verifica del percorso in corso e nulla a verifica conclusa", () => {
    const { rerender } = render(<ResultsScreen state={makeState({ refinement: { status: "pending" } })} />);
    expect(screen.getByText("Calcolo le deviazioni reali delle migliori stazioni…")).toBeInTheDocument();
    rerender(<ResultsScreen state={makeState({ refinement: { status: "done" } })} />);
    expect(screen.queryByText(/Calcolo le deviazioni/)).not.toBeInTheDocument();
  });
});

describe("ResultsScreen — selezione, mappa e struttura", () => {
  it("toccare una card la seleziona e la passa alla mappa; un pin sulla mappa seleziona la card", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<ResultsScreen state={makeState()} />);

    await user.click(screen.getAllByTestId("station-card")[1]!);
    expect(screen.getAllByTestId("station-card")[1]).toHaveAttribute("aria-current", "true");
    expect(mapProps.current?.selectedId).toBe(2);

    const { act } = await import("@testing-library/react");
    act(() => mapProps.current?.onSelectStation(3));
    rerender(<ResultsScreen state={makeState()} />);
    expect(screen.getAllByTestId("station-card")[2]).toHaveAttribute("aria-current", "true");
    expect(screen.getAllByTestId("station-card")[1]).not.toHaveAttribute("aria-current");
  });

  it("il foglio scorre da solo: area scrollabile interna, separata dalla regione della mappa", () => {
    render(<ResultsScreen state={makeState()} />);
    const sheet = screen.getByTestId("bottom-sheet");
    const scroll = screen.getByTestId("sheet-scroll");
    expect(sheet).toHaveClass("rounded-t-3xl");
    expect(scroll).toHaveClass("overflow-y-auto");
    expect(sheet.contains(scroll)).toBe(true);
    expect(screen.getByTestId("map-region").contains(scroll)).toBe(false);
    expect(screen.getByTestId("map-region")).toHaveClass("h-[var(--map-h,40vh)]");
  });

  // jsdom non calcola il layout: si verificano le classi che lo producono (verifica visiva a 1280 px nel browser reale).
  it("la regione della mappa è un contesto di sovrapposizione isolato: pin, capsula e comandi non salgono mai sopra l'elenco", () => {
    render(<ResultsScreen state={makeState()} />);
    expect(screen.getByTestId("map-region")).toHaveClass("isolate");
    expect(screen.getByTestId("bottom-sheet")).toHaveClass("z-20");
  });

  it("su desktop la capsula di telemetria sta in alto a destra, oltre il pannello dell'elenco (440 px), non sotto", () => {
    render(<ResultsScreen state={makeState()} />);
    const capsule = screen.getByText("3 staz.").closest("div.absolute");
    expect(capsule).toHaveClass("md:right-space-md", "md:inset-x-auto"); // in alto a destra, larga quanto il contenuto
    expect(capsule).toHaveClass("md:max-w-[calc(100%-440px-3rem)]"); // mai oltre lo spazio libero a destra del pannello
    expect(capsule).toHaveClass("inset-x-space-md"); // su mobile resta a tutta larghezza
    expect(capsule).toHaveClass("md:max-lg:rounded-2xl"); // tra 768 e 1023 px (spazio stretto) la tratta va su una riga e i dati sotto
    expect(screen.getByTestId("bottom-sheet")).toHaveClass("md:w-[440px]");
  });

  // Il trascinamento e l'aggancio del foglio (chiuso/espanso) sono in BottomSheetDrag.test.tsx.
  it("la maniglia espande e comprime il foglio con un tocco (non lo riduce mai); la mappa resta al 40%", async () => {
    const user = userEvent.setup();
    render(<ResultsScreen state={makeState()} />);
    await user.click(screen.getByRole("button", { name: "Espandi elenco stazioni" }));
    expect(screen.getByTestId("bottom-sheet")).toHaveAttribute("data-snap", "expanded");
    expect(screen.getByTestId("map-region")).toHaveClass("h-[var(--map-h,40vh)]");
    await user.click(screen.getByRole("button", { name: "Comprimi elenco stazioni" }));
    expect(screen.getByTestId("bottom-sheet")).toHaveAttribute("data-snap", "collapsed");
  });

  it("le card non contengono elementi non derivabili dai dati MIMIT (uscita, orari, servizi)", () => {
    render(<ResultsScreen state={makeState()} />);
    expect(screen.queryByText(/Uscita/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Aperto ora/i)).not.toBeInTheDocument();
  });
});

describe("ResultsScreen — Info e Naviga (deep-link)", () => {
  const originalUA = navigator.userAgent;
  const setUA = (ua: string) => Object.defineProperty(window.navigator, "userAgent", { value: ua, configurable: true });
  afterEach(() => setUA(originalUA));

  it("«Info» apre il dettaglio stazione (Screen 3), non il menu di navigazione", async () => {
    const user = userEvent.setup();
    render(<ResultsScreen state={makeState()} />);
    const card = screen.getAllByTestId("station-card")[0]!;

    await user.click(within(card).getByRole("button", { name: /Info su/ }));
    expect(openStation).toHaveBeenCalledTimes(1);
    expect(openStation.mock.calls[0]![0].station.id).toBe(1);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await user.click(within(screen.getAllByTestId("station-card")[1]!).getByRole("button", { name: /Info su/ }));
    expect(openStation).toHaveBeenCalledTimes(2);
    expect(openStation.mock.calls[1]![0].station.id).toBe(2);
  });

  it("il tap sulla scheda SELEZIONA la stazione e NON naviga: il dettaglio si apre solo da «Info»", async () => {
    const user = userEvent.setup();
    render(<ResultsScreen state={makeState()} />);
    const card = screen.getAllByTestId("station-card")[1]!;

    await user.click(card);
    expect(card).toHaveAttribute("aria-current", "true");
    expect(mapProps.current?.selectedId).toBe(2);
    expect(openStation).not.toHaveBeenCalled();

    card.focus();
    await user.keyboard("{Enter}"); // anche da tastiera
    expect(openStation).not.toHaveBeenCalled();
  });

  it("Naviga su desktop apre il menu di scelta con Google Maps, Apple Maps e Waze, che si chiude con Esc", async () => {
    const user = userEvent.setup();
    setUA("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36");
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    render(<ResultsScreen state={makeState()} />);
    await user.click(within(screen.getAllByTestId("station-card")[0]!).getByRole("button", { name: /Naviga verso/ }));

    expect(open).not.toHaveBeenCalled();
    const dialog = screen.getByRole("dialog", { name: "Apri in navigatore" });
    const links = within(dialog).getAllByRole("link");
    expect(links.map((l) => l.textContent)).toEqual(["Google Maps", "Apple Maps", "Waze"]);
    for (const link of links) {
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", expect.stringContaining("noopener"));
    }
    expect(links[0]!.getAttribute("href")).toContain("destination=45.680000,9.050000");

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("Naviga su iPhone apre Apple Maps, su Android Google Maps, direttamente", async () => {
    const user = userEvent.setup();
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    render(<ResultsScreen state={makeState()} />);
    const naviga = () => within(screen.getAllByTestId("station-card")[0]!).getByRole("button", { name: /Naviga verso/ });

    setUA("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1");
    await user.click(naviga());
    expect(open).toHaveBeenLastCalledWith(expect.stringContaining("https://maps.apple.com/"), "_blank", "noopener,noreferrer");

    setUA("Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36");
    await user.click(naviga());
    expect(open).toHaveBeenLastCalledWith(expect.stringContaining("https://www.google.com/maps/dir/"), "_blank", "noopener,noreferrer");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("i pulsanti della card non selezionano la stazione (non propagano il click)", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "open").mockReturnValue(null);
    render(<ResultsScreen state={makeState()} />);
    const card = screen.getAllByTestId("station-card")[0]!;
    await user.click(within(card).getByRole("button", { name: /Info su/ }));
    expect(card).not.toHaveAttribute("aria-current");
    await user.click(within(card).getByRole("button", { name: /Naviga verso/ }));
    expect(card).not.toHaveAttribute("aria-current");
    expect(mapProps.current?.selectedId).toBeNull();
  });
});

describe("ResultsScreen — percorso con sosta (A→stazione→B)", () => {
  const STOP_GEOMETRY: Array<[number, number]> = [
    [9.204, 45.4864],
    [9.9, 45.1],
    [10.3, 45.0],
    [11.3426, 44.5058],
  ];
  const routeUrl = (id: number) => `/search/s1/stations/${id}/route`;
  const okResponse = (stationId: number) => ({
    ok: true,
    json: async () => ({ searchId: "s1", stationId, distanceKm: 220, durationMinutes: 156, detourKm: 1.6, detourMinutes: 2.9, geometry: STOP_GEOMETRY }),
  });

  it("senza stazione selezionata non disegna nessun percorso con sosta e non chiama il server", () => {
    render(<ResultsScreen state={makeState()} />);
    expect(screen.getByTestId("map-stub")).toHaveAttribute("data-stop-route", "none");
    expect(mapProps.current?.stopRoute).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("selezionando una card chiede il percorso della stazione e lo passa alla mappa", async () => {
    fetchSpy.mockResolvedValue(okResponse(2));
    const user = userEvent.setup();
    render(<ResultsScreen state={makeState()} />);

    await user.click(screen.getAllByTestId("station-card")[1]!); // stazione 2
    await waitFor(() => expect(screen.getByTestId("map-stub")).toHaveAttribute("data-stop-route", String(STOP_GEOMETRY.length)));

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(String(fetchSpy.mock.calls[0]![0])).toContain(routeUrl(2));
    expect(mapProps.current?.stopRoute).toEqual(STOP_GEOMETRY);
    expect(mapProps.current?.selectedId).toBe(2);
  });

  it("selezionando un pin sulla mappa chiede lo stesso percorso", async () => {
    fetchSpy.mockResolvedValue(okResponse(3));
    render(<ResultsScreen state={makeState()} />);
    act(() => mapProps.current!.onSelectStation(3));
    await waitFor(() => expect(mapProps.current?.stopRoute).toEqual(STOP_GEOMETRY));
    expect(String(fetchSpy.mock.calls[0]![0])).toContain(routeUrl(3));
  });

  it("deselezionando (secondo tap sulla card, tap sul pin selezionato o tap sullo sfondo della mappa) il percorso viene rimosso", async () => {
    fetchSpy.mockResolvedValue(okResponse(2));
    const user = userEvent.setup();
    render(<ResultsScreen state={makeState()} />);
    const card = screen.getAllByTestId("station-card")[1]!;

    await user.click(card);
    await waitFor(() => expect(mapProps.current?.stopRoute).toEqual(STOP_GEOMETRY));
    await user.click(card); // secondo tap sulla scheda
    expect(mapProps.current?.selectedId).toBeNull();
    expect(mapProps.current?.stopRoute).toBeNull();

    await user.click(card);
    await waitFor(() => expect(mapProps.current?.stopRoute).toEqual(STOP_GEOMETRY));
    act(() => mapProps.current!.onSelectStation(2)); // tap sul pin già selezionato
    expect(mapProps.current?.selectedId).toBeNull();
    expect(mapProps.current?.stopRoute).toBeNull();

    await user.click(card);
    await waitFor(() => expect(mapProps.current?.stopRoute).toEqual(STOP_GEOMETRY));
    act(() => mapProps.current!.onDeselect()); // tap sullo sfondo
    expect(mapProps.current?.selectedId).toBeNull();
    expect(mapProps.current?.stopRoute).toBeNull();
  });

  it("cambiando stazione il tracciato precedente sparisce subito e compare quello nuovo; riselezionare non rifà la chiamata", async () => {
    fetchSpy.mockImplementation(async (url: string) => okResponse(Number(/stations\/(\d+)\//.exec(url)![1])));
    const user = userEvent.setup();
    render(<ResultsScreen state={makeState()} />);
    const [first, second] = screen.getAllByTestId("station-card");

    await user.click(first!);
    await waitFor(() => expect(mapProps.current?.stopRoute).toEqual(STOP_GEOMETRY));
    await user.click(second!);
    expect(mapProps.current?.selectedId).toBe(2);
    await waitFor(() => expect(mapProps.current?.stopRoute).toEqual(STOP_GEOMETRY));
    expect(fetchSpy).toHaveBeenCalledTimes(2);

    await user.click(first!); // già in cache
    await waitFor(() => expect(mapProps.current?.stopRoute).toEqual(STOP_GEOMETRY));
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("routing non disponibile (kill switch / offline): nessun tracciato disegnato e il badge «stima» resta", async () => {
    fetchSpy.mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({ error: { code: "BUDGET_EXHAUSTED", message: "Limite mensile raggiunto." } }),
    });
    const user = userEvent.setup();
    render(<ResultsScreen state={makeState()} />);
    const card = screen.getAllByTestId("station-card")[0]!; // stazione 1: stima proxy

    await user.click(card);
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
    expect(mapProps.current?.selectedId).toBe(1);
    expect(mapProps.current?.stopRoute).toBeNull();
    expect(within(card).getByText(/~\+3,0 km/)).toHaveAttribute("title", expect.stringContaining("Stima"));
  });

  it("errore di rete: nessun tracciato e nessuna eccezione", async () => {
    fetchSpy.mockRejectedValue(new TypeError("Failed to fetch"));
    const user = userEvent.setup();
    render(<ResultsScreen state={makeState()} />);
    await user.click(screen.getAllByTestId("station-card")[0]!);
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
    expect(mapProps.current?.stopRoute).toBeNull();
  });

  it("se un filtro nasconde la stazione selezionata, selezione e percorso decadono", async () => {
    fetchSpy.mockResolvedValue(okResponse(2));
    const user = userEvent.setup();
    render(<ResultsScreen state={makeState()} />);
    await user.click(screen.getAllByTestId("station-card")[1]!); // stazione 2, non autostradale
    await waitFor(() => expect(mapProps.current?.stopRoute).toEqual(STOP_GEOMETRY));

    await user.click(screen.getByRole("button", { name: "Autostrada" }));
    expect(mapProps.current?.selectedId).toBeNull();
    expect(mapProps.current?.stopRoute).toBeNull();
  });
});

describe("ResultsScreen — «Intorno a me»", () => {
  const nearbyState = (results = makeNearbyResponse().results, extra: Partial<SuccessState> = {}): SuccessState => {
    const response = makeNearbyResponse({ results });
    return makeState({
      response,
      results,
      request: NEARBY_REQUEST,
      labels: { origin: "Via Roma 1, 20100 Milano città metropolitana di Milano, Italia", destination: "" },
      ...extra,
    });
  };

  it("la mappa non riceve un tracciato ma il punto di partenza e il raggio", () => {
    render(<ResultsScreen state={nearbyState()} />);
    expect(mapProps.current!.geometry).toEqual([]);
    expect(mapProps.current!.center).toEqual([9.204, 45.4864]);
    expect(mapProps.current!.radiusKm).toBe(5);
  });

  it("«In viaggio» continua a passare il tracciato alla mappa, senza punto né raggio", () => {
    render(<ResultsScreen state={makeState()} />);
    expect(mapProps.current!.geometry.length).toBeGreaterThan(0);
    expect(mapProps.current!.center).toBeNull();
    expect(mapProps.current!.radiusKm).toBeUndefined();
  });

  it("la capsula dice dove sei, il raggio e quante stazioni (niente tratta, distanza e durata)", () => {
    render(<ResultsScreen state={nearbyState()} />);
    const capsule = screen.getByTestId("nearby-capsule");
    expect(capsule).toHaveTextContent("Intorno a Milano");
    expect(capsule).toHaveTextContent("entro 5 km");
    expect(capsule).toHaveTextContent(/\d+ staz\./);
    expect(capsule).not.toHaveTextContent("→");
  });

  it("l'elenco è «Stazioni intorno a te» e il secondo ordinamento è «Più vicina» (non «Minor deviazione»)", () => {
    render(<ResultsScreen state={nearbyState()} />);
    expect(screen.getByRole("region", { name: "Stazioni intorno a te" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Più vicina/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Minor deviazione/ })).not.toBeInTheDocument();
  });

  it("«Più vicina» ordina per strada da fare", async () => {
    const user = userEvent.setup();
    const results = [
      makeResult({ station: { id: 1, nomeImpianto: "Lontana" }, detourKm: 8, netSavings: 5 }),
      makeResult({ station: { id: 2, nomeImpianto: "Vicina" }, detourKm: 2, netSavings: 3 }),
    ];
    render(<ResultsScreen state={nearbyState(results)} />);
    expect(within(screen.getByRole("list", { name: "Elenco stazioni" })).getAllByTestId("station-card")[0]).toHaveTextContent("Lontana");
    await user.click(screen.getByRole("button", { name: /Più vicina/ }));
    expect(within(screen.getByRole("list", { name: "Elenco stazioni" })).getAllByTestId("station-card")[0]).toHaveTextContent("Vicina");
  });

  it("il prezzo di riferimento è descritto come prezzo tipico delle stazioni nel raggio di ricerca", () => {
    render(<ResultsScreen state={nearbyState()} />);
    expect(screen.getByTestId("reference-price")).toHaveTextContent("prezzo tipico di 12 stazioni nel raggio di ricerca");
  });

  it("la scheda mostra la distanza di sola andata (metà del giro) e il giro andata e ritorno in fondo, non la posizione sul percorso", () => {
    const results = [makeResult({ station: { id: 1 }, detourKm: 4.2, detourMinutes: 8, detourSource: "routing", netSavings: 3 })];
    render(<ResultsScreen state={nearbyState(results)} />);
    const card = screen.getByTestId("station-card");
    expect(card).toHaveTextContent("a 2,1 km (4 min)");
    expect(card).toHaveTextContent("Andata e ritorno 4,2 km");
    expect(card).not.toHaveTextContent("dalla partenza");
    expect(card).not.toHaveTextContent("+4,2 km");
  });

  it("con la distanza ancora stimata compare la tilde, come per le deviazioni", () => {
    const results = [makeResult({ station: { id: 1 }, detourKm: 4.2, detourMinutes: 8, detourSource: "proxy", netSavings: 3 })];
    render(<ResultsScreen state={nearbyState(results)} />);
    expect(screen.getByTestId("station-card")).toHaveTextContent("a ~2,1 km (~4 min)");
    expect(screen.getByTestId("station-card")).toHaveTextContent("Andata e ritorno ~4,2 km");
  });

  it("«Nessuna stazione conviene…»: compare solo se nessuna stazione fa risparmiare, e l'elenco resta sotto", () => {
    const losing = [makeResult({ station: { id: 1 }, netSavings: -0.4 }), makeResult({ station: { id: 2 }, netSavings: -1.2 })];
    render(<ResultsScreen state={nearbyState(losing)} />);
    expect(screen.getByTestId("no-savings-notice")).toHaveTextContent("Nessuna stazione conviene rispetto al prezzo medio della zona");
    expect(screen.getAllByTestId("station-card")).toHaveLength(2);
  });

  it("non compare se almeno una stazione fa risparmiare, né quando l'elenco è vuoto", () => {
    const { unmount } = render(
      <ResultsScreen state={nearbyState([makeResult({ station: { id: 1 }, netSavings: 0.5 }), makeResult({ station: { id: 2 }, netSavings: -2 })])} />,
    );
    expect(screen.queryByTestId("no-savings-notice")).not.toBeInTheDocument();
    unmount();
    render(<ResultsScreen state={nearbyState([])} />);
    expect(screen.queryByTestId("no-savings-notice")).not.toBeInTheDocument();
  });

  it("in «In viaggio» l'avviso non c'è mai, anche se nessuna stazione conviene", () => {
    const losing = [makeResult({ station: { id: 1 }, netSavings: -1 })];
    render(<ResultsScreen state={makeState({ response: makeResponse({ results: losing }), results: losing })} />);
    expect(screen.queryByTestId("no-savings-notice")).not.toBeInTheDocument();
  });

  it("senza stazioni nel raggio suggerisce di allargare il raggio, non la deviazione", () => {
    render(<ResultsScreen state={nearbyState([])} />);
    expect(screen.getByText("Nessuna stazione nel raggio di ricerca")).toBeInTheDocument();
    expect(screen.getByText(/aumentare il raggio di ricerca/)).toBeInTheDocument();
    expect(screen.queryByText(/deviazione massima/)).not.toBeInTheDocument();
  });

  it("durante la verifica parla di distanze reali, non di deviazioni", () => {
    const state = nearbyState(undefined, { refinement: { status: "pending" } });
    render(<ResultsScreen state={state} />);
    expect(screen.getByText("Calcolo le distanze reali delle migliori stazioni…")).toBeInTheDocument();
  });

  it("senza routing le distanze restano stime e lo dice con le stesse parole", () => {
    const state = nearbyState(undefined, { refinement: { status: "skipped", reason: "budget_hard_limit" } });
    render(<ResultsScreen state={state} />);
    expect(screen.getByText("Distanze stimate (il calcolo sul percorso reale è sospeso).")).toBeInTheDocument();
  });
});

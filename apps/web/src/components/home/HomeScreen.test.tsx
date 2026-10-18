import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsProvider } from "../../hooks/useSettings";
import { ApiError } from "../../lib/api";
import { recordRecentRoute, resetRecentRoutesMemory } from "../../lib/recentRoutes";
import { resetSettingsMemory } from "../../lib/settings";
import { installMatchMedia, resetViewport, setViewportWidth } from "../../test/matchMedia";
import { HomeScreen } from "./HomeScreen";

const suggestions = [{ id: "a", name: "Via Esempio 12", label: "Via Esempio 12, 00000 Città di Prova", lon: 9.15, lat: 45.55 }];

beforeEach(() => {
  localStorage.clear();
  resetSettingsMemory();
  resetRecentRoutesMemory();
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ suggestions }) })));
});
afterEach(() => {
  resetViewport();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  Reflect.deleteProperty(navigator, "geolocation");
});

/** fetch finto per il geocoding: risponde per testo (q); un testo sconosciuto → nessun suggerimento. `calls()` elenca le richieste fatte. */
function stubGeocoding(byText: Record<string, { lon: number; lat: number }>) {
  const made: Array<{ q: string }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), "http://localhost");
      const q = url.searchParams.get("q") ?? "";
      made.push({ q });
      const hit = byText[q];
      return { ok: true, json: async () => ({ suggestions: hit ? [{ id: "id", name: q.split(",")[0], label: q, ...hit }] : [] }) };
    }),
  );
  return () => made;
}

function renderHome(props: { busy?: boolean; error?: ApiError | null } = {}) {
  const onSubmit = vi.fn();
  render(
    <SettingsProvider>
      <HomeScreen onSubmit={onSubmit} busy={props.busy ?? false} error={props.error ?? null} />
    </SettingsProvider>,
  );
  return onSubmit;
}

const bar = () => screen.getByTestId("search-bar");
const dialog = () => screen.getByRole("dialog", { name: /Pianifica Viaggio & Risparmio/ });

const DAY = 86_400_000;
const route = (from: string, to: string, extra: { fuelType?: "benzina" | "diesel"; times?: number; fromCurrent?: boolean; lastAt?: number } = {}) => {
  for (let i = 0; i < (extra.times ?? 1); i++) {
    recordRecentRoute(
      { origin: { text: from, ...(extra.fromCurrent ? { current: true as const } : {}) }, destination: { text: to }, fuelType: extra.fuelType ?? "benzina" },
      extra.lastAt ?? Date.now() - i,
    );
  }
};

describe("Home — barra di ricerca e foglio", () => {
  it("mostra la barra «Dove vuoi andare?» con l'alone, il claim come h1 e il foglio chiuso", () => {
    renderHome();
    expect(bar()).toHaveTextContent("Dove vuoi andare?");
    // L'alone sfumato dietro la barra: riquadro simmetrico (-inset-4 / sm:-inset-6), gradiente radiale centrato, nessuna
    // rotazione né maschera (il lineare con -rotate-1 sembrava spostato a sinistra).
    const glow = screen.getByTestId("search-glow");
    expect(glow).toHaveClass("absolute", "-inset-4", "sm:-inset-6", "bg-glow-radial", "rounded-full", "blur-2xl", "scale-105", "pointer-events-none", "z-0");
    expect(glow.className).not.toMatch(/rotate|bg-gradient|glow-fade|mask|inset-x|inset-y|translate|left-|right-/); // niente che lo sposti
    expect(glow.parentElement).toHaveClass("relative", "w-full"); // il wrapper del riquadro
    expect(bar()).toHaveClass("relative", "z-10", "w-full", "h-14"); // il pulsante resta sopra e largo quanto il wrapper
    expect(glow.getAttribute("aria-hidden")).toBe("true");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Trova il carburante al minor costo sul tuo tragitto");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument(); // il form non è nell'albero accessibile da chiuso
  });

  it("toccare la barra apre il foglio «Pianifica Viaggio & Risparmio» (rounded-t-3xl) con il form e il cursore nella partenza", async () => {
    const user = userEvent.setup();
    renderHome();
    await user.click(bar());
    expect(dialog()).toHaveClass("rounded-t-3xl");
    expect(dialog()).toHaveAttribute("aria-modal", "true");
    expect(within(dialog()).getByRole("button", { name: "Trova il carburante più conveniente" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Partenza" })).toHaveFocus();
  });

  it("si chiude con la «×», con Esc e toccando lo sfondo", async () => {
    const user = userEvent.setup();
    renderHome();
    await user.click(bar());
    await user.click(screen.getByRole("button", { name: "Chiudi" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await user.click(bar());
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await user.click(bar());
    await user.click(dialog().parentElement!); // lo sfondo
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await user.click(bar());
    await user.click(within(dialog()).getByText("Carburante")); // un tocco dentro il foglio non lo chiude
    expect(dialog()).toBeInTheDocument();
  });

  it("da chiuso il foglio resta montato (solo hidden): il form conserva i valori inseriti", async () => {
    const user = userEvent.setup();
    renderHome();
    await user.click(bar());
    await user.click(screen.getByRole("radio", { name: "Diesel" }));
    await user.click(screen.getByRole("button", { name: "Chiudi" }));
    expect(document.getElementById("search-sheet-title")!.closest("[hidden]")).not.toBeNull();
    await user.click(bar());
    expect(screen.getByRole("radio", { name: "Diesel" })).toBeChecked();
  });

  it("l'attributo hidden non è battuto da classi di display sul contenitore (jsdom non carica il CSS: si controlla la causa)", () => {
    renderHome();
    const wrapper = document.getElementById("search-sheet-title")!.closest("[hidden]") as HTMLElement;
    expect(wrapper.className).toBe("");
  });

  it("mentre cerca la barra è disattivata e dice «Cerco le stazioni…»; un errore compare sotto la barra", () => {
    const { unmount } = render(
      <SettingsProvider>
        <HomeScreen onSubmit={vi.fn()} busy error={null} />
      </SettingsProvider>,
    );
    expect(bar()).toBeDisabled();
    expect(bar()).toHaveTextContent("Cerco le stazioni…");
    unmount();
    renderHome({ error: new ApiError("NO_ROUTE", "Nessun percorso trovato tra i due punti.", 422) });
    expect(screen.getByRole("alert")).toHaveTextContent("Percorso non trovato");
  });
});

describe("Home — Tragitti frequenti", () => {
  it("senza storico c'è un riquadro discreto (nessuna scheda finta)", () => {
    renderHome();
    expect(screen.getByRole("heading", { level: 2, name: "Tragitti frequenti" })).toBeInTheDocument();
    expect(screen.getByTestId("frequent-routes-empty")).toHaveTextContent("Qui compariranno i tragitti");
    expect(screen.queryByText("Seleziona e cerca")).not.toBeInTheDocument();
  });

  it("mostra al più i 3 tragitti più cercati, con comuni, carburante e data dell'ultimo uso (niente km, uscite o risparmi: non sono salvati)", () => {
    const now = Date.now();
    route("Via A, 20100 Milano, Italia", "Via B, 40100 Bologna, Italia", { times: 3, lastAt: now });
    route("Via C, 00100 Roma, Italia", "Via D, 50100 Firenze, Italia", { fuelType: "diesel", times: 2, lastAt: now - DAY });
    route("Via E, 10100 Torino, Italia", "Via F, 16100 Genova, Italia", { lastAt: now - 40 * DAY });
    route("Via G, 80100 Napoli, Italia", "Via H, 70100 Bari, Italia", { lastAt: now - 41 * DAY });
    renderHome();
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent("Milano → Bologna");
    expect(items[0]).toHaveTextContent("Benzina · ultimo uso oggi");
    expect(items[1]).toHaveTextContent("Roma → Firenze");
    expect(items[1]).toHaveTextContent("Diesel · ultimo uso ieri");
    expect(items[2]).toHaveTextContent(/Benzina · ultimo uso \d{1,2} \p{L}+/u);
    for (const item of items) expect(item.textContent).not.toMatch(/\bkm\b|risparm|ricerch|uscita|€/i);
    expect(screen.getByText("Seleziona e cerca")).toBeInTheDocument();
  });

  it("se i due comuni coincidono il titolo usa le vie", () => {
    route("Via Roma 1, 00000 Città di Prova, Italia", "Via Verdi 2, 00000 Città di Prova, Italia");
    renderHome();
    expect(screen.getByRole("button", { name: /Via Roma 1 → Via Verdi 2/ })).toBeInTheDocument();
  });

  it("toccare un tragitto apre il foglio con i testi salvati e fa DUE nuove richieste di geocoding: «Trova» usa le coordinate appena ottenute", async () => {
    route("Via A, 20100 Milano, Italia", "Via B, 40100 Bologna, Italia", { fuelType: "diesel" });
    const calls = stubGeocoding({ "Via A, 20100 Milano, Italia": { lon: 9.19, lat: 45.48 }, "Via B, 40100 Bologna, Italia": { lon: 11.34, lat: 44.49 } });
    const user = userEvent.setup();
    const onSubmit = renderHome();
    await user.click(screen.getByRole("button", { name: /Milano → Bologna/ }));
    expect(dialog()).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Partenza" })).toHaveValue("Via A, 20100 Milano, Italia");
    expect(screen.getByRole("combobox", { name: "Destinazione" })).toHaveValue("Via B, 40100 Bologna, Italia");
    expect(screen.getByRole("radio", { name: "Diesel" })).toBeChecked();

    // «Trova» si abilita solo quando i due luoghi sono stati ritrovati di fresco
    const find = screen.getByRole("button", { name: "Trova il carburante più conveniente" });
    await waitFor(() => expect(find).toBeEnabled());
    // esattamente due richieste di geocoding, una per estremo: nemmeno dopo il debounce dei suggerimenti (350 ms) ne compaiono altre
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(calls()).toHaveLength(2);
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument(); // e nessun elenco di suggerimenti sul testo salvato
    expect(calls().map((q) => q.q).sort()).toEqual(["Via A, 20100 Milano, Italia", "Via B, 40100 Bologna, Italia"]);

    await user.click(find);
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0]![0]).toMatchObject({ origin: { lon: 9.19, lat: 45.48 }, destination: { lon: 11.34, lat: 44.49 }, fuelType: "diesel" });
    expect(onSubmit.mock.calls[0]![1]).toEqual({ origin: "Via A, 20100 Milano, Italia", destination: "Via B, 40100 Bologna, Italia" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(); // il foglio si chiude alla ricerca
  });

  it("a ogni tocco le richieste si rifanno (nessuna risoluzione memorizzata): due tocchi = quattro richieste", async () => {
    route("Via A, 20100 Milano, Italia", "Via B, 40100 Bologna, Italia");
    const calls = stubGeocoding({ "Via A, 20100 Milano, Italia": { lon: 9.19, lat: 45.48 }, "Via B, 40100 Bologna, Italia": { lon: 11.34, lat: 44.49 } });
    const user = userEvent.setup();
    renderHome();
    await user.click(screen.getByRole("button", { name: /Milano → Bologna/ }));
    await waitFor(() => expect(calls()).toHaveLength(2));
    await user.click(screen.getByRole("button", { name: "Chiudi" }));
    await user.click(screen.getByRole("button", { name: /Milano → Bologna/ }));
    await waitFor(() => expect(calls()).toHaveLength(4));
  });

  it("OFFLINE: messaggio chiaro, nessuna richiesta, nessun riuso di coordinate: «Trova» resta disattivato e i campi tengono il testo", async () => {
    route("Via A, 20100 Milano, Italia", "Via B, 40100 Bologna, Italia");
    const calls = stubGeocoding({});
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    const user = userEvent.setup();
    const onSubmit = renderHome();
    await user.click(screen.getByRole("button", { name: /Milano → Bologna/ }));
    expect(await screen.findByTestId("resolve-error")).toHaveTextContent("Sei offline: per ritrovare i luoghi di questo tragitto serve la connessione");
    expect(calls()).toHaveLength(0);
    expect(screen.getByRole("combobox", { name: "Partenza" })).toHaveValue("Via A, 20100 Milano, Italia");
    expect(screen.getByRole("button", { name: "Trova il carburante più conveniente" })).toBeDisabled();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("geocoding che fallisce (servizio non raggiungibile): messaggio chiaro, nessuna coordinata di ripiego", async () => {
    route("Via A, 20100 Milano, Italia", "Via B, 40100 Bologna, Italia");
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
    const user = userEvent.setup();
    const onSubmit = renderHome();
    await user.click(screen.getByRole("button", { name: /Milano → Bologna/ }));
    expect(await screen.findByTestId("resolve-error")).toHaveTextContent("il servizio non risponde");
    expect(screen.getByRole("button", { name: "Trova il carburante più conveniente" })).toBeDisabled();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("un testo senza risultati dice quale testo non ha trovato; l'altro estremo, ritrovato, resta valido", async () => {
    route("Via A, 20100 Milano, Italia", "Via B, 40100 Bologna, Italia");
    const calls = stubGeocoding({ "Via A, 20100 Milano, Italia": { lon: 9.19, lat: 45.48 } }); // «Via B» → nessun suggerimento
    const user = userEvent.setup();
    renderHome();
    await user.click(screen.getByRole("button", { name: /Milano → Bologna/ }));
    expect(await screen.findByTestId("resolve-error")).toHaveTextContent("Non ho trovato «Via B, 40100 Bologna, Italia»");
    expect(screen.getByRole("button", { name: "Trova il carburante più conveniente" })).toBeDisabled();
    // Il testo che non si è ritrovato si corregge a mano: appena l'utente scrive tornano i suggerimenti
    const before = calls().length;
    await user.type(screen.getByRole("combobox", { name: "Destinazione" }), "x");
    await waitFor(() => expect(calls().length).toBeGreaterThan(before));
  });

  it("«posizione attuale»: si legge il GPS del dispositivo (non Mapbox), una sola richiesta di geocoding per l'altro estremo, e la ricerca porta il flag", async () => {
    route("Posizione attuale", "Via B, 40100 Bologna, Italia", { fromCurrent: true });
    const calls = stubGeocoding({ "Via B, 40100 Bologna, Italia": { lon: 11.34, lat: 44.49 } });
    const getCurrentPosition = vi.fn((success: PositionCallback) => success({ coords: { longitude: 9.5, latitude: 45.6 } } as GeolocationPosition));
    Object.defineProperty(navigator, "geolocation", { value: { getCurrentPosition }, configurable: true });
    const user = userEvent.setup();
    const onSubmit = renderHome();
    expect(screen.getByRole("button", { name: /Posizione attuale → Bologna/ })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Posizione attuale → Bologna/ }));
    const find = screen.getByRole("button", { name: "Trova il carburante più conveniente" });
    await waitFor(() => expect(find).toBeEnabled());
    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
    expect(calls()).toHaveLength(1);
    expect(calls()[0]!.q).toBe("Via B, 40100 Bologna, Italia");
    await user.click(find);
    expect(onSubmit.mock.calls[0]![0]).toMatchObject({ origin: { lon: 9.5, lat: 45.6 }, destination: { lon: 11.34, lat: 44.49 } });
    expect(onSubmit.mock.calls[0]![1]).toEqual({ origin: "Posizione attuale", destination: "Via B, 40100 Bologna, Italia", originCurrent: true });
  });

  it("«posizione attuale» con permesso negato: messaggio chiaro e nessuna posizione inventata", async () => {
    route("Posizione attuale", "Via B, 40100 Bologna, Italia", { fromCurrent: true });
    stubGeocoding({ "Via B, 40100 Bologna, Italia": { lon: 11.34, lat: 44.49 } });
    const getCurrentPosition = vi.fn((_ok: PositionCallback, fail: PositionErrorCallback) => fail({ code: 1, PERMISSION_DENIED: 1 } as GeolocationPositionError));
    Object.defineProperty(navigator, "geolocation", { value: { getCurrentPosition }, configurable: true });
    const user = userEvent.setup();
    renderHome();
    await user.click(screen.getByRole("button", { name: /Posizione attuale → Bologna/ }));
    expect(await screen.findByTestId("resolve-error")).toHaveTextContent("posizione del dispositivo");
    expect(screen.getByRole("button", { name: "Trova il carburante più conveniente" })).toBeDisabled();
  });
});

describe("Home — layout desktop (≥1024 px)", () => {
  it("sotto i 1024 px resta il layout mobile: nessuna griglia a due colonne e il claim è l'h1", () => {
    setViewportWidth(768);
    renderHome();
    expect(screen.queryByTestId("home-desktop")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Trova il carburante al minor costo sul tuo tragitto");
  });

  it("da 1024 px: due colonne — a sinistra pillola con il claim, titolo display (h1), paragrafo e barra con alone; a destra «Tragitti frequenti»", () => {
    setViewportWidth(1280);
    renderHome();
    const grid = screen.getByTestId("home-desktop");
    expect(grid).toHaveClass("grid", "grid-cols-12");
    const [left, right] = [...grid.children] as HTMLElement[];
    expect(left).toHaveClass("col-span-7");
    expect(right).toHaveClass("col-span-5");
    expect(within(left!).getByText("Trova il carburante al minor costo sul tuo tragitto")).toBeInTheDocument(); // la pillola (non è un titolo)
    const h1 = within(left!).getByRole("heading", { level: 1 });
    expect(h1).toHaveTextContent("Naviga intelligente.Risparmia ad ogni pieno.");
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(within(left!).getByText(/confrontando i prezzi MIMIT/)).toBeInTheDocument();
    expect(left!.contains(screen.getByTestId("search-bar"))).toBe(true); // la barra con alone sta sotto l'hero, a sinistra
    expect(left!.contains(screen.getByTestId("search-glow"))).toBe(true);
    expect(within(right!).getByRole("heading", { level: 2, name: "Tragitti frequenti" })).toBeInTheDocument();
  });

  it("la colonna di destra mostra il conteggio dei salvati (anche oltre le 3 schede mostrate)", () => {
    setViewportWidth(1440);
    for (let i = 0; i < 5; i++) route(`Via ${i}, 2010${i} Milano, Italia`, `Via B${i}, 4010${i} Bologna, Italia`);
    renderHome();
    expect(screen.getByTestId("saved-count")).toHaveTextContent("5 salvati");
    expect(screen.getAllByTestId("frequent-route")).toHaveLength(3);
  });

  it("un solo tragitto: «1 salvato»; nessuno: riquadro discreto e «0 salvati»", () => {
    setViewportWidth(1280);
    renderHome();
    expect(screen.getByTestId("saved-count")).toHaveTextContent("0 salvati");
    expect(screen.getByTestId("frequent-routes-empty")).toBeInTheDocument();
    cleanup();
    route("Via A, 20100 Milano, Italia", "Via B, 40100 Bologna, Italia");
    renderHome();
    expect(screen.getByTestId("saved-count")).toHaveTextContent("1 salvato");
  });

  it("le schede hanno SOLO etichetta, carburante e data dell'ultimo uso (con l'icona a sinistra): niente km, uscita consigliata o risparmio", () => {
    setViewportWidth(1280);
    route("Via A, 20100 Milano, Italia", "Via B, 40100 Bologna, Italia", { fuelType: "diesel", lastAt: Date.now() - DAY });
    renderHome();
    const card = screen.getByTestId("frequent-route");
    expect(card.querySelector("span.rounded-full svg")).not.toBeNull(); // icona di navigazione
    expect(within(card).getByText("Milano → Bologna")).toBeInTheDocument();
    expect(within(card).getByTestId("frequent-route-meta")).toHaveTextContent(/^Diesel · ultimo uso ieri$/);
    expect(card.textContent).not.toMatch(/\bkm\b|risparm|uscita|€|ricerch/i);
  });

  it("tap su una scheda: precompila il foglio come oggi (testi, carburante, due richieste di geocoding)", async () => {
    setViewportWidth(1280);
    route("Via A, 20100 Milano, Italia", "Via B, 40100 Bologna, Italia", { fuelType: "diesel" });
    const calls = stubGeocoding({ "Via A, 20100 Milano, Italia": { lon: 9.19, lat: 45.48 }, "Via B, 40100 Bologna, Italia": { lon: 11.34, lat: 44.49 } });
    const user = userEvent.setup();
    renderHome();
    await user.click(screen.getByTestId("frequent-route"));
    expect(dialog()).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Partenza" })).toHaveValue("Via A, 20100 Milano, Italia");
    expect(screen.getByRole("radio", { name: "Diesel" })).toBeChecked();
    await waitFor(() => expect(screen.getByRole("button", { name: "Trova il carburante più conveniente" })).toBeEnabled());
    expect(calls()).toHaveLength(2);
  });

  it("cambiando larghezza con il foglio già compilato il form non perde i valori (il foglio non si rimonta)", async () => {
    setViewportWidth(1280);
    const user = userEvent.setup();
    renderHome();
    await user.click(bar());
    await user.click(screen.getByRole("radio", { name: "Diesel" }));
    setViewportWidth(768); // es. un tablet che ruota
    await waitFor(() => expect(screen.queryByTestId("home-desktop")).not.toBeInTheDocument());
    expect(screen.getByRole("radio", { name: "Diesel" })).toBeChecked();
  });

  it("l'alone e la barra restano come in mobile (glow radiale centrato, barra h-14) e la barra è limitata a max-w-xl", () => {
    setViewportWidth(1280);
    renderHome();
    expect(screen.getByTestId("search-glow")).toHaveClass("bg-glow-radial", "-inset-4");
    expect(screen.getByTestId("search-bar")).toHaveClass("h-14", "w-full");
    expect(screen.getByTestId("search-bar").parentElement).toHaveClass("max-w-xl");
  });
});

describe("Home — schermi larghi (2xl, Full HD) e hover delle schede", () => {
  const manyRoutes = (n: number) => {
    for (let i = 0; i < n; i++) route(`Via ${i}, 2010${i} Milano, Italia`, `Via B${i}, 4010${i} Bologna, Italia`, { lastAt: Date.now() - i * DAY });
  };

  it("a 2xl il titolo sale di un gradino tipografico (token headline-2xl) e il paragrafo è limitato da max-w-prose; sotto resta headline-xl", () => {
    setViewportWidth(1920);
    renderHome();
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(h1).toHaveClass("text-headline-xl", "2xl:text-headline-2xl");
    const paragraph = screen.getByText(/confrontando i prezzi MIMIT/);
    expect(paragraph).toHaveClass("max-w-prose");
    expect(paragraph).not.toHaveClass("max-w-lg");
    // le due colonne si bilanciano a 2xl (6/6) e restano 7/5 sotto
    const [left, right] = [...screen.getByTestId("home-desktop").children] as HTMLElement[];
    expect(left).toHaveClass("col-span-7", "2xl:col-span-6");
    expect(right).toHaveClass("col-span-5", "2xl:col-span-6");
  });

  it("a 2xl con almeno 4 tragitti: fino a sei schede su due colonne", () => {
    setViewportWidth(1920);
    manyRoutes(5);
    renderHome();
    expect(screen.getAllByTestId("frequent-route")).toHaveLength(5);
    expect(screen.getByTestId("frequent-routes-list")).toHaveClass("grid", "grid-cols-2");
    cleanup();
    resetRecentRoutesMemory();
    localStorage.clear();
    manyRoutes(8);
    renderHome();
    expect(screen.getAllByTestId("frequent-route")).toHaveLength(6); // al massimo sei
    expect(screen.getByTestId("saved-count")).toHaveTextContent("8 salvati");
  });

  it("a 2xl con meno di 4 tragitti resta l'elenco in una colonna", () => {
    setViewportWidth(2560);
    manyRoutes(3);
    renderHome();
    const list = screen.getByTestId("frequent-routes-list");
    expect(screen.getAllByTestId("frequent-route")).toHaveLength(3);
    expect(list).toHaveClass("flex", "flex-col");
    expect(list).not.toHaveClass("grid-cols-2");
  });

  it("sotto 2xl (qui 1440 px) restano tre schede in elenco anche con cinque salvati: invariato", () => {
    setViewportWidth(1440);
    manyRoutes(5);
    renderHome();
    expect(screen.getAllByTestId("frequent-route")).toHaveLength(3);
    expect(screen.getByTestId("frequent-routes-list")).toHaveClass("flex", "flex-col");
    expect(screen.getByTestId("saved-count")).toHaveTextContent("5 salvati");
  });

  it("hover sulla scheda: l'icona a sinistra passa al VERDE (primary-strong con testo bianco), mai al blu secondary", () => {
    setViewportWidth(1280);
    manyRoutes(1);
    renderHome();
    const icon = screen.getByTestId("frequent-route").querySelector("span[aria-hidden='true'].rounded-full")!;
    expect(icon).toHaveClass("group-hover:bg-primary-strong", "group-hover:text-on-primary");
    expect(icon.className).not.toMatch(/group-hover:[a-z-]*secondary/);
    expect(screen.getByTestId("frequent-route")).toHaveClass("hover:border-primary/40"); // il bordo della scheda era già verde
    expect(screen.getByTestId("frequent-route").className).not.toMatch(/hover:[a-z-]*secondary/);
  });
});

describe("Home — apertura e chiusura del foglio non spostano lo sfondo", () => {
  const stubScroll = (y: number) => {
    Object.defineProperty(window, "scrollY", { value: y, configurable: true });
    const scrollTo = vi.fn();
    vi.stubGlobal("scrollTo", scrollTo);
    return scrollTo;
  };

  it.each([1280, 1920, 390])("a %i px: scrollY invariato prima, durante e dopo; nessun scrollTo; il blocco dello scorrimento si toglie", async (width) => {
    setViewportWidth(width);
    const scrollTo = stubScroll(240);
    const user = userEvent.setup();
    renderHome();
    const before = window.scrollY;
    await user.click(bar());
    expect(dialog()).toBeInTheDocument();
    expect(window.scrollY).toBe(before);
    expect(document.body.style.overflow).toBe("hidden");
    await user.keyboard("{Escape}");
    expect(window.scrollY).toBe(before);
    expect(document.body.style.overflow).toBe("");
    expect(scrollTo).not.toHaveBeenCalled();
    Object.defineProperty(window, "scrollY", { value: 0, configurable: true });
  });

  it("il contenitore del foglio, da aperto, non genera un riquadro (display: contents): non diventa un elemento del flex di main e non aggiunge il gap (24 px) all'altezza", async () => {
    setViewportWidth(1280);
    const user = userEvent.setup();
    renderHome();
    const wrapper = () => screen.getByRole("dialog", { name: /Pianifica Viaggio & Risparmio/, hidden: true }).parentElement!.parentElement!;
    expect(screen.getByTestId("home-desktop").parentElement).toBe(wrapper().parentElement); // fratello della griglia, quindi figlio del flex di main
    await user.click(bar());
    expect(wrapper()).toHaveClass("contents");
    expect(wrapper()).not.toHaveAttribute("hidden");
    await user.keyboard("{Escape}");
    expect(wrapper()).not.toHaveClass("contents"); // da chiuso torna `hidden` (display: none)
    expect(wrapper()).toHaveAttribute("hidden");
  });
});

describe("formatLastUsed", () => {
  const noon = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12).getTime();
  it("oggi, ieri, data breve e, in un altro anno, con l'anno; senza data valida null", async () => {
    const { formatLastUsed } = await import("../../lib/format");
    const now = noon(2026, 10, 5);
    expect(formatLastUsed(noon(2026, 10, 5) - 3_600_000, now)).toBe("oggi");
    expect(formatLastUsed(noon(2026, 10, 4), now)).toBe("ieri");
    expect(formatLastUsed(noon(2026, 9, 28), now)).toMatch(/^28 set/);
    expect(formatLastUsed(noon(2025, 12, 31), now)).toMatch(/31 dic 2025/);
    expect(formatLastUsed(0, now)).toBeNull();
    expect(formatLastUsed(Number.NaN, now)).toBeNull();
  });
});

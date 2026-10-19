import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { brandLogoUrl } from "../../lib/brandLogos";
import { navigationLink } from "../../lib/navigation";
import { makeDetail } from "../../test/fixtures";
import { StationDetailScreen } from "./StationDetailScreen";

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1";
const ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36";
const DESKTOP = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36";

const originalUA = navigator.userAgent;
const setUA = (ua: string) => Object.defineProperty(window.navigator, "userAgent", { value: ua, configurable: true });

let fetchSpy: ReturnType<typeof vi.fn>;
const respondWith = (detail = makeDetail()) => fetchSpy.mockResolvedValue({ ok: true, json: async () => detail });

function renderScreen(path = "/station/s1/2") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/station/:searchId/:stationId" element={<StationDetailScreen />} />
        <Route path="/results" element={<div>PAGINA RISULTATI</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

const loaded = async () => screen.findByRole("heading", { name: "1858 BREGNANO" });

beforeEach(() => {
  fetchSpy = vi.fn();
  vi.stubGlobal("fetch", fetchSpy);
  localStorage.clear();
  setUA(DESKTOP);
  window.scrollTo = vi.fn();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  setUA(originalUA);
  Reflect.deleteProperty(navigator, "share");
  Reflect.deleteProperty(navigator, "clipboard");
});

describe("StationDetailScreen — contenuto", () => {
  it("chiede il dettaglio per la ricerca e la stazione dell'URL e mostra meta, impatto e listino", async () => {
    respondWith();
    renderScreen();
    await loaded();

    expect(String(fetchSpy.mock.calls[0]![0])).toContain("/search/s1/stations/2");
    expect(screen.getByTestId("station-address")).toHaveTextContent("S.P. 31 DELLA PIODA - VIA MILANO 79, BREGNANO (CO)");
    // Agip Eni ha il logo della bandiera (file locale, decorativo); senza logo ci sarebbero le iniziali «AE»
    expect(screen.getByTestId("brand-avatar").querySelector("img")!.getAttribute("src")).toBe(brandLogoUrl("Agip Eni"));
    expect(screen.getByText("Stradale")).toBeInTheDocument();
    expect(screen.getByText("Gestore ENIMOOV S.P.A.")).toBeInTheDocument();
    // nessun badge sulla deviazione nella meta: la provenienza sta nel tile «Deviazione»
    expect(within(screen.getByRole("region", { name: "Stazione" })).queryByText(/Calcolato|Stima approssimata/)).not.toBeInTheDocument();
  });

  it("bento «Impatto sul tuo viaggio»: deviazione, risparmio netto sui litri e differenziale vs media", async () => {
    respondWith();
    renderScreen();
    await loaded();

    const detour = screen.getByTestId("tile-detour");
    expect(detour).toHaveTextContent("+1,6 km");
    expect(detour).toHaveTextContent("+3 min guida");
    expect(detour).not.toHaveTextContent("~");
    expect(detour).not.toHaveTextContent("stima");

    const savings = screen.getByTestId("tile-savings");
    expect(savings).toHaveTextContent("Risparmio");
    expect(savings).toHaveTextContent("€ 5,96");
    expect(savings).toHaveTextContent("su 45 L");

    const differential = screen.getByTestId("tile-differential");
    expect(differential).toHaveTextContent("−0,149");
    expect(differential).toHaveTextContent("€/L");
    expect(differential).toHaveTextContent("−7,0% medio");

    expect(screen.getByRole("region", { name: "Impatto sul tuo viaggio" })).toHaveTextContent("Riferimento €2,139/L (prezzo tipico di 63 stazioni sul percorso)");
  });

  it("le cifre sono tabulari (tabular-nums) su deviazione, risparmio, differenziale e prezzi", async () => {
    respondWith();
    renderScreen();
    await loaded();
    for (const id of ["tile-detour", "tile-savings", "tile-differential"]) {
      expect(screen.getByTestId(id).querySelectorAll("span.tabular-nums").length).toBeGreaterThan(0);
    }
    for (const tile of screen.getAllByTestId("price-tile")) {
      expect(within(tile).getByText(/^\d,\d{3}$/)).toHaveClass("tabular-nums");
    }
  });

  it("un risparmio non positivo non si nasconde: «Non conviene» con segno meno", async () => {
    respondWith(makeDetail({ impact: { ...makeDetail().impact, netSavings: -2, grossSavings: 0.4, detourCost: 2.4 } }));
    renderScreen();
    await loaded();
    const savings = screen.getByTestId("tile-savings");
    expect(savings).toHaveTextContent("Non conviene");
    expect(savings).toHaveTextContent("−€ 2,00");
  });

  it("matrice prezzi: una tile per ogni combinazione carburante × modalità, con la scelta della ricerca evidenziata", async () => {
    respondWith();
    renderScreen();
    await loaded();

    const tiles = screen.getAllByTestId("price-tile");
    expect(tiles.map((t) => `${t.getAttribute("data-fuel")}:${t.getAttribute("data-mode")}`)).toEqual([
      "benzina:self",
      "benzina:servito",
      "diesel:self",
      "diesel:servito",
    ]);
    expect(within(tiles[0]!).getByText("1,990")).toBeInTheDocument();
    expect(within(tiles[0]!).getByText("Self")).toBeInTheDocument();
    expect(within(tiles[1]!).getByText("Servito")).toBeInTheDocument();
    expect(within(tiles[0]!).getByText("€/L")).toBeInTheDocument();

    const chosen = tiles.filter((t) => t.getAttribute("aria-current") === "true");
    expect(chosen).toHaveLength(1);
    expect(chosen[0]).toBe(tiles[0]);
    expect(chosen[0]).toHaveTextContent("Scelto nella ricerca");
    expect(chosen[0]).toHaveClass("ring-2");
  });

  it("evidenzia il Servito se è la combinazione scelta (stazione solo servito)", async () => {
    respondWith(makeDetail({ selected: { ...makeDetail().selected, isSelf: false, servitoOnly: true, price: 2.2 } }));
    renderScreen();
    await loaded();
    const chosen = screen.getAllByTestId("price-tile").find((t) => t.getAttribute("aria-current") === "true")!;
    expect(chosen).toHaveAttribute("data-fuel", "benzina");
    expect(chosen).toHaveAttribute("data-mode", "servito");
  });

  it("senza prezzi recenti lo dichiara invece di mostrare tile vuote", async () => {
    respondWith(makeDetail({ prices: [] }));
    renderScreen();
    await loaded();
    expect(screen.queryAllByTestId("price-tile")).toHaveLength(0);
    expect(screen.getByText("Nessun prezzo recente disponibile per questa stazione.")).toBeInTheDocument();
  });

  it("pill del tipo di impianto: «Autostrada» per le stazioni autostradali", async () => {
    respondWith(makeDetail({ station: { ...makeDetail().station, tipoImpianto: "autostradale" } }));
    renderScreen();
    await loaded();
    expect(screen.getByText("Autostrada")).toBeInTheDocument();
    expect(screen.queryByText("Stradale")).not.toBeInTheDocument();
  });

  it("riga sotto l'indirizzo: pill del tipo a sinistra (non si restringe), «Gestore …» a destra e troncato", async () => {
    respondWith(makeDetail({ station: { ...makeDetail().station, gestore: "UN GESTORE CON UNA RAGIONE SOCIALE MOLTO MOLTO LUNGA S.R.L." } }));
    renderScreen();
    await loaded();

    const pill = screen.getByText("Stradale");
    const gestore = screen.getByText(/^Gestore UN GESTORE/);
    expect(pill.parentElement).toBe(gestore.parentElement); // stessa riga
    expect(pill.parentElement).toHaveClass("justify-between");
    expect(pill.nextElementSibling).toBe(gestore); // pill prima (sinistra), gestore dopo (destra)
    expect(pill).toHaveClass("shrink-0");
    expect(gestore).toHaveClass("truncate", "text-right", "min-w-0");
    expect(gestore).toHaveAttribute("title", "Gestore UN GESTORE CON UNA RAGIONE SOCIALE MOLTO MOLTO LUNGA S.R.L.");
  });

  it("senza gestore la riga mostra solo la pill", async () => {
    respondWith(makeDetail({ station: { ...makeDetail().station, gestore: "  " } }));
    renderScreen();
    await loaded();
    expect(screen.queryByText(/^Gestore/)).not.toBeInTheDocument();
    expect(screen.getByText("Stradale")).toBeInTheDocument();
  });
});

describe("StationDetailScreen — attribuzioni: prezzi (MISE) e percorso (Mapbox)", () => {
  it("il badge «Verificato MISE» sta nell'header del listino e attribuisce i prezzi", async () => {
    respondWith();
    renderScreen();
    await loaded();

    const listino = screen.getByRole("region", { name: "Listino carburanti" });
    const badge = within(listino).getByText("Verificato MISE");
    expect(badge).toHaveClass("rounded-full", "bg-primary/10", "text-on-primary-fixed-variant");
    expect(badge).toHaveAttribute("title", expect.stringContaining("Osservaprezzi"));
    expect(within(listino).queryByText("Prezzi MIMIT Osservaprezzi")).not.toBeInTheDocument();
    expect(screen.getAllByText("Verificato MISE")).toHaveLength(1); // solo lì
  });

  it("il badge dei prezzi c'è anche quando la deviazione è una stima: non dice nulla sul percorso", async () => {
    respondWith(makeDetail({ detour: { km: 2, minutes: 3, source: "proxy" } }));
    renderScreen();
    await loaded();
    expect(within(screen.getByRole("region", { name: "Listino carburanti" })).getByText("Verificato MISE")).toBeInTheDocument();
  });

  it("deviazione calcolata sul percorso reale: il tile dice «Percorso calcolato» (con tooltip), nessuna tilde", async () => {
    respondWith();
    renderScreen();
    await loaded();

    const source = within(screen.getByTestId("tile-detour")).getByTestId("detour-source");
    expect(source).toHaveTextContent("Percorso calcolato");
    expect(source).toHaveAttribute("title", expect.stringContaining("servizio di percorsi di Mapbox"));
    expect(screen.getByTestId("tile-detour")).not.toHaveTextContent("~");
    expect(screen.queryByText("Stima approssimata")).not.toBeInTheDocument();
  });

  it("percorsi non disponibili (source proxy): il tile dice «Stima approssimata» (con tooltip) e i valori hanno la tilde", async () => {
    respondWith(makeDetail({ detour: { km: 2, minutes: 3, source: "proxy" } }));
    renderScreen();
    await loaded();

    const detour = screen.getByTestId("tile-detour");
    const source = within(detour).getByTestId("detour-source");
    expect(source).toHaveTextContent("Stima approssimata");
    expect(source).toHaveAttribute("title", expect.stringContaining("non è stato calcolato"));
    expect(detour).toHaveTextContent("~+2,0 km");
    expect(detour).toHaveTextContent("~+3 min guida");
    expect(screen.queryByText("Percorso calcolato")).not.toBeInTheDocument();
    expect(screen.getByTestId("tile-savings")).toHaveTextContent("~€ 5,96");
  });

  it("la provenienza della deviazione non sparisce mai: sempre una delle due etichette, mai nessuna e mai entrambe", async () => {
    for (const source of ["routing", "proxy"] as const) {
      respondWith(makeDetail({ detour: { km: 1.6, minutes: 2.9, source } }));
      const { unmount } = renderScreen();
      await loaded();
      const label = screen.getByTestId("detour-source").textContent;
      expect(label).toBe(source === "routing" ? "Percorso calcolato" : "Stima approssimata");
      expect(screen.getAllByTestId("detour-source")).toHaveLength(1);
      unmount();
    }
  });
});

describe("StationDetailScreen — nessun dato inventato", () => {
  it("non c'è alcuna sezione per uscita autostradale, orari, servizi, telefono o numero di pompe (nemmeno segnaposto)", async () => {
    respondWith();
    const { container } = renderScreen();
    await loaded();

    const text = container.textContent ?? "";
    expect(text).not.toMatch(/uscita|aperto|24\s*\/\s*7|24h|orari|servizi|amenit|telefono|chiama|pompe|bagni|wi-?fi|bar\b|ristor/i);
    expect(container.querySelector("a[href^='tel:']")).toBeNull();
    // Solo i campi MIMIT: nome, bandiera, gestore, indirizzo, tipo impianto, prezzi.
    expect(screen.getByRole("region", { name: "Stazione" })).toBeInTheDocument();
  });
});

describe("StationDetailScreen — caricamento ed errori", () => {
  it("durante il caricamento mostra lo stato e disattiva condividi e navigazione", () => {
    fetchSpy.mockReturnValue(new Promise(() => {}));
    renderScreen();
    expect(screen.getByRole("status")).toHaveTextContent("Verifico la deviazione sul percorso reale");
    expect(screen.getByRole("button", { name: "Condividi la stazione" })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Apri nel Navigatore/ })).toBeDisabled();
  });

  it("errore di rete: messaggio, «Riprova» rifà la richiesta", async () => {
    const user = userEvent.setup();
    fetchSpy.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    renderScreen();
    expect(await screen.findByRole("alert")).toHaveTextContent("Non riesco a caricare la stazione");

    respondWith();
    await user.click(screen.getByRole("button", { name: "Riprova" }));
    await loaded();
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("ricerca scaduta (404): spiega che serve rifare la ricerca, senza «Riprova»", async () => {
    fetchSpy.mockResolvedValue({ ok: false, status: 404, json: async () => ({ error: { code: "SEARCH_NOT_FOUND", message: "Ricerca non trovata o scaduta." } }) });
    renderScreen();
    expect(await screen.findByRole("alert")).toHaveTextContent("Questa ricerca non è più disponibile");
    expect(screen.queryByRole("button", { name: "Riprova" })).not.toBeInTheDocument();
    expect(within(screen.getByRole("alert")).getByRole("button", { name: "Torna ai risultati" })).toBeInTheDocument();
  });
});

describe("StationDetailScreen — navigazione e back", () => {
  it("il back button torna a /results", async () => {
    const user = userEvent.setup();
    respondWith();
    renderScreen();
    await loaded();
    await user.click(screen.getByRole("button", { name: "Torna ai risultati" }));
    expect(screen.getByText("PAGINA RISULTATI")).toBeInTheDocument();
  });
});

describe("StationDetailScreen — «Apri nel Navigatore» (menu con app consigliata)", () => {
  const cta = () => screen.getByRole("button", { name: /Apri nel Navigatore/ });

  async function openMenu(ua: string) {
    const user = userEvent.setup();
    setUA(ua);
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    respondWith();
    renderScreen();
    await loaded();
    await user.click(cta());
    return { user, open, dialog: screen.getByRole("dialog", { name: "Apri in navigatore" }) };
  }

  it("non c'è più il pulsante secondario «…»: resta la sola CTA", async () => {
    respondWith();
    renderScreen();
    await loaded();
    expect(screen.queryByRole("button", { name: "Scegli l'app di navigazione" })).not.toBeInTheDocument();
    const bar = cta().parentElement!;
    expect(within(bar).getAllByRole("button")).toHaveLength(1);
  });

  it("iPhone: la CTA apre il menu (nessun lancio diretto) con Apple Maps per prima, «Consigliato»", async () => {
    const { open, dialog } = await openMenu(IPHONE);
    expect(open).not.toHaveBeenCalled();

    const links = within(dialog).getAllByRole("link");
    expect(links.map((l) => l.textContent?.replace("Consigliato", "").trim())).toEqual(["Apple Maps", "Google Maps", "Waze"]);
    expect(within(links[0]!).getByText("Consigliato")).toBeInTheDocument();
    expect(within(dialog).getAllByText("Consigliato")).toHaveLength(1);
    expect(links[0]!.getAttribute("href")).toContain("https://maps.apple.com/");
    expect(links[0]!.getAttribute("href")).toContain("daddr=45.685986,9.054773");
  });

  it("Android: Google Maps per prima, «Consigliato», con le coordinate della stazione", async () => {
    const { open, dialog } = await openMenu(ANDROID);
    expect(open).not.toHaveBeenCalled();

    const links = within(dialog).getAllByRole("link");
    expect(links.map((l) => l.textContent?.replace("Consigliato", "").trim())).toEqual(["Google Maps", "Apple Maps", "Waze"]);
    expect(within(links[0]!).getByText("Consigliato")).toBeInTheDocument();
    expect(links[0]!.getAttribute("href")).toContain("https://www.google.com/maps/dir/?api=1&destination=45.685986,9.054773");
  });

  it("desktop o sistema sconosciuto: nessuna app consigliata, ordine Google Maps, Apple Maps, Waze", async () => {
    const { dialog } = await openMenu(DESKTOP);
    const links = within(dialog).getAllByRole("link");
    expect(links.map((l) => l.textContent)).toEqual(["Google Maps", "Apple Maps", "Waze"]);
    expect(within(dialog).queryByText("Consigliato")).not.toBeInTheDocument();
    expect(links[2]!.getAttribute("href")).toContain("waze.com/ul?ll=45.685986,9.054773");
  });

  it("il consigliato equivale al lancio diretto: stesso link https, nuova scheda, noopener", async () => {
    const { dialog } = await openMenu(IPHONE);
    const recommended = within(dialog).getAllByRole("link")[0]!;
    expect(recommended).toHaveAttribute("target", "_blank");
    expect(recommended).toHaveAttribute("rel", expect.stringContaining("noopener"));
    expect(recommended.getAttribute("href")).toBe(
      navigationLink("apple", { name: "1858 BREGNANO", lat: 45.685986, lon: 9.054773 }).url,
    );
  });

  it("il menu mostra prezzo scelto e risparmio, e si chiude con Esc", async () => {
    const { user, dialog } = await openMenu(DESKTOP);
    expect(dialog).toHaveTextContent("€1,990");
    expect(dialog).toHaveTextContent("Benzina Self");
    expect(dialog).toHaveTextContent("Risparmi € 5,96");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("StationDetailScreen — Copia indirizzo", () => {
  it("copia l'indirizzo completo negli appunti e lo conferma", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    respondWith();
    renderScreen();
    await loaded();
    await user.click(screen.getByRole("button", { name: "Copia" }));

    expect(writeText).toHaveBeenCalledWith("S.P. 31 DELLA PIODA - VIA MILANO 79, BREGNANO (CO)");
    expect(await screen.findByText("Indirizzo copiato")).toBeInTheDocument();
  });

  it("se la copia non è possibile lo dice, senza lanciare", async () => {
    const user = userEvent.setup();
    Object.defineProperty(navigator, "clipboard", { value: { writeText: vi.fn().mockRejectedValue(new Error("negato")) }, configurable: true });
    document.execCommand = vi.fn().mockReturnValue(false);
    respondWith();
    renderScreen();
    await loaded();
    await user.click(screen.getByRole("button", { name: "Copia" }));
    expect(await screen.findByText(/Copia non riuscita/)).toBeInTheDocument();
  });
});

describe("StationDetailScreen — nessun «Salva» per l'MVP", () => {
  it("l'header non ha il pulsante di salvataggio (nessuna schermata recupererebbe le stazioni salvate) e nulla viene scritto in localStorage", async () => {
    respondWith();
    renderScreen();
    await loaded();
    expect(screen.queryByRole("button", { name: /Salva|salvati/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { pressed: true })).not.toBeInTheDocument();
    expect(localStorage.getItem("tappafurba.savedStations.v1")).toBeNull();
    // restano indietro e condividi
    const header = screen.getByRole("banner");
    expect(within(header).getByRole("button", { name: "Torna ai risultati" })).toBeInTheDocument();
    expect(within(header).getByRole("button", { name: "Condividi la stazione" })).toBeInTheDocument();
  });
});

describe("StationDetailScreen — Condividi (Web Share API)", () => {
  it("usa la Web Share API con nome, prezzo, indirizzo e il link a Google Maps con le coordinate", async () => {
    const user = userEvent.setup();
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", { value: share, configurable: true });
    respondWith();
    renderScreen();
    await loaded();
    await user.click(screen.getByRole("button", { name: "Condividi la stazione" }));

    expect(share).toHaveBeenCalledTimes(1);
    const payload = share.mock.calls[0]![0];
    expect(payload.title).toBe("1858 BREGNANO");
    expect(payload.text).toContain("Benzina Self €1,990/L");
    expect(payload.text).toContain("S.P. 31 DELLA PIODA - VIA MILANO 79, BREGNANO (CO)");
    expect(payload.url).toContain("https://www.google.com/maps/dir/?api=1&destination=45.685986,9.054773");
  });

  it("senza Web Share API (desktop) copia testo e link negli appunti e lo dice", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    respondWith();
    renderScreen();
    await loaded();
    await user.click(screen.getByRole("button", { name: "Condividi la stazione" }));

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(writeText.mock.calls[0]![0]).toContain("1858 BREGNANO");
    expect(writeText.mock.calls[0]![0]).toContain("https://www.google.com/maps/dir/");
    expect(await screen.findByText("Link copiato negli appunti")).toBeInTheDocument();
  });

  it("se l'utente chiude il foglio di condivisione non compare alcun errore", async () => {
    const user = userEvent.setup();
    const share = vi.fn().mockRejectedValue(new DOMException("Share canceled", "AbortError"));
    Object.defineProperty(navigator, "share", { value: share, configurable: true });
    respondWith();
    renderScreen();
    await loaded();
    await user.click(screen.getByRole("button", { name: "Condividi la stazione" }));
    await waitFor(() => expect(share).toHaveBeenCalled());
    expect(screen.queryByText(/non riuscita/)).not.toBeInTheDocument();
    expect(screen.queryByText(/copiato/i)).not.toBeInTheDocument();
  });
});

describe("StationDetailScreen — robustezza", () => {
  it("un window.scrollTo che restituisce un valore (come in alcuni browser) non rompe gli effetti: nessun errore in console", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    window.scrollTo = vi.fn().mockReturnValue(Promise.resolve());
    respondWith();
    renderScreen();
    await loaded();
    expect(errors).not.toHaveBeenCalled();
  });
});

describe("StationDetailScreen — design system", () => {
  it("header e CTA tengono conto della safe-area; la CTA ha la sfocatura progressiva", async () => {
    respondWith();
    const { container } = renderScreen();
    await loaded();

    expect(screen.getByRole("banner")).toHaveClass("pt-safe");
    expect(screen.getByTestId("progressive-blur")).toHaveClass("progressive-blur");
    expect(screen.getByTestId("progressive-blur").querySelectorAll("span")).toHaveLength(3);
    expect(container.innerHTML).toContain("pb-[calc(1rem+env(safe-area-inset-bottom,0px))]");
    expect(container.innerHTML).toContain("backdrop-blur-xl"); // la header (glass)
  });

  it("«Apri nel Navigatore»: pill verde flottante a tutta larghezza dei contenuti, SENZA card (niente sfondo, bordo, ombra o padding di contenitore)", async () => {
    respondWith();
    renderScreen();
    await loaded();
    const cta = screen.getByRole("button", { name: /Apri nel Navigatore/ });
    expect(cta).toHaveClass("w-full", "h-12", "rounded-full", "bg-primary-strong", "text-on-primary");
    // il genitore è solo il contenitore di larghezza (stessa del main: max-w-md + px-margin) e la safe-area: nessun aspetto da card
    const container = screen.getByTestId("navigate-bar-container");
    expect(cta.parentElement).toBe(container);
    expect(container).toHaveClass("max-w-md", "mx-auto", "px-margin", "relative");
    expect(container.className).not.toMatch(/\bbg-|border|shadow|rounded|backdrop|\bp-|\bp[xy]?-space/);
    // nessun antenato fino alla barra fissa ha uno sfondo, un bordo, un'ombra o una sfocatura propri
    for (let el: HTMLElement | null = container.parentElement; el && el !== document.body; el = el.parentElement) {
      if (el.className.includes("fixed")) {
        expect(el.className).not.toMatch(/\bbg-|border|shadow|rounded|backdrop-blur/);
        break;
      }
    }
    // la sfocatura progressiva sta DIETRO la pill (primo figlio della barra), con tre strati mascherati da gradiente
    const blur = screen.getByTestId("progressive-blur");
    expect(blur).toHaveClass("progressive-blur", "absolute", "inset-x-0", "bottom-0");
    expect(blur.nextElementSibling).toBe(container);
    // la pill ha la propria ombra (non è lo sfondo di una card)
    expect(cta).toHaveClass("shadow-md");
  });

  it("header a pila: indietro a sinistra, brand al centro, solo condividi a destra (senza «Salva» e senza avatar)", async () => {
    respondWith();
    renderScreen();
    await loaded();
    const header = screen.getByRole("banner");
    expect(within(header).getByText("TappaFurba")).toBeInTheDocument();
    for (const name of ["Torna ai risultati", "Condividi la stazione"]) {
      expect(within(header).getByRole("button", { name })).toBeInTheDocument();
    }
    expect(within(header).queryByRole("img", { name: /profilo/i })).not.toBeInTheDocument();
    expect(within(header).queryByText("RF")).not.toBeInTheDocument();
    expect(within(header).getAllByRole("button")).toHaveLength(2); // indietro + condividi, nient'altro
  });

  it("raggi e ombre dei token: card `rounded-lg`, tile `rounded`, CTA e pill `rounded-full`", async () => {
    respondWith();
    renderScreen();
    await loaded();
    expect(screen.getByRole("region", { name: "Stazione" })).toHaveClass("rounded-lg");
    expect(screen.getByRole("region", { name: "Impatto sul tuo viaggio" })).toHaveClass("rounded-lg", "shadow-md");
    expect(screen.getByRole("region", { name: "Listino carburanti" })).toHaveClass("rounded-lg");
    expect(screen.getByTestId("tile-detour")).toHaveClass("rounded");
    expect(screen.getAllByTestId("price-tile")[0]).toHaveClass("rounded");
    expect(screen.getByRole("button", { name: /Apri nel Navigatore/ })).toHaveClass("rounded-full", "bg-primary-strong");
  });

  it("nessun testo ≤14px usa text-primary, text-secondary o text-outline (regola di contrasto)", async () => {
    respondWith();
    const { container } = renderScreen();
    await loaded();
    const small = container.querySelectorAll(".text-label-sm, .text-label-md, .text-label-lg, .text-body-sm, .text-body-md");
    expect(small.length).toBeGreaterThan(10);
    const weak = ["text-primary", "text-secondary", "text-outline"];
    expect([...small].filter((el) => weak.some((cls) => el.classList.contains(cls)))).toEqual([]);
  });
});

describe("StationDetailScreen — «Intorno a me»", () => {
  const nearbyDetail = (overrides: Parameters<typeof makeDetail>[0] = {}) =>
    makeDetail({
      mode: "nearby",
      referencePrice: { value: 2.139, level: "area", sampleSize: 12 },
      detour: { km: 6.2, minutes: 11.4, source: "routing" },
      lateralDistanceKm: 2.7,
      alongRouteKm: 0,
      ...overrides,
    });

  it("l'impatto parla del rifornimento: giro andata e ritorno (senza «+»), costo del giro e riferimento della zona", async () => {
    respondWith(nearbyDetail());
    renderScreen();
    await loaded();

    const bento = screen.getByRole("region", { name: "Impatto del rifornimento" });
    expect(screen.queryByRole("region", { name: "Impatto sul tuo viaggio" })).not.toBeInTheDocument();
    const tile = within(bento).getByTestId("tile-detour");
    expect(tile).toHaveTextContent("Andata e ritorno");
    expect(tile).toHaveTextContent("6,2 km");
    expect(tile).toHaveTextContent("11 min guida");
    expect(tile).not.toHaveTextContent("+");
    expect(tile).not.toHaveTextContent("Deviazione");
    expect(bento).toHaveTextContent("Riferimento €2,139/L (prezzo tipico di 12 stazioni nel raggio di ricerca)");
    expect(bento).toHaveTextContent("costo del giro");
    expect(bento).not.toHaveTextContent("costo della deviazione");
  });

  it("in fondo dice la distanza in linea d'aria da te, non la posizione sul percorso", async () => {
    respondWith(nearbyDetail());
    renderScreen();
    await loaded();
    expect(screen.getByText("A 2,7 km in linea d'aria da te.")).toBeInTheDocument();
    expect(screen.queryByText(/dalla partenza/)).not.toBeInTheDocument();
  });

  it("una stima (routing non disponibile) resta segnalata con la tilde, anche senza il «+»", async () => {
    respondWith(nearbyDetail({ detour: { km: 6.2, minutes: 11.4, source: "proxy" } }));
    renderScreen();
    await loaded();
    const tile = screen.getByTestId("tile-detour");
    expect(tile).toHaveTextContent("~6,2 km");
    expect(within(tile).getByTestId("detour-source")).toHaveTextContent("Stima approssimata");
  });

  it("«In viaggio» non cambia: «Impatto sul tuo viaggio», «+» davanti alla deviazione e posizione sul percorso", async () => {
    respondWith(makeDetail({ alongRouteKm: 12.3, lateralDistanceKm: 0.8 }));
    renderScreen();
    await loaded();
    expect(screen.getByRole("region", { name: "Impatto sul tuo viaggio" })).toBeInTheDocument();
    expect(screen.getByTestId("tile-detour")).toHaveTextContent("+1,6 km");
    expect(screen.getByText("A 12,3 km dalla partenza, a 0,8 km dal percorso diretto.")).toBeInTheDocument();
  });
});

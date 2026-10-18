import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeDetail } from "../../test/fixtures";
import { StationDetailDialog } from "./StationDetailDialog";

let fetchSpy: ReturnType<typeof vi.fn>;
const respondWith = (detail = makeDetail()) => fetchSpy.mockResolvedValue({ ok: true, json: async () => detail });

beforeEach(() => {
  fetchSpy = vi.fn();
  vi.stubGlobal("fetch", fetchSpy);
  document.body.style.overflow = "";
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  Reflect.deleteProperty(navigator, "share");
});

/** Un «Info» finto che apre il dialogo, come la scheda dei Risultati. */
function Host({ onClosed }: { onClosed?: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Info su 1858 BREGNANO
      </button>
      <button type="button">Altro pulsante dei risultati</button>
      {open && (
        <StationDetailDialog
          searchId="s1"
          stationId={2}
          onClose={() => {
            setOpen(false);
            onClosed?.();
          }}
        />
      )}
    </>
  );
}

async function openDialog() {
  const user = userEvent.setup();
  respondWith();
  render(<Host />);
  const opener = screen.getByRole("button", { name: "Info su 1858 BREGNANO" });
  await user.click(opener);
  await screen.findByRole("heading", { name: "1858 BREGNANO" });
  return { user, opener };
}

const dialog = () => screen.getByRole("dialog", { name: /Dettaglio stazione/ });

describe("StationDetailDialog — apertura e contenuto (desktop)", () => {
  it("si apre come dialogo modale con il nome della stazione, sopra uno sfondo oscurato e sfocato, max-w-3xl con scorrimento interno", async () => {
    await openDialog();
    expect(dialog()).toHaveAttribute("aria-modal", "true");
    expect(dialog()).toHaveAccessibleName("Dettaglio stazione: 1858 BREGNANO");
    expect(dialog()).toHaveClass("max-w-3xl", "2xl:max-w-5xl", "max-h-[calc(100dvh-4rem)]", "flex", "flex-col");
    const backdrop = screen.getByTestId("station-dialog-backdrop");
    expect(backdrop).toHaveClass("fixed", "inset-0", "bg-inverse-surface/40", "backdrop-blur-sm", "items-center", "justify-center");
    expect(screen.getByTestId("station-dialog-scroll")).toHaveClass("overflow-y-auto", "flex-1", "min-h-0");
  });

  it("ha il contenuto del dettaglio: meta card, bento a 3 tile («vs Media»), listino a 4 colonne con «Verificato MISE», CTA", async () => {
    await openDialog();
    const d = within(dialog());
    expect(d.getByRole("region", { name: "Stazione" })).toBeInTheDocument();
    const bento = d.getByRole("region", { name: "Impatto sul tuo viaggio" });
    expect(within(bento).getByText("vs Media")).toBeInTheDocument();
    expect(within(bento).queryByText(/Media Autostradale/i)).not.toBeInTheDocument();
    expect(within(bento).getByTestId("tile-detour")).toBeInTheDocument();
    expect(within(bento).getByTestId("tile-savings")).toBeInTheDocument();
    expect(within(bento).getByTestId("tile-differential")).toBeInTheDocument();
    const list = d.getByRole("region", { name: "Listino carburanti" });
    expect(within(list).getByText("Verificato MISE")).toBeInTheDocument();
    expect(within(list).getAllByTestId("price-tile")).toHaveLength(4);
    expect(within(list).getAllByTestId("price-tile")[0]!.parentElement).toHaveClass("lg:grid-cols-4");
    expect(d.getByRole("button", { name: /Apri nel Navigatore/ })).toBeInTheDocument();
  });

  it("diciture del listino DERIVATE dai dati: «Scelto nella ricerca» e «+€0,210 vs self»; mai «Prezzo consigliato» né «Ottimo prezzo»", async () => {
    await openDialog();
    const tiles = within(dialog()).getAllByTestId("price-tile");
    expect(tiles[0]).toHaveTextContent("Scelto nella ricerca"); // Benzina Self, scelta
    expect(tiles[1]).toHaveTextContent("+€0,210 vs self"); // Benzina Servito 2,200 vs Self 1,990
    expect(tiles[3]).toHaveTextContent("+€0,210 vs self"); // Diesel Servito 2,400 vs Self 2,190
    expect(tiles[2]).not.toHaveTextContent(/vs self/); // un Self non si confronta con sé stesso
    expect(dialog().textContent).not.toMatch(/Prezzo consigliato|Ottimo prezzo/i);
  });

  it("la CTA «Apri nel Navigatore» è una pill senza card, ancorata in fondo al dialogo (non alla finestra), con la sfocatura progressiva", async () => {
    await openDialog();
    const bar = screen.getByTestId("navigate-bar");
    expect(bar).toHaveAttribute("data-placement", "container");
    expect(bar).toHaveClass("absolute", "bottom-0");
    expect(bar.className).not.toMatch(/\bfixed\b/);
    expect(dialog().contains(bar)).toBe(true);
    const cta = within(bar).getByRole("button", { name: /Apri nel Navigatore/ });
    expect(cta).toHaveClass("w-full", "rounded-full", "bg-primary-strong");
    const container = screen.getByTestId("navigate-bar-container");
    expect(container.className).not.toMatch(/\bbg-|border|shadow|rounded|backdrop/);
    expect(within(bar).getByTestId("progressive-blur")).toHaveClass("progressive-blur");
  });

  it("«Apri nel Navigatore» apre il foglio dei navigatori SOPRA il dialogo senza chiuderlo; Esc chiude prima il foglio, poi il dialogo", async () => {
    const { user } = await openDialog();
    await user.click(within(dialog()).getByRole("button", { name: /Apri nel Navigatore/ }));
    const sheet = await screen.findByRole("dialog", { name: "Apri in navigatore" });
    await user.click(within(sheet).getByRole("link", { name: /Google Maps/ }).closest("div")!); // un tocco dentro il foglio non chiude il dialogo
    expect(screen.getByRole("dialog", { name: /Dettaglio stazione/ })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Apri in navigatore" })).not.toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: /Dettaglio stazione/ })).toBeInTheDocument(); // il dialogo è ancora aperto
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("Condividi: senza Web Share copia testo e link e lo dice", async () => {
    const { user } = await openDialog();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    await user.click(within(dialog()).getByRole("button", { name: "Condividi la stazione" }));
    expect(await screen.findByText("Link copiato negli appunti")).toBeInTheDocument();
    expect(writeText).toHaveBeenCalledTimes(1);
  });
});

describe("StationDetailDialog — chiusura", () => {
  it("si chiude con la «×»", async () => {
    const { user } = await openDialog();
    await user.click(within(dialog()).getByRole("button", { name: "Chiudi" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("si chiude con Esc", async () => {
    const { user } = await openDialog();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("si chiude toccando lo sfondo, non toccando dentro il dialogo", async () => {
    const { user } = await openDialog();
    await user.click(within(dialog()).getByRole("heading", { name: "1858 BREGNANO" }));
    expect(dialog()).toBeInTheDocument();
    await user.click(screen.getByTestId("station-dialog-backdrop"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("al termine il focus torna al pulsante «Info» che l'aveva aperto e lo sfondo torna a scorrere", async () => {
    const { user, opener } = await openDialog();
    expect(document.body.style.overflow).toBe("hidden");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(opener).toHaveFocus());
    expect(document.body.style.overflow).toBe("");
  });
});

describe("StationDetailDialog — focus trap", () => {
  it("all'apertura il focus va dentro il dialogo (sulla «×»)", async () => {
    await openDialog();
    expect(within(dialog()).getByRole("button", { name: "Chiudi" })).toHaveFocus();
  });

  it("Tab ruota tra i controlli del dialogo e non esce mai verso la pagina sotto; Maiusc+Tab fa il giro inverso", async () => {
    const { user } = await openDialog();
    const inside = within(dialog());
    // a dettaglio caricato i controlli sono: Condividi, Chiudi, Copia, Apri nel Navigatore
    const order: HTMLElement[] = [];
    for (let i = 0; i < 8; i++) {
      await user.tab();
      expect(dialog().contains(document.activeElement)).toBe(true); // mai fuori
      order.push(document.activeElement as HTMLElement);
    }
    // dopo l'ultimo controllo si torna al primo (giro completo)
    const names = order.map((el) => el.getAttribute("aria-label") ?? el.textContent);
    expect(new Set(names).size).toBeLessThan(order.length); // si ripete: il focus ha fatto il giro
    expect(names).toContain("Apri nel Navigatore: 1858 BREGNANO");
    expect(inside.getByRole("button", { name: /Apri nel Navigatore/ })).toBeInTheDocument();

    await user.tab({ shift: true });
    expect(dialog().contains(document.activeElement)).toBe(true);
  });

  it("Maiusc+Tab dal primo controllo va all'ultimo (e Tab dall'ultimo al primo)", async () => {
    const { user } = await openDialog();
    const controls = [...dialog().querySelectorAll<HTMLElement>("button:not([disabled]), a[href]")];
    const first = controls[0]!;
    const last = controls[controls.length - 1]!;
    first.focus();
    await user.tab({ shift: true });
    expect(last).toHaveFocus();
    await user.tab();
    expect(first).toHaveFocus();
  });
});

describe("StationDetailDialog — caricamento ed errore", () => {
  it("durante il caricamento mostra lo stato, disattiva Condividi e Navigatore; «Chiudi» funziona", async () => {
    const user = userEvent.setup();
    fetchSpy.mockReturnValue(new Promise(() => {}));
    render(<StationDetailDialog searchId="s1" stationId={2} onClose={vi.fn()} />);
    expect(within(dialog()).getByRole("status")).toHaveTextContent("Verifico la deviazione");
    expect(within(dialog()).getByRole("button", { name: "Condividi la stazione" })).toBeDisabled();
    expect(within(dialog()).getByRole("button", { name: /Apri nel Navigatore/ })).toBeDisabled();
    expect(within(dialog()).getByRole("button", { name: "Chiudi" })).toBeEnabled();
    expect(user).toBeDefined();
  });

  it("ricerca scaduta: messaggio chiaro e «Chiudi» (non «Torna ai risultati», già sotto)", async () => {
    fetchSpy.mockResolvedValue({ ok: false, status: 404, json: async () => ({ error: { code: "SEARCH_NOT_FOUND", message: "Ricerca non trovata o scaduta." } }) });
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<StationDetailDialog searchId="s1" stationId={2} onClose={onClose} />);
    expect(await screen.findByText("Questa ricerca non è più disponibile")).toBeInTheDocument();
    await user.click(within(screen.getByRole("alert")).getByRole("button", { name: "Chiudi" }));
    expect(onClose).toHaveBeenCalled();
  });
});

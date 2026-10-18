import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsProvider, useSettings } from "../hooks/useSettings";
import { FACTORY_SETTINGS, resetSettingsMemory, saveSettings, type Settings } from "../lib/settings";
import { addressDetail, placeMissingFromSuggestions } from "./AddressInput";
import { SearchForm } from "./SearchForm";

const suggestions = [
  { id: "a", name: "Via Esempio 12", label: "Via Esempio 12, 00000 Città di Prova", lon: 9.15, lat: 45.55 },
  { id: "b", name: "Via Campione 8", label: "Via Campione 8, 00001 Borgo Campione", lon: 9.05, lat: 45.65 },
];

beforeEach(() => {
  localStorage.clear();
  resetSettingsMemory();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, json: async () => ({ suggestions }) })),
  );
});
afterEach(() => vi.unstubAllGlobals());

function Harness({ onSubmit, next }: { onSubmit: (request: unknown, labels: unknown) => void; next?: Settings }) {
  const { save } = useSettings();
  return (
    <>
      {next && (
        <button type="button" onClick={() => save(next)}>
          applica impostazioni
        </button>
      )}
      <SearchForm onSubmit={onSubmit} busy={false} />
    </>
  );
}

function renderForm(props: { next?: Settings; settings?: Settings } = {}) {
  if (props.settings) saveSettings(props.settings);
  const onSubmit = vi.fn();
  render(
    <SettingsProvider>
      <Harness onSubmit={onSubmit} next={props.next} />
    </SettingsProvider>,
  );
  return onSubmit;
}

async function chooseRoute(user: ReturnType<typeof userEvent.setup>) {
  for (const [placeholder, index] of [
    ["Da dove parti?", 0],
    ["Dove stai andando?", 1],
  ] as const) {
    await user.type(screen.getByPlaceholderText(placeholder), index === 0 ? "via esempio" : "via campione");
    const option = (await screen.findAllByRole("option"))[index]!;
    await user.click(option);
  }
}

const submit = async (user: ReturnType<typeof userEvent.setup>) => {
  await chooseRoute(user);
  await user.click(screen.getByRole("button", { name: "Trova il carburante più conveniente" }));
};

const settings = (patch: Partial<Settings>): Settings => ({ ...FACTORY_SETTINGS, ...patch });

describe("SearchForm — precompilazione dalle Impostazioni", () => {
  it("senza impostazioni salvate parte dai valori di fabbrica", () => {
    renderForm();
    expect(screen.getByRole("radio", { name: "Benzina" })).toBeChecked();
    expect(screen.getByText("45 L")).toBeInTheDocument();
    expect(screen.getByTestId("consumption-value")).toHaveTextContent("15,0 km/L");
  });

  it("usa carburante predefinito, serbatoio e consumo salvati", () => {
    renderForm({
      settings: settings({ vehicle: { ...FACTORY_SETTINGS.vehicle, defaultFuel: "diesel", tankLiters: 60 }, consumptionKmPerLiter: 18.5 }),
    });
    expect(screen.getByRole("radio", { name: "Diesel" })).toBeChecked();
    expect(screen.getByText("60 L")).toBeInTheDocument();
    expect(screen.getByTestId("consumption-value")).toHaveTextContent("18,5 km/L");
  });

  it("quando le Impostazioni cambiano la ricerca successiva riparte dai nuovi default", async () => {
    const user = userEvent.setup();
    renderForm({ next: settings({ vehicle: { ...FACTORY_SETTINGS.vehicle, defaultFuel: "gpl", tankLiters: 35 }, consumptionKmPerLiter: 12 }) });
    expect(screen.getByRole("radio", { name: "Benzina" })).toBeChecked();

    await user.click(screen.getByRole("button", { name: "applica impostazioni" }));
    expect(screen.getByRole("radio", { name: "GPL" })).toBeChecked();
    expect(screen.getByText("35 L")).toBeInTheDocument();
    expect(screen.getByTestId("consumption-value")).toHaveTextContent("12,0 km/L");
  });

  it("«ripristina profilo» riporta il consumo al valore salvato nelle Impostazioni", async () => {
    const user = userEvent.setup();
    renderForm({ settings: settings({ consumptionKmPerLiter: 18 }) });
    for (let i = 0; i < 4; i++) await user.click(screen.getByRole("button", { name: "Aumenta consumo" }));
    expect(screen.getByTestId("consumption-value")).toHaveTextContent("20,0 km/L");
    await user.click(screen.getByRole("button", { name: /ripristina profilo/ }));
    expect(screen.getByTestId("consumption-value")).toHaveTextContent("18,0 km/L");
  });
});

describe("SearchForm — deviazione massima dalle Impostazioni", () => {
  const slider = () => screen.getByLabelText("Deviazione massima") as HTMLInputElement;

  it("senza impostazioni salvate lo slider parte da 5 km; con «Deviazione massima predefinita» salvata parte da quel valore", () => {
    const first = render(
      <SettingsProvider>
        <SearchForm onSubmit={vi.fn()} busy={false} />
      </SettingsProvider>,
    );
    expect(slider()).toHaveValue("5");
    first.unmount();
    saveSettings({ ...FACTORY_SETTINGS, defaultMaxDetourKm: 8 });
    render(
      <SettingsProvider>
        <SearchForm onSubmit={vi.fn()} busy={false} />
      </SettingsProvider>,
    );
    expect(slider()).toHaveValue("8");
    expect(screen.getByText("8 km")).toBeInTheDocument();
  });

  it("si può cambiare per ricerca e la richiesta porta il valore dello slider", async () => {
    const user = userEvent.setup();
    const onSubmit = renderForm({ settings: settings({ defaultMaxDetourKm: 7 }) });
    fireEvent.change(slider(), { target: { value: "3" } });
    await submit(user);
    expect(onSubmit.mock.calls[0]![0]).toMatchObject({ maxDetourKm: 3 });
  });

  it("la richiesta di default porta il valore predefinito delle Impostazioni", async () => {
    const user = userEvent.setup();
    const onSubmit = renderForm({ settings: settings({ defaultMaxDetourKm: 9 }) });
    await submit(user);
    expect(onSubmit.mock.calls[0]![0]).toMatchObject({ maxDetourKm: 9 });
  });

  it("quando le Impostazioni cambiano lo slider riparte dal nuovo default", async () => {
    const user = userEvent.setup();
    renderForm({ next: settings({ defaultMaxDetourKm: 2 }) });
    fireEvent.change(slider(), { target: { value: "6" } });
    expect(slider()).toHaveValue("6");
    await user.click(screen.getByRole("button", { name: "applica impostazioni" }));
    expect(slider()).toHaveValue("2");
  });
});

describe("SearchForm — switch «Solo Self» ed «Evita autostrada» per ricerca", () => {
  const onlySelf = () => screen.getByRole("switch", { name: "Solo Self" });
  const avoid = () => screen.getByRole("switch", { name: "Evita autostrada" });

  it("sono accanto: «Solo Self» seguito da «Evita autostrada», e di fabbrica Solo Self è ON ed Evita autostrada OFF", () => {
    renderForm();
    expect(onlySelf()).toHaveAttribute("aria-checked", "true");
    expect(avoid()).toHaveAttribute("aria-checked", "false");
    expect(onlySelf().compareDocumentPosition(avoid()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("sono precompilati dai default delle Impostazioni (Solo Self OFF, Evita autostrada ON)", () => {
    renderForm({ settings: settings({ onlySelf: false, avoidMotorway: true }) });
    expect(onlySelf()).toHaveAttribute("aria-checked", "false");
    expect(avoid()).toHaveAttribute("aria-checked", "true");
  });

  it("si cambiano per ricerca e vengono inviati con la richiesta, senza toccare le Impostazioni salvate", async () => {
    const user = userEvent.setup();
    const onSubmit = renderForm();
    await user.click(onlySelf());
    await user.click(avoid());
    await submit(user);
    expect(onSubmit.mock.calls[0]![0]).toMatchObject({ onlySelf: false, avoidMotorway: true });
    expect(localStorage.getItem("tappafurba.settings.v1")).toBeNull(); // la scelta per-ricerca non è una preferenza
  });

  it("la richiesta porta i default di pedaggi e traghetti dalle Impostazioni (non hanno switch nel form)", async () => {
    const user = userEvent.setup();
    const onSubmit = renderForm({ settings: settings({ avoidTolls: true, avoidFerries: true }) });
    expect(screen.queryByRole("switch", { name: /pedaggi|traghetti/i })).not.toBeInTheDocument();
    await submit(user);
    expect(onSubmit.mock.calls[0]![0]).toMatchObject({ avoidMotorway: false, avoidTolls: true, avoidFerries: true });
  });

  it("quando le Impostazioni cambiano, entrambi gli switch ripartono dai nuovi default", async () => {
    const user = userEvent.setup();
    renderForm({ next: settings({ onlySelf: false, avoidMotorway: true }) });
    await user.click(onlySelf()); // la scelta per-ricerca (ora OFF)
    await user.click(onlySelf()); // di nuovo ON
    await user.click(screen.getByRole("button", { name: "applica impostazioni" }));
    expect(onlySelf()).toHaveAttribute("aria-checked", "false");
    expect(avoid()).toHaveAttribute("aria-checked", "true");
  });
});

describe("SearchForm — richiesta con i parametri delle Impostazioni", () => {
  it("di fabbrica: V_time 0,15, soglia 72 h, nessuna esclusione, Solo Self, nessun prezzo di riferimento manuale", async () => {
    const user = userEvent.setup();
    const onSubmit = renderForm();
    await submit(user);
    const request = onSubmit.mock.calls[0]![0];
    expect(request).toMatchObject({ fuelType: "benzina", liters: 45, consumptionKmPerLiter: 15, valueOfTimePerMinute: 0.15, maxPriceAgeHours: 72, onlySelf: true, avoidMotorway: false, avoidTolls: false, avoidFerries: false });
    expect(request).not.toHaveProperty("referencePriceOverride");
  });

  it("invia V_time, soglia di freschezza e «Evita autostrada» salvati", async () => {
    const user = userEvent.setup();
    const onSubmit = renderForm({ settings: settings({ valueOfTimePerMinute: 0.4, maxPriceAgeHours: 24, avoidMotorway: true }) });
    await submit(user);
    expect(onSubmit.mock.calls[0]![0]).toMatchObject({ valueOfTimePerMinute: 0.4, maxPriceAgeHours: 24, avoidMotorway: true });
  });

  it("prezzo di riferimento manuale: invia il valore del carburante cercato", async () => {
    const user = userEvent.setup();
    const onSubmit = renderForm({ settings: settings({ referenceMode: "manual", manualReference: { benzina: 1.95, diesel: 1.8 } }) });
    await submit(user);
    expect(onSubmit.mock.calls[0]![0]).toMatchObject({ fuelType: "benzina", referencePriceOverride: 1.95 });
  });

  it("cambiando carburante nel form si usa il valore manuale di QUEL carburante", async () => {
    const user = userEvent.setup();
    const onSubmit = renderForm({ settings: settings({ referenceMode: "manual", manualReference: { benzina: 1.95, diesel: 1.8 } }) });
    await user.click(screen.getByRole("radio", { name: "Diesel" }));
    await submit(user);
    expect(onSubmit.mock.calls[0]![0]).toMatchObject({ fuelType: "diesel", referencePriceOverride: 1.8 });
  });

  it("manuale ma senza valore per il carburante cercato: nessun override (calcolo automatico)", async () => {
    const user = userEvent.setup();
    const onSubmit = renderForm({ settings: settings({ referenceMode: "manual", manualReference: { benzina: 1.95 } }) });
    await user.click(screen.getByRole("radio", { name: "GPL" }));
    await submit(user);
    expect(onSubmit.mock.calls[0]![0]).not.toHaveProperty("referencePriceOverride");
  });

  it("modalità Automatico: i valori manuali memorizzati non vengono inviati", async () => {
    const user = userEvent.setup();
    const onSubmit = renderForm({ settings: settings({ referenceMode: "auto", manualReference: { benzina: 1.95 } }) });
    await submit(user);
    expect(onSubmit.mock.calls[0]![0]).not.toHaveProperty("referencePriceOverride");
  });

  it("la richiesta non contiene altro che coordinate scelte nel form: nulla delle impostazioni è un indirizzo", async () => {
    const user = userEvent.setup();
    const onSubmit = renderForm({ settings: settings({ vehicle: { ...FACTORY_SETTINGS.vehicle, modelName: "Panda" } }) });
    await submit(user);
    expect(JSON.stringify(onSubmit.mock.calls[0]![0])).not.toContain("Panda"); // il modello non entra nella ricerca
    const labels = onSubmit.mock.calls[0]![1] as { origin: string; destination: string };
    expect(labels.origin).toContain("Città di Prova");
  });
});

describe("SearchForm — card A→B", () => {
  const origin = () => screen.getByRole("combobox", { name: "Partenza" }) as HTMLInputElement;
  const destination = () => screen.getByRole("combobox", { name: "Destinazione" }) as HTMLInputElement;

  it("ordine: partenza, divisore con il pulsante di scambio, destinazione (lo scambio sta tra i due campi, non dentro uno)", () => {
    renderForm();
    const swap = screen.getByRole("button", { name: "Scambia partenza e destinazione" });
    const divider = screen.getByTestId("route-divider");
    expect(divider).toContainElement(swap);
    expect(origin().compareDocumentPosition(divider) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(divider.compareDocumentPosition(destination()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(swap).toHaveClass("top-1/2", "-translate-y-1/2"); // centrato in verticale sul divisore
    expect(swap).toHaveClass("w-11", "h-11"); // area di tocco 44 px
    expect(screen.getByTestId("route-card")).toContainElement(origin());
  });

  it("la linea tratteggiata sta al centro dei due pallini: stessa distanza dall'alto e dal basso, e centro orizzontale = centro dei pallini", () => {
    renderForm();
    const line = screen.getByTestId("route-dashed-line");
    expect(line).toHaveClass("border-dashed");
    // padding della card 14 + metà riga (72 → 36) = 50 px da entrambi i lati; centro dei pallini: 14 + 4 (px-1) + 6 (w-3/2) = 24, linea larga 2 px → left 23.
    expect(line.style.top).toBe("50px");
    expect(line.style.bottom).toBe("50px");
    expect(line.style.left).toBe("23px");
    expect(screen.getByTestId("route-card").style.padding).toBe("14px");
    for (const input of [origin(), destination()]) expect(input.closest('[data-testid="address-row"]')).toHaveClass("h-[72px]"); // righe di altezza fissa
  });

  it("scambia partenza e destinazione (testo e luoghi)", async () => {
    const user = userEvent.setup();
    const onSubmit = renderForm();
    await chooseRoute(user);
    const [a, b] = [origin().value, destination().value];
    await user.click(screen.getByRole("button", { name: "Scambia partenza e destinazione" }));
    expect(origin().value).toBe(b);
    expect(destination().value).toBe(a);
    await user.click(screen.getByRole("button", { name: "Trova il carburante più conveniente" }));
    expect(onSubmit.mock.calls[0]![0]).toMatchObject({ origin: { lon: 9.05 }, destination: { lon: 9.15 } });
  });

  it("ogni campo ha la sua «×» (compare solo con del testo), cancella il testo, il luogo scelto e riporta il cursore nel campo", async () => {
    const user = userEvent.setup();
    renderForm();
    expect(screen.queryByRole("button", { name: "Cancella partenza" })).not.toBeInTheDocument();
    await chooseRoute(user);
    await user.click(screen.getByRole("button", { name: "Cancella partenza" }));
    expect(origin()).toHaveValue("");
    expect(origin()).toHaveFocus();
    expect(destination().value).not.toBe(""); // l'altro campo non si tocca
    expect(screen.getByRole("button", { name: "Trova il carburante più conveniente" })).toBeDisabled(); // senza luogo scelto non si cerca
    await user.click(screen.getByRole("button", { name: "Cancella destinazione" }));
    expect(destination()).toHaveValue("");
  });

  it("«Usa la posizione attuale» resta sulla partenza (non sulla destinazione)", () => {
    renderForm();
    const locate = screen.getByRole("button", { name: "Usa la posizione attuale" });
    expect(origin().closest('[data-testid="address-row"]')).toContainElement(locate);
    expect(destination().closest('[data-testid="address-row"]')).not.toContainElement(locate);
  });

  it("con il GPS la ricerca porta il flag «posizione attuale» (per lo storico: nessun indirizzo, nessuna coordinata salvata); digitare nel campo lo toglie", async () => {
    const getCurrentPosition = vi.fn((success: PositionCallback) => success({ coords: { longitude: 9.5, latitude: 45.6 } } as GeolocationPosition));
    Object.defineProperty(navigator, "geolocation", { value: { getCurrentPosition }, configurable: true });
    try {
      const user = userEvent.setup();
      const onSubmit = renderForm();
      await user.click(screen.getByRole("button", { name: "Usa la posizione attuale" }));
      expect(origin()).toHaveValue("Posizione attuale");
      await user.type(destination(), "via campione");
      await user.click((await screen.findAllByRole("option"))[0]!);
      await user.click(screen.getByRole("button", { name: "Trova il carburante più conveniente" }));
      expect(onSubmit.mock.calls[0]![1]).toMatchObject({ origin: "Posizione attuale", originCurrent: true });
      expect(onSubmit.mock.calls[0]![1]).not.toHaveProperty("destinationCurrent");

      // se poi si digita un altro testo nella partenza non è più la posizione attuale
      onSubmit.mockClear();
      await user.clear(origin());
      await user.type(origin(), "via esempio");
      await user.click((await screen.findAllByRole("option"))[0]!);
      await user.click(screen.getByRole("button", { name: "Trova il carburante più conveniente" }));
      expect(onSubmit.mock.calls[0]![1]).not.toHaveProperty("originCurrent");
    } finally {
      Reflect.deleteProperty(navigator, "geolocation");
    }
  });
});

describe("SearchForm — consumo per ricerca: stepper nell'unità scelta", () => {
  const value = () => screen.getByTestId("consumption-value");
  const up = () => screen.getByRole("button", { name: "Aumenta consumo" });
  const down = () => screen.getByRole("button", { name: "Riduci consumo" });

  it("km/L: passi di 0,5, pill con l'unità, suggerimento «dal tuo profilo» che diventa «Personalizzato»", async () => {
    const user = userEvent.setup();
    renderForm();
    expect(screen.getByText("dal tuo profilo")).toBeInTheDocument();
    await user.click(up());
    expect(value()).toHaveTextContent("15,5 km/L");
    expect(screen.getByText("Personalizzato")).toBeInTheDocument();
    await user.click(down());
    await user.click(down());
    expect(value()).toHaveTextContent("14,5 km/L");
  });

  it("«ripristina profilo (15,0 km/L)» è spento finché il valore è quello del profilo", async () => {
    const user = userEvent.setup();
    renderForm();
    const reset = () => screen.getByRole("button", { name: "ripristina profilo (15,0 km/L)" });
    expect(reset()).toBeDisabled();
    await user.click(up());
    expect(reset()).toBeEnabled();
    await user.click(reset());
    expect(value()).toHaveTextContent("15,0 km/L");
    expect(reset()).toBeDisabled();
  });

  it("L/100 km (solo display): pill «6,7 L/100 km», passi di 0,5 L/100 km, ripristina «(6,7 L/100 km)» e la richiesta resta in km/L", async () => {
    const user = userEvent.setup();
    const onSubmit = renderForm({ settings: settings({ consumptionUnit: "l100km" }) });
    expect(value()).toHaveTextContent("6,7 L/100 km");
    await user.click(up());
    expect(value()).toHaveTextContent("7,2 L/100 km");
    await user.click(up());
    expect(value()).toHaveTextContent("7,7 L/100 km");
    await user.click(down());
    await user.click(down());
    await user.click(down());
    expect(value()).toHaveTextContent("6,2 L/100 km");
    expect(screen.getByRole("button", { name: "ripristina profilo (6,7 L/100 km)" })).toBeEnabled();

    await user.click(up()); // 6,7 L/100 km mostrati, ma il valore non è più esattamente 15 km/L
    await user.click(up()); // 7,2 → 100 / 7,2 = 13,89 km/L
    await submit(user);
    expect(onSubmit.mock.calls[0]![0]).toMatchObject({ consumptionKmPerLiter: 13.89 });
  });

  it("in L/100 km il ripristino torna esattamente al valore del profilo (15 km/L, non 14,93)", async () => {
    const user = userEvent.setup();
    const onSubmit = renderForm({ settings: settings({ consumptionUnit: "l100km" }) });
    await user.click(up());
    await user.click(screen.getByRole("button", { name: /ripristina profilo/ }));
    await submit(user);
    expect(onSubmit.mock.calls[0]![0]).toMatchObject({ consumptionKmPerLiter: 15 });
  });

  it("i limiti restano 3–40 km/L (2,5–33,3 L/100 km): ai bordi il pulsante è disattivato", () => {
    const first = render(
      <SettingsProvider>
        <SearchForm onSubmit={vi.fn()} busy={false} />
      </SettingsProvider>,
    );
    first.unmount();
    saveSettings(settings({ consumptionKmPerLiter: 40 }));
    render(
      <SettingsProvider>
        <SearchForm onSubmit={vi.fn()} busy={false} />
      </SettingsProvider>,
    );
    expect(up()).toBeDisabled();
    expect(down()).toBeEnabled();
  });

  it("con la ricerca in km/L il valore inviato è quello dello stepper, mai in L/100 km", async () => {
    const user = userEvent.setup();
    const onSubmit = renderForm();
    await user.click(up());
    await user.click(up());
    await submit(user);
    expect(onSubmit.mock.calls[0]![0]).toMatchObject({ consumptionKmPerLiter: 16 });
  });

  it("non esiste più il campo di testo del consumo (niente input libero fuori intervallo)", () => {
    renderForm();
    expect(screen.queryByRole("textbox", { name: "Consumo del veicolo" })).toBeNull();
    expect(screen.getByRole("group", { name: "Consumo del veicolo" })).toBeInTheDocument();
  });
});

describe("SearchForm — suggerimenti di indirizzo", () => {
  it("«via esempio 12, città di prova»: i suggerimenti non contengono il comune → suggerimento di scrivere il nome completo della via", async () => {
    // Quello che Mapbox restituisce davvero per questa ricerca: «Via Esempio 12» in altri comuni, non a Città di Prova.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ suggestions: [{ id: "o", name: "Via Esempio 12", label: "Via Esempio 12, 00002 Altro Comune provincia di Altra, Italia", lon: 9.3, lat: 45.4 }] }),
      })),
    );
    const user = userEvent.setup();
    renderForm();
    await user.type(screen.getByPlaceholderText("Da dove parti?"), "via esempio 12, città di prova");
    expect(await screen.findByTestId("full-street-hint")).toHaveTextContent("nome completo della via");
  });

  it("se un suggerimento contiene già il comune scritto il suggerimento non compare", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.type(screen.getByPlaceholderText("Da dove parti?"), "via campione 8, borgo campione");
    await screen.findAllByRole("option");
    expect(screen.queryByTestId("full-street-hint")).not.toBeInTheDocument();
  });

  it("nessun risultato: dice «Nessun suggerimento» (e non lampeggia mentre si aspetta la risposta)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ suggestions: [] }) })));
    const user = userEvent.setup();
    renderForm();
    await user.type(screen.getByPlaceholderText("Da dove parti?"), "zzzzqq");
    expect(screen.queryByText(/Nessun suggerimento/)).not.toBeInTheDocument(); // ancora nel debounce
    expect(await screen.findByText(/Nessun suggerimento per «zzzzqq»/)).toBeInTheDocument();
  });
});

describe("placeMissingFromSuggestions", () => {
  const labels = ["Via Esempio 12, 00002 Altro Comune provincia di Altra, Italia", "Via Esempio 12, 00003 Terzo Comune provincia di Terza, Italia"];

  it("è vero se la parte dopo la virgola (il comune) non compare in nessun suggerimento", () => {
    expect(placeMissingFromSuggestions("via esempio 12, città di prova", labels)).toBe(true);
  });
  it("senza virgola, con comune presente (anche senza accenti/maiuscole) o troppo corto è falso", () => {
    expect(placeMissingFromSuggestions("via esempio 12 città di prova", labels)).toBe(false);
    expect(placeMissingFromSuggestions("via esempio 12, ALTRO COMUNE", labels)).toBe(false);
    expect(placeMissingFromSuggestions("via esempio 12, città di prova", ["Via Esempio, Citta di Prova"])).toBe(false);
    expect(placeMissingFromSuggestions("via esempio, ab", labels)).toBe(false);
  });
});

describe("addressDetail", () => {
  it("toglie dal dettaglio il nome già mostrato in grassetto", () => {
    expect(addressDetail("Via Esempio 12", "Via Esempio 12, 00002 Altro Comune provincia di Altra, Italia")).toBe("00002 Altro Comune provincia di Altra, Italia");
  });
  it("se il nome non è l'inizio dell'etichetta lascia l'etichetta intera", () => {
    expect(addressDetail("Duomo", "Piazza del Duomo 23, 20121 Milano")).toBe("Piazza del Duomo 23, 20121 Milano");
  });
});

describe("SearchForm — focus e controlli del foglio (revisione grafica 2)", () => {
  const rows = () => screen.getAllByTestId("address-row");

  it("nessuno sfondo né anello di focus sulla riga, sulla colonna dei pallini o (a riposo) sul contenitore del testo", () => {
    renderForm();
    for (const row of rows()) {
      expect(row.className).not.toMatch(/focus/);
      const dotColumn = row.firstElementChild as HTMLElement;
      expect(dotColumn.className).not.toMatch(/focus|bg-|ring/);
      const field = row.querySelector('[data-testid="address-field"]') as HTMLElement;
      expect(field.className).not.toMatch(/focus|ring|bg-/); // niente focus-within: da mouse/tap non cambia nulla
      expect(field.contains(row.querySelector("input"))).toBe(true);
    }
  });

  it("focus da mouse/tap: nessun anello e nessuno sfondo, né sul contenitore del testo né sulla colonna dei pallini", async () => {
    const user = userEvent.setup();
    renderForm();
    for (const placeholder of ["Da dove parti?", "Dove stai andando?"]) {
      await user.click(screen.getByPlaceholderText(placeholder)); // pointerdown + mousedown + focus
      const row = screen.getByPlaceholderText(placeholder).closest('[data-testid="address-row"]') as HTMLElement;
      const field = row.querySelector('[data-testid="address-field"]') as HTMLElement;
      expect(screen.getByPlaceholderText(placeholder)).toHaveFocus();
      expect(field).toHaveAttribute("data-keyboard-focus", "false");
      expect(field.className).not.toMatch(/ring|bg-/);
      expect((row.firstElementChild as HTMLElement).className).not.toMatch(/ring|bg-/);
    }
  });

  it("focus da tastiera (Tab): anello ring-2 ring-secondary/60 SOLO sul contenitore del testo, mai sulla colonna dei pallini; sparisce al blur", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.tab();
    const input = screen.getByPlaceholderText("Da dove parti?");
    expect(input).toHaveFocus();
    const row = input.closest('[data-testid="address-row"]') as HTMLElement;
    const field = row.querySelector('[data-testid="address-field"]') as HTMLElement;
    expect(field).toHaveClass("ring-2", "ring-secondary/60");
    expect(field).toHaveAttribute("data-keyboard-focus", "true");
    expect(row.className).not.toMatch(/ring/);
    expect((row.firstElementChild as HTMLElement).className).not.toMatch(/ring|bg-/);
    await user.tab(); // → «Usa la posizione attuale»
    expect(field).not.toHaveClass("ring-2");
    expect(field).toHaveAttribute("data-keyboard-focus", "false");
  });

  it("dopo un tasto, un tap su un altro campo non mostra l'anello (conta l'ultima interazione prima del focus)", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.tab(); // tastiera → partenza con anello
    await user.click(screen.getByPlaceholderText("Dove stai andando?")); // tap → destinazione senza anello
    const dest = screen.getByPlaceholderText("Dove stai andando?").closest('[data-testid="address-field"]') as HTMLElement;
    expect(dest).toHaveAttribute("data-keyboard-focus", "false");
    expect(dest).not.toHaveClass("ring-2");
    // digitare mentre il campo ha già il focus non fa comparire l'anello (il focus non è cambiato)
    await user.keyboard("mi");
    expect(dest).toHaveAttribute("data-keyboard-focus", "false");
  });

  it("il contenitore del testo non contiene la colonna dei pallini né i controlli a destra, e il tratteggio non è dentro nessuna riga", () => {
    renderForm();
    const line = screen.getByTestId("route-dashed-line");
    for (const row of rows()) {
      const field = row.querySelector('[data-testid="address-field"]') as HTMLElement;
      expect(field.querySelector("button")).toBeNull();
      expect(row.contains(line)).toBe(false);
      expect(field.contains(row.firstElementChild)).toBe(false);
    }
  });

  it("«×», mirino e scambio hanno un'area di tocco di 44 px (w-11 h-11) e i controlli di un campo stanno distanziati (gap-space-sm)", async () => {
    const user = userEvent.setup();
    renderForm();
    await chooseRoute(user);
    for (const name of ["Cancella partenza", "Cancella destinazione", "Usa la posizione attuale", "Scambia partenza e destinazione"]) {
      expect(screen.getByRole("button", { name }), name).toHaveClass("w-11", "h-11");
    }
    const actions = screen.getByRole("button", { name: "Cancella partenza" }).parentElement!;
    expect(actions).toHaveClass("gap-space-sm", "shrink-0");
    expect(actions).toContainElement(screen.getByRole("button", { name: "Usa la posizione attuale" }));
  });

  it("il pulsante di scambio sta più a sinistra della colonna dei controlli (right-7), così non si sovrappone al mirino né alle «×»", () => {
    renderForm();
    expect(screen.getByRole("button", { name: "Scambia partenza e destinazione" })).toHaveClass("right-7");
  });

  it("lo scambio ha un'animazione: gira di 180° al passaggio del mouse e alla pressione (transition-transform duration-300) e prende lo sfondo/colore di hover", () => {
    renderForm();
    const circle = screen.getByRole("button", { name: "Scambia partenza e destinazione" }).firstElementChild as HTMLElement;
    expect(circle).toHaveClass(
      "transition-transform", "duration-300", "group-hover:rotate-180", "group-active:rotate-180", "group-hover:bg-primary-fixed/30", "group-hover:text-primary",
    );
    expect(screen.getByRole("button", { name: "Scambia partenza e destinazione" })).toHaveClass("group"); // l'hover vale su tutta l'area di tocco
  });
});

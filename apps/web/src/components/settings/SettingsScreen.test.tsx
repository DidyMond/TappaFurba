import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SettingsProvider } from "../../hooks/useSettings";
import {
  FACTORY_SETTINGS,
  loadSettings,
  referenceOverrideFor,
  resetSettingsMemory,
  saveSettings,
  SETTINGS_KEY,
  type Settings,
} from "../../lib/settings";
import { loadRecentRoutes, recordRecentRoute, resetRecentRoutesMemory } from "../../lib/recentRoutes";
import { MAP_STYLE_CHANGED_EVENT, resetMapStyleMemory, type MapStyleChangedDetail } from "../../lib/mapStyle";
import { resetViewport, setViewportWidth } from "../../test/matchMedia";
import { SettingsScreen } from "./SettingsScreen";

beforeEach(() => {
  localStorage.clear();
  resetSettingsMemory();
  resetMapStyleMemory();
  resetRecentRoutesMemory();
});
afterEach(() => resetViewport());

const seed = (patch: Partial<Settings> = {}) => saveSettings({ ...FACTORY_SETTINGS, ...patch });

function renderScreen() {
  return render(
    <MemoryRouter>
      <SettingsProvider>
        <SettingsScreen />
      </SettingsProvider>
    </MemoryRouter>,
  );
}

type User = ReturnType<typeof userEvent.setup>;
const SECTIONS = ["Profilo Veicolo", "Consumi e Carburante", "Algoritmo & Filtri", "Notifiche & Dati di Sistema"];

// Le sezioni sono chiuse al caricamento: ogni test apre quelle che usa.
const open = async (user: User, name: string) => {
  const header = screen.getByRole("button", { name });
  if (header.getAttribute("aria-expanded") === "false") await user.click(header);
};
const openAll = async (user: User) => {
  for (const name of SECTIONS) await open(user, name);
};
const saveButton = () => screen.getByRole("button", { name: "Salva Preferenze" });
const restoreButton = () => screen.getByRole("button", { name: "Ripristina Predefiniti" });
const field = (label: string) => screen.getByLabelText(label) as HTMLInputElement;
const type = async (user: User, label: string, text: string) => {
  const input = field(label);
  await user.clear(input);
  if (text) await user.type(input, text);
};
const detourSlider = () => screen.getByRole("slider", { name: "Deviazione massima predefinita" }) as HTMLInputElement;
const consumptionSlider = () => screen.getByRole("slider", { name: "Consumo medio misto" }) as HTMLInputElement;
const timeSlider = () => screen.getByRole("slider", { name: "Valore del tuo tempo in euro all'ora" }) as HTMLInputElement;
const setSlider = (slider: HTMLElement, value: number) => fireEvent.change(slider, { target: { value: String(value) } });
const saved = () => loadSettings();

describe("SettingsScreen — struttura", () => {
  it("TUTTE e quattro le sezioni sono chiuse al caricamento (aria-expanded=false, pannello nascosto, chevron non ruotato)", () => {
    renderScreen();
    for (const name of SECTIONS) {
      const header = screen.getByRole("button", { name });
      expect(header, name).toHaveAttribute("aria-expanded", "false");
      const panel = document.getElementById(header.getAttribute("aria-controls")!)!;
      expect(panel, name).toHaveAttribute("hidden");
      expect(panel, name).not.toBeVisible();
      expect(panel.classList.contains("flex"), name).toBe(false);
      expect(header.querySelector("svg.rotate-180"), name).toBeNull(); // chevron verso il basso
    }
  });

  it("si aprono e chiudono col tap: aria-expanded, pannello visibile e chevron ruotato restano coerenti", async () => {
    const user = userEvent.setup();
    renderScreen();
    const header = () => screen.getByRole("button", { name: "Algoritmo & Filtri" });

    await user.click(header());
    expect(header()).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("region", { name: "Algoritmo & Filtri" })).toBeVisible();
    expect(header().querySelector("svg.rotate-180")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Profilo Veicolo" })).toHaveAttribute("aria-expanded", "false"); // le altre restano chiuse

    await user.click(header());
    expect(header()).toHaveAttribute("aria-expanded", "false");
    expect(document.getElementById("acc-algorithm-panel")).not.toBeVisible();
    expect(document.getElementById("acc-algorithm-panel")).toBeInTheDocument(); // resta montato: i campi non perdono il valore
    expect(header().querySelector("svg.rotate-180")).toBeNull();
  });

  it("una sezione chiusa non ha classi display: l'attributo hidden deve poter nasconderla (jsdom non carica il CSS, qui si controlla la causa)", async () => {
    const user = userEvent.setup();
    renderScreen();
    const panel = (id: string) => document.getElementById(`acc-${id}-panel`)!;
    expect(panel("algorithm")).toHaveAttribute("hidden");
    expect(panel("algorithm").classList.contains("flex")).toBe(false);

    await user.click(screen.getByRole("button", { name: "Algoritmo & Filtri" }));
    expect(panel("algorithm")).not.toHaveAttribute("hidden");
    expect(panel("algorithm").classList.contains("flex")).toBe(true);
    await user.click(screen.getByRole("button", { name: "Algoritmo & Filtri" }));
    expect(panel("algorithm").classList.contains("flex")).toBe(false);
  });

  it("titolo e azioni (nessuna pill «Calibrazione algoritmo» sopra il titolo)", () => {
    renderScreen();
    expect(screen.getByRole("heading", { level: 1, name: "Impostazioni Veicolo & Risparmio" })).toBeInTheDocument();
    expect(screen.queryByText(/calibrazione algoritmo/i)).not.toBeInTheDocument();
    expect(saveButton()).toBeInTheDocument();
    expect(restoreButton()).toBeInTheDocument();
  });

  it("parte dai valori di fabbrica", async () => {
    const user = userEvent.setup();
    renderScreen();
    await openAll(user);
    expect(screen.getByRole("radio", { name: "Berlina" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Benzina" })).toBeChecked();
    expect(within(screen.getByRole("group", { name: "Capacità serbatoio" })).getByText("45 L")).toBeInTheDocument();
    expect(consumptionSlider()).toHaveValue("15");
    expect(screen.getByRole("radio", { name: "Bilanciato" })).toBeChecked();
    expect(screen.getByRole("radio", { name: /Automatico/ })).toBeChecked();
    expect(screen.getByRole("switch", { name: "Evita autostrada" })).not.toBeChecked();
    expect(screen.getByRole("switch", { name: "Evita pedaggi" })).not.toBeChecked();
    expect(screen.getByRole("switch", { name: "Evita traghetti" })).not.toBeChecked();
    expect(screen.getByRole("switch", { name: "Cerca solo stazioni Self per impostazione predefinita" })).toBeChecked();
    expect(field("Soglia di freschezza prezzi")).toHaveValue("72");
  });
});

describe("SettingsScreen — salvataggio", () => {
  it("«Salva Preferenze» è disattivato finché non cambia qualcosa, poi salva in tappafurba.settings.v1", async () => {
    const user = userEvent.setup();
    renderScreen();
    await open(user, "Profilo Veicolo");
    expect(saveButton()).toBeDisabled();
    expect(localStorage.getItem(SETTINGS_KEY)).toBeNull();

    await user.click(screen.getByRole("radio", { name: "SUV" }));
    expect(saveButton()).toBeEnabled();
    expect(screen.getByText("Modifiche non salvate.")).toBeInTheDocument();
    expect(saved().vehicle.bodyType).toBe("berlina"); // non ancora salvato

    await user.click(saveButton());
    expect(saved().vehicle.bodyType).toBe("suv");
    expect(screen.getByText("Preferenze salvate")).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem("tappafurba.settings.v1")!).version).toBe(1);
    expect(saveButton()).toBeDisabled(); // di nuovo allineato
  });

  it("profilo veicolo: carrozzeria, modello, serbatoio e carburante predefinito", async () => {
    const user = userEvent.setup();
    renderScreen();
    await open(user, "Profilo Veicolo");
    await user.click(screen.getByRole("radio", { name: "Furgone" }));
    await user.type(screen.getByLabelText("Modello"), "Fiat Ducato");
    const stepper = screen.getByRole("group", { name: "Capacità serbatoio" });
    await user.click(within(stepper).getByRole("button", { name: "Aumenta capacità serbatoio" }));
    await user.click(within(stepper).getByRole("button", { name: "Aumenta capacità serbatoio" }));
    await user.click(screen.getByRole("radio", { name: "Diesel" }));
    await user.click(saveButton());

    expect(saved().vehicle).toEqual({ bodyType: "furgone", modelName: "Fiat Ducato", tankLiters: 55, defaultFuel: "diesel" });
  });

  it("le preferenze salvate si ritrovano riaprendo la schermata", async () => {
    const user = userEvent.setup();
    const { unmount } = renderScreen();
    await open(user, "Profilo Veicolo");
    await user.click(screen.getByRole("radio", { name: "Wagon" }));
    await user.click(saveButton());
    unmount();

    renderScreen();
    await open(user, "Profilo Veicolo");
    expect(screen.getByRole("radio", { name: "Wagon" })).toBeChecked();
    expect(saveButton()).toBeDisabled();
  });

  it("non salva indirizzi né coordinate", async () => {
    const user = userEvent.setup();
    renderScreen();
    await open(user, "Profilo Veicolo");
    await user.type(screen.getByLabelText("Modello"), "Panda");
    await user.click(saveButton());
    expect(localStorage.getItem(SETTINGS_KEY)).not.toMatch(/\"(lat|lon|origin|destination|address|indirizzo)\"/i);
  });
});

describe("SettingsScreen — consumi e carburante (slider)", () => {
  it("slider 3–40 km/L con passo 0,1, pill del valore corrente e tre tacche «8 Sport», «15 Medio», «30 Eco»", async () => {
    const user = userEvent.setup();
    renderScreen();
    await open(user, "Consumi e Carburante");
    const slider = consumptionSlider();
    expect(slider).toHaveAttribute("min", "3");
    expect(slider).toHaveAttribute("max", "40");
    expect(slider).toHaveAttribute("step", "0.1");
    expect(slider).toHaveValue("15");
    expect(screen.getByTestId("consumption-pill")).toHaveTextContent("15,0 km/L");
  });

  it("le tre tacche stanno sotto lo slider, distribuite con justify-between: Sport a sinistra, Medio al centro, Eco a destra", async () => {
    const user = userEvent.setup();
    renderScreen();
    await open(user, "Consumi e Carburante");
    const sport = screen.getByText("8 Sport");
    const medio = screen.getByText("15 Medio");
    const eco = screen.getByText("30 Eco");
    expect(sport.parentElement).toBe(medio.parentElement);
    expect(medio.parentElement).toBe(eco.parentElement);
    expect(sport.parentElement).toHaveClass("flex", "justify-between");
    expect([...sport.parentElement!.children]).toEqual([sport, medio, eco]);
    // Sotto lo slider, e la riga delle tacche non contiene altro (nessun pulsante «Ripristina» a sporcarla).
    expect(consumptionSlider().compareDocumentPosition(sport) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    setSlider(consumptionSlider(), 22);
    expect(within(sport.parentElement!).queryByRole("button")).not.toBeInTheDocument();
  });

  it("muovere lo slider aggiorna la pill e si salva come numero (passo 0,1)", async () => {
    const user = userEvent.setup();
    renderScreen();
    await open(user, "Consumi e Carburante");
    setSlider(consumptionSlider(), 18.5);
    expect(screen.getByTestId("consumption-pill")).toHaveTextContent("18,5 km/L");
    setSlider(consumptionSlider(), 3);
    expect(screen.getByTestId("consumption-pill")).toHaveTextContent("3,0 km/L");
    setSlider(consumptionSlider(), 40);
    expect(screen.getByTestId("consumption-pill")).toHaveTextContent("40,0 km/L");
    setSlider(consumptionSlider(), 22.5);
    await user.click(saveButton());
    expect(saved().consumptionKmPerLiter).toBe(22.5);
  });

  it("lo slider ha la risoluzione di 0,1 km/L: 15,3 e 7,8 si mostrano e si salvano esatti", async () => {
    const user = userEvent.setup();
    renderScreen();
    await open(user, "Consumi e Carburante");
    setSlider(consumptionSlider(), 15.3);
    expect(screen.getByTestId("consumption-pill")).toHaveTextContent("15,3 km/L");
    setSlider(consumptionSlider(), 7.8);
    expect(screen.getByTestId("consumption-pill")).toHaveTextContent("7,8 km/L");
    await user.click(saveButton());
    expect(saved().consumptionKmPerLiter).toBe(7.8);
  });

  it("«Ripristina» sta nella riga intestazione, accanto alla pill del valore (non sotto lo slider)", async () => {
    const user = userEvent.setup();
    renderScreen();
    await open(user, "Consumi e Carburante");
    setSlider(consumptionSlider(), 20);
    const restore = screen.getByRole("button", { name: "Ripristina" });
    expect(restore.parentElement).toBe(screen.getByTestId("consumption-pill").parentElement);
    expect(restore.compareDocumentPosition(consumptionSlider()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy(); // sopra lo slider
  });

  it("«Ripristina» appare solo se il valore è cambiato e riporta il consumo a 15", async () => {
    const user = userEvent.setup();
    renderScreen();
    await open(user, "Consumi e Carburante");
    expect(screen.queryByRole("button", { name: "Ripristina" })).not.toBeInTheDocument();
    setSlider(consumptionSlider(), 22);
    await user.click(screen.getByRole("button", { name: "Ripristina" }));
    expect(consumptionSlider()).toHaveValue("15");
    expect(screen.getByTestId("consumption-pill")).toHaveTextContent("15,0 km/L");
    expect(screen.queryByRole("button", { name: "Ripristina" })).not.toBeInTheDocument();
  });

  it("costo/km: senza nessun prezzo di riferimento noto mostra «—» (nessun dato inventato)", async () => {
    const user = userEvent.setup();
    renderScreen();
    await open(user, "Consumi e Carburante");
    expect(screen.getByTestId("cost-per-km")).toHaveTextContent("—");
    expect(screen.getByTestId("cost-per-km")).not.toHaveAttribute("title"); // niente tooltip senza derivazione
    expect(screen.getByText("nessun prezzo di riferimento noto")).toBeInTheDocument();
  });

  it("costo/km: con l'ultimo riferimento automatico noto è P_avg ÷ consumo, es. «~€0,12/km»", async () => {
    seed({ lastAutomaticReference: { benzina: 1.8 } });
    const user = userEvent.setup();
    renderScreen();
    await open(user, "Consumi e Carburante");
    expect(screen.getByTestId("cost-per-km")).toHaveTextContent("~€0,12/km"); // 1,80 ÷ 15
    // La derivazione non è una riga visibile: sta nel tooltip del valore.
    expect(screen.getByTestId("cost-per-km")).toHaveAttribute("title", "calcolato da €1,800/L (ultimo riferimento automatico Benzina) ÷ 15,0 km/L");
    expect(screen.queryByText(/ultimo riferimento automatico/)).not.toBeInTheDocument();
    expect(screen.queryByText("nessun prezzo di riferimento noto")).not.toBeInTheDocument(); // compare solo con «—»
  });

  it("costo/km è dinamico: segue il consumo scelto con lo slider", async () => {
    seed({ lastAutomaticReference: { benzina: 1.8 } });
    const user = userEvent.setup();
    renderScreen();
    await open(user, "Consumi e Carburante");
    setSlider(consumptionSlider(), 30);
    expect(screen.getByTestId("cost-per-km")).toHaveTextContent("~€0,06/km"); // 1,80 ÷ 30
    setSlider(consumptionSlider(), 8);
    expect(screen.getByTestId("cost-per-km")).toHaveTextContent("~€0,23/km"); // 1,80 ÷ 8 = 0,225
  });

  it("costo/km: se il riferimento è Manuale usa il prezzo manuale del carburante predefinito, non l'ultimo automatico", async () => {
    seed({ referenceMode: "manual", manualReference: { benzina: 2.25 }, lastAutomaticReference: { benzina: 1.8 } });
    const user = userEvent.setup();
    renderScreen();
    await open(user, "Consumi e Carburante");
    expect(screen.getByTestId("cost-per-km")).toHaveTextContent("~€0,15/km"); // 2,25 ÷ 15
    expect(screen.getByTestId("cost-per-km")).toHaveAttribute("title", "calcolato da €2,250/L (riferimento manuale Benzina) ÷ 15,0 km/L");
    expect(screen.queryByText(/riferimento manuale Benzina/)).not.toBeInTheDocument();
  });

  it("costo/km: cambiando il carburante predefinito usa il riferimento di quel carburante, «—» se non lo conosce", async () => {
    seed({ lastAutomaticReference: { benzina: 1.8, diesel: 1.5 } });
    const user = userEvent.setup();
    renderScreen();
    await openAll(user);
    await user.click(screen.getByRole("radio", { name: "Diesel" }));
    expect(screen.getByTestId("cost-per-km")).toHaveTextContent("~€0,10/km"); // 1,50 ÷ 15
    await user.click(screen.getByRole("radio", { name: "GPL" }));
    expect(screen.getByTestId("cost-per-km")).toHaveTextContent("—");
  });

  it("costo/km: passando a Manuale nella stessa schermata si aggiorna senza salvare (usa la bozza)", async () => {
    seed({ lastAutomaticReference: { benzina: 1.8 } });
    const user = userEvent.setup();
    renderScreen();
    await openAll(user);
    await user.click(screen.getByRole("radio", { name: /Manuale/ }));
    await type(user, "Benzina", "2,4");
    expect(screen.getByTestId("cost-per-km")).toHaveTextContent("~€0,16/km"); // 2,40 ÷ 15
  });
});

describe("SettingsScreen — valore del tuo tempo (preset nominati)", () => {
  const openAlgorithm = async (user: User) => open(user, "Algoritmo & Filtri");
  const presets = () => screen.getAllByRole("radio", { name: /Solo denaro|Tranquillo|Bilanciato|Ho fretta|Personalizzato/ }).map((r) => r.textContent);

  it("cinque chip nell'ordine: Solo denaro, Tranquillo, Bilanciato, Ho fretta, Personalizzato; di fabbrica «Bilanciato» (attivo bg-primary-strong text-on-primary)", async () => {
    const user = userEvent.setup();
    renderScreen();
    await openAlgorithm(user);
    expect(presets()).toEqual(["Solo denaro", "Tranquillo", "Bilanciato", "Ho fretta", "Personalizzato"]);
    const balanced = screen.getByRole("radio", { name: "Bilanciato" });
    expect(balanced).toBeChecked();
    expect(balanced).toHaveClass("bg-primary-strong", "text-on-primary");
    expect(screen.getByRole("radio", { name: "Ho fretta" })).not.toHaveClass("bg-primary-strong");
    expect(screen.getByTestId("vtime-summary")).toHaveTextContent("9 €/h · ≈ €0,15/min");
  });

  it("niente campo numerico come input primario: nessun input di testo «Valore del tuo tempo» e nessuno slider finché non scegli «Personalizzato»", async () => {
    const user = userEvent.setup();
    renderScreen();
    await openAlgorithm(user);
    expect(screen.queryByLabelText("Valore del tuo tempo", { selector: "input[type=text]" })).not.toBeInTheDocument();
    expect(screen.queryByRole("slider", { name: /Valore del tuo tempo/ })).not.toBeInTheDocument();
  });

  it("la caption spiega cosa vale un'ora del tuo tempo", async () => {
    const user = userEvent.setup();
    renderScreen();
    await openAlgorithm(user);
    expect(
      screen.getByText("Quanto vale un'ora del tuo tempo? TappaFurba sottrae al risparmio il tempo perso in deviazione, a questo valore."),
    ).toBeInTheDocument();
  });

  it.each([
    ["Solo denaro", 0, "0 €/h"],
    ["Tranquillo", 0.1, "6 €/h · ≈ €0,10/min"],
    ["Bilanciato", 0.15, "9 €/h · ≈ €0,15/min"],
    ["Ho fretta", 0.25, "15 €/h · ≈ €0,25/min"],
  ])("«%s» si salva sempre in €/min (preset ÷ 60): %s", async (label, perMinute, summary) => {
    const user = userEvent.setup();
    seed({ valueOfTimePerMinute: label === "Bilanciato" ? 0.25 : 0.15 }); // parte da un altro preset, così il salvataggio è una modifica
    renderScreen();
    await openAlgorithm(user);
    await user.click(screen.getByRole("radio", { name: label }));
    expect(screen.getByRole("radio", { name: label })).toBeChecked();
    expect(screen.getByTestId("vtime-summary")).toHaveTextContent(summary);
    await user.click(saveButton());
    expect(saved().valueOfTimePerMinute).toBe(perMinute);
  });

  it("«Solo denaro» = 0 €/h: il tempo non entra nel risparmio netto, e lo dice", async () => {
    const user = userEvent.setup();
    renderScreen();
    await openAlgorithm(user);
    await user.click(screen.getByRole("radio", { name: "Solo denaro" }));
    expect(screen.getByTestId("vtime-summary")).toHaveTextContent("il tempo non entra nel risparmio netto");
    expect(saveButton()).toBeEnabled(); // 0 è valido (range 0,00–1,00 €/min)
  });

  it("«Personalizzato» rivela lo slider 3–60 €/h (passo 1), visibile solo se selezionato", async () => {
    const user = userEvent.setup();
    renderScreen();
    await openAlgorithm(user);
    await user.click(screen.getByRole("radio", { name: "Personalizzato" }));
    expect(screen.getByRole("radio", { name: "Personalizzato" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Personalizzato" })).toHaveClass("bg-primary-strong", "text-on-primary");
    expect(screen.getByRole("radio", { name: "Bilanciato" })).not.toBeChecked();
    const slider = timeSlider();
    expect(slider).toHaveAttribute("min", "3");
    expect(slider).toHaveAttribute("max", "60");
    expect(slider).toHaveAttribute("step", "1");
    expect(slider).toHaveValue("9"); // parte dal valore corrente (Bilanciato)

    await user.click(screen.getByRole("radio", { name: "Tranquillo" })); // un preset lo nasconde
    expect(screen.queryByRole("slider", { name: /Valore del tuo tempo/ })).not.toBeInTheDocument();
  });

  it("muovere lo slider cambia il valore e si salva in €/min (€/h ÷ 60), senza uscire da «Personalizzato»", async () => {
    const user = userEvent.setup();
    renderScreen();
    await openAlgorithm(user);
    await user.click(screen.getByRole("radio", { name: "Personalizzato" }));
    setSlider(timeSlider(), 12);
    expect(screen.getByTestId("vtime-summary")).toHaveTextContent("12 €/h · ≈ €0,20/min");
    expect(screen.getByRole("radio", { name: "Personalizzato" })).toBeChecked();

    setSlider(timeSlider(), 60);
    expect(screen.getByTestId("vtime-summary")).toHaveTextContent("60 €/h · ≈ €1,00/min");
    setSlider(timeSlider(), 3);
    expect(screen.getByTestId("vtime-summary")).toHaveTextContent("3 €/h · ≈ €0,05/min");
    setSlider(timeSlider(), 30);
    await user.click(saveButton());
    expect(saved().valueOfTimePerMinute).toBe(0.5);
  });

  it("anche un valore dello slider uguale a un preset (9 €/h) resta «Personalizzato» finché non scegli il chip", async () => {
    const user = userEvent.setup();
    renderScreen();
    await openAlgorithm(user);
    await user.click(screen.getByRole("radio", { name: "Personalizzato" }));
    setSlider(timeSlider(), 9);
    expect(screen.getByRole("radio", { name: "Personalizzato" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Bilanciato" })).not.toBeChecked();
  });

  it("da «Solo denaro» (0) lo slider parte dal suo minimo, 3 €/h, perché 0 è fuori dal suo intervallo", async () => {
    const user = userEvent.setup();
    renderScreen();
    await openAlgorithm(user);
    await user.click(screen.getByRole("radio", { name: "Solo denaro" }));
    await user.click(screen.getByRole("radio", { name: "Personalizzato" }));
    expect(timeSlider()).toHaveValue("3");
    expect(screen.getByTestId("vtime-summary")).toHaveTextContent("3 €/h · ≈ €0,05/min");
  });

  it("un valore salvato che non è un preset (0,30 €/min = 18 €/h) si riapre su «Personalizzato» con lo slider a 18", async () => {
    seed({ valueOfTimePerMinute: 0.3 });
    const user = userEvent.setup();
    renderScreen();
    await openAlgorithm(user);
    expect(screen.getByRole("radio", { name: "Personalizzato" })).toBeChecked();
    expect(timeSlider()).toHaveValue("18");
    expect(screen.getByTestId("vtime-summary")).toHaveTextContent("18 €/h · ≈ €0,30/min");
  });

  it("un valore salvato uguale a un preset si riapre su quel chip (es. 0,25 → «Ho fretta»)", async () => {
    seed({ valueOfTimePerMinute: 0.25 });
    const user = userEvent.setup();
    renderScreen();
    await openAlgorithm(user);
    expect(screen.getByRole("radio", { name: "Ho fretta" })).toBeChecked();
    expect(screen.queryByRole("slider", { name: /Valore del tuo tempo/ })).not.toBeInTheDocument();
  });

  it("slider e preset non producono mai un valore fuori da 0,00–1,00 €/min", async () => {
    const user = userEvent.setup();
    renderScreen();
    await openAlgorithm(user);
    await user.click(screen.getByRole("radio", { name: "Personalizzato" }));
    for (const hour of [3, 17, 33, 60]) {
      setSlider(timeSlider(), hour);
      await user.click(saveButton());
      const value = saved().valueOfTimePerMinute;
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
      expect(value).toBeCloseTo(hour / 60, 4);
    }
  });
});

describe("SettingsScreen — algoritmo e filtri", () => {
  it("tre toggle di percorso e il default «Solo Self»: si salvano", async () => {
    const user = userEvent.setup();
    renderScreen();
    await open(user, "Algoritmo & Filtri");
    for (const name of ["Evita autostrada", "Evita pedaggi", "Evita traghetti"]) {
      const toggle = screen.getByRole("switch", { name });
      expect(toggle, name).toHaveAttribute("aria-checked", "false");
      await user.click(toggle);
      expect(toggle, name).toHaveAttribute("aria-checked", "true");
    }
    await user.click(screen.getByRole("switch", { name: "Cerca solo stazioni Self per impostazione predefinita" }));
    await user.click(saveButton());

    const s = saved();
    expect(s.avoidMotorway).toBe(true);
    expect(s.avoidTolls).toBe(true);
    expect(s.avoidFerries).toBe(true);
    expect(s.onlySelf).toBe(false);
  });

  it("dichiara che il costo del pedaggio non è incluso nel risparmio calcolato", async () => {
    const user = userEvent.setup();
    renderScreen();
    await open(user, "Algoritmo & Filtri");
    expect(screen.getAllByText(/non è incluso nel risparmio calcolato/).length).toBeGreaterThan(0);
  });

  it("i testi dei tre percorsi e di «Solo Self» sono quelli concordati, alla lettera (effetto → valore iniziale e come cambiarlo → esclusioni)", async () => {
    const user = userEvent.setup();
    renderScreen();
    await open(user, "Algoritmo & Filtri");
    expect(
      screen.getByText(
        "Il percorso consigliato e il calcolo delle deviazioni evitano le autostrade. Vale come valore iniziale dello switch «Evita autostrada» nella ricerca: puoi cambiarlo per ogni viaggio.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Il percorso consigliato evita le strade a pedaggio. Vale come valore iniziale delle «Opzioni percorso» nei Risultati: puoi cambiarlo per ogni ricerca. Il costo del pedaggio non è incluso nel risparmio calcolato.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Il percorso consigliato evita i traghetti. Vale come valore iniziale delle «Opzioni percorso» nei Risultati: puoi cambiarlo per ogni ricerca."),
    ).toBeInTheDocument();
    expect(screen.getByText("Le nuove ricerche mostrano solo stazioni con Self. Puoi cambiarlo per ogni ricerca con lo switch «Solo Self».")).toBeInTheDocument();
  });

  it("«Automatico» spiega il prezzo di riferimento senza gergo («prezzo tipico», «stazioni vicine al percorso»)", async () => {
    const user = userEvent.setup();
    renderScreen();
    await open(user, "Algoritmo & Filtri");
    expect(
      screen.getByText(
        "Si calcola a ogni ricerca: il prezzo tipico delle stazioni sul percorso; se sono poche, quello delle stazioni vicine al percorso; se ancora poche, quello nazionale.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/mediana|corridoio/i)).not.toBeInTheDocument();
  });

  it("nessuna descrizione di Impostazioni dice «Precompila» e le due che lo dicevano seguono la stessa regola", async () => {
    const user = userEvent.setup();
    renderScreen();
    await open(user, "Profilo Veicolo");
    await open(user, "Algoritmo & Filtri");
    expect(screen.getByText("Vale come valore iniziale di «Litri» nella ricerca.")).toBeInTheDocument();
    expect(screen.getByText(/Vale come valore iniziale dello slider della ricerca: puoi cambiarlo per ogni ricerca\./)).toBeInTheDocument();
    expect(screen.queryByText(/Precompila/)).not.toBeInTheDocument();
  });

  it("«Deviazione massima predefinita»: slider 1–10 km (passo 1), di fabbrica 5, si salva e precompila la ricerca", async () => {
    const user = userEvent.setup();
    renderScreen();
    await open(user, "Algoritmo & Filtri");
    const slider = detourSlider();
    expect(slider).toHaveAttribute("min", "1");
    expect(slider).toHaveAttribute("max", "10");
    expect(slider).toHaveAttribute("step", "1");
    expect(slider).toHaveValue("5");
    expect(screen.getByTestId("default-detour-pill")).toHaveTextContent("5 km");

    setSlider(detourSlider(), 8);
    expect(screen.getByTestId("default-detour-pill")).toHaveTextContent("8 km");
    await user.click(saveButton());
    expect(saved().defaultMaxDetourKm).toBe(8);
    expect(JSON.parse(localStorage.getItem(SETTINGS_KEY)!).settings.defaultMaxDetourKm).toBe(8);
  });

  it("«Deviazione massima predefinita»: agli estremi 1 e 10 km", async () => {
    const user = userEvent.setup();
    renderScreen();
    await open(user, "Algoritmo & Filtri");
    for (const km of [1, 10]) {
      setSlider(detourSlider(), km);
      expect(screen.getByTestId("default-detour-pill")).toHaveTextContent(`${km} km`);
      await user.click(saveButton());
      expect(saved().defaultMaxDetourKm).toBe(km);
    }
  });

  it("«Solo Self» predefinito è ON di fabbrica e spegnerlo si salva", async () => {
    const user = userEvent.setup();
    renderScreen();
    await open(user, "Algoritmo & Filtri");
    const toggle = screen.getByRole("switch", { name: "Cerca solo stazioni Self per impostazione predefinita" });
    expect(toggle).toHaveAttribute("aria-checked", "true");
    await user.click(toggle);
    await user.click(saveButton());
    expect(saved().onlySelf).toBe(false);
  });

  it("Prezzo di riferimento: Automatico di default, nessun campo manuale", async () => {
    const user = userEvent.setup();
    renderScreen();
    await open(user, "Algoritmo & Filtri");
    expect(screen.getByRole("radio", { name: /Automatico/ })).toBeChecked();
    expect(screen.queryByLabelText("Benzina", { selector: "input" })).not.toBeInTheDocument();
  });

  it("passando a Manuale i campi per carburante si pre-compilano con l'ultimo prezzo automatico noto", async () => {
    seed({ lastAutomaticReference: { benzina: 1.8543, diesel: 1.91 } });
    const user = userEvent.setup();
    renderScreen();
    await open(user, "Algoritmo & Filtri");
    await user.click(screen.getByRole("radio", { name: /Manuale/ }));

    expect(field("Benzina")).toHaveValue("1,854");
    expect(field("Diesel")).toHaveValue("1,91");
    expect(field("GPL")).toHaveValue(""); // mai cercato: vuoto (usa il calcolo automatico)
    expect(field("Metano")).toHaveValue("");
    expect(screen.getByText(/Sostituisce completamente il calcolo automatico/)).toBeInTheDocument();
  });

  it("il valore manuale si salva per carburante e sostituisce il riferimento finché non si torna ad Automatico", async () => {
    seed({ lastAutomaticReference: { benzina: 1.85 } });
    const user = userEvent.setup();
    renderScreen();
    await open(user, "Algoritmo & Filtri");
    await user.click(screen.getByRole("radio", { name: /Manuale/ }));
    await type(user, "Benzina", "1,99");
    await type(user, "GPL", "0,78");
    await user.click(saveButton());

    let s = saved();
    expect(s.referenceMode).toBe("manual");
    expect(s.manualReference).toEqual({ benzina: 1.99, gpl: 0.78 });
    expect(referenceOverrideFor(s, "benzina")).toBe(1.99);
    expect(referenceOverrideFor(s, "gpl")).toBe(0.78);
    expect(referenceOverrideFor(s, "diesel")).toBeUndefined(); // vuoto: automatico per quel carburante

    // Tornando ad Automatico i valori manuali restano memorizzati ma non contano più.
    await user.click(screen.getByRole("radio", { name: /Automatico/ }));
    await user.click(saveButton());
    s = saved();
    expect(s.referenceMode).toBe("auto");
    expect(s.manualReference).toEqual({ benzina: 1.99, gpl: 0.78 });
    expect(referenceOverrideFor(s, "benzina")).toBeUndefined();

    // E riattivando Manuale ritrovano i propri valori (non vengono sovrascritti dalla pre-compilazione).
    await user.click(screen.getByRole("radio", { name: /Manuale/ }));
    expect(field("Benzina")).toHaveValue("1,99");
  });

  it("prezzo manuale fuori intervallo (0,5–4 €/L): errore e blocco; tornare ad Automatico sblocca", async () => {
    const user = userEvent.setup();
    renderScreen();
    await open(user, "Algoritmo & Filtri");
    await user.click(screen.getByRole("radio", { name: /Manuale/ }));
    await type(user, "Benzina", "0,3");
    expect(screen.getByRole("alert")).toHaveTextContent("tra 0,5 e 4 €/L");
    expect(saveButton()).toBeDisabled();

    await user.click(screen.getByRole("radio", { name: /Automatico/ }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: /Manuale/ }));
    await type(user, "Benzina", "1,8");
    expect(saveButton()).toBeEnabled();
  });
});

describe("SettingsScreen — attribuzione dei loghi", () => {
  it("in «Notifiche & Dati di Sistema» c'è la riga: «Loghi: marchi dei rispettivi titolari, forniti dall'Osservaprezzi Carburanti del MIMIT.»", async () => {
    const user = userEvent.setup();
    renderScreen();
    await open(user, "Notifiche & Dati di Sistema");
    const note = screen.getByTestId("brand-attribution");
    expect(note).toHaveTextContent("Loghi: marchi dei rispettivi titolari, forniti dall'Osservaprezzi Carburanti del MIMIT.");
    expect(note).toBeVisible();
    expect(note).toHaveClass("text-on-surface-variant"); // testo piccolo: colore scuro per il contrasto
    // sta dentro la sezione, dopo la nota sulla fonte dei prezzi
    expect(screen.getByRole("region", { name: "Notifiche & Dati di Sistema" })).toContainElement(note);
    expect(screen.getByText(/Fonte dei prezzi: MIMIT Osservaprezzi/).compareDocumentPosition(note) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe("SettingsScreen — notifiche e dati di sistema", () => {
  it("soglia di freschezza: default 72 ore, intero tra 1 e 720", async () => {
    const user = userEvent.setup();
    renderScreen();
    await open(user, "Notifiche & Dati di Sistema");
    for (const bad of ["0", "721", "3,5", "x", ""]) {
      await type(user, "Soglia di freschezza prezzi", bad);
      expect(screen.getByRole("alert")).toHaveTextContent("numero intero tra 1 e 720");
      expect(saveButton()).toBeDisabled();
    }
    await type(user, "Soglia di freschezza prezzi", "24");
    await user.click(saveButton());
    expect(saved().maxPriceAgeHours).toBe(24);
  });

  it("la soglia di freschezza spiega l'effetto in italiano semplice: «non aggiornati» (comunicati o confermati dalla fonte), senza «comunicati da più di»", async () => {
    const user = userEvent.setup();
    renderScreen();
    await open(user, "Notifiche & Dati di Sistema");
    expect(screen.getByText("I prezzi non aggiornati da più di questo tempo non compaiono nei risultati (default 72 ore).")).toBeInTheDocument();
    expect(screen.queryByText(/comunicati da più di/)).not.toBeInTheDocument();
  });

  it("dichiara la fonte dei prezzi e che le notifiche non ci sono (nessuna funzione inventata)", async () => {
    const user = userEvent.setup();
    renderScreen();
    await open(user, "Notifiche & Dati di Sistema");
    expect(screen.getByText(/MIMIT Osservaprezzi/)).toBeInTheDocument();
    expect(screen.getByText(/Le notifiche non sono disponibili in questa versione/)).toBeInTheDocument();
  });
});

describe("SettingsScreen — Ripristina Predefiniti", () => {
  it("riporta tutti i campi ai valori di fabbrica, incluso Automatico, «Bilanciato» e «Solo Self» ON, e lo salva", async () => {
    saveSettings({
      vehicle: { bodyType: "suv", modelName: "Golf", tankLiters: 60, defaultFuel: "gpl" },
      consumptionKmPerLiter: 20,
      consumptionUnit: "l100km",
      valueOfTimePerMinute: 0.5,
      referenceMode: "manual",
      manualReference: { benzina: 1.9, gpl: 0.8 },
      lastAutomaticReference: { benzina: 1.85 },
      avoidMotorway: true,
      avoidTolls: true,
      avoidFerries: true,
      onlySelf: false,
      defaultMaxDetourKm: 8,
      maxPriceAgeHours: 24,
    });
    const user = userEvent.setup();
    renderScreen();
    await openAll(user);
    expect(screen.getByRole("radio", { name: /Manuale/ })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Personalizzato" })).toBeChecked(); // 0,50 €/min = 30 €/h
    expect(timeSlider()).toHaveValue("30");

    await user.click(restoreButton());

    expect(screen.getByRole("radio", { name: "Berlina" })).toBeChecked();
    expect(screen.getByLabelText("Modello")).toHaveValue("");
    expect(within(screen.getByRole("group", { name: "Capacità serbatoio" })).getByText("45 L")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Benzina" })).toBeChecked();
    expect(consumptionSlider()).toHaveValue("15");
    expect(detourSlider()).toHaveValue("5");
    expect(screen.getByRole("radio", { name: "Bilanciato" })).toBeChecked();
    expect(screen.queryByRole("slider", { name: /Valore del tuo tempo/ })).not.toBeInTheDocument(); // «Personalizzato» chiuso
    expect(screen.getByRole("radio", { name: /Automatico/ })).toBeChecked();
    expect(screen.queryByLabelText("Diesel", { selector: "input" })).not.toBeInTheDocument(); // campi manuali nascosti
    expect(screen.getByRole("switch", { name: "Evita autostrada" })).toHaveAttribute("aria-checked", "false");
    expect(screen.getByRole("switch", { name: "Evita pedaggi" })).toHaveAttribute("aria-checked", "false");
    expect(screen.getByRole("switch", { name: "Evita traghetti" })).toHaveAttribute("aria-checked", "false");
    expect(screen.getByRole("switch", { name: "Cerca solo stazioni Self per impostazione predefinita" })).toHaveAttribute("aria-checked", "true");
    expect(field("Soglia di freschezza prezzi")).toHaveValue("72");
    expect(screen.getByText("Valori di fabbrica ripristinati")).toBeInTheDocument();

    const s = saved();
    expect(s.referenceMode).toBe("auto");
    expect(s.manualReference).toEqual({});
    expect(s.valueOfTimePerMinute).toBe(0.15);
    expect({ ...s, lastAutomaticReference: {} }).toEqual(FACTORY_SETTINGS);
    expect(s.lastAutomaticReference).toEqual({ benzina: 1.85 }); // la cache non è una preferenza
    expect(referenceOverrideFor(s, "benzina")).toBeUndefined();
  });

  it("scarta anche le modifiche non salvate", async () => {
    const user = userEvent.setup();
    renderScreen();
    await open(user, "Profilo Veicolo");
    await user.click(screen.getByRole("radio", { name: "Moto" }));
    await user.click(restoreButton());
    expect(screen.getByRole("radio", { name: "Berlina" })).toBeChecked();
    expect(saveButton()).toBeDisabled();
  });

  it("ripristina anche i campi con testo non valido e sblocca il salvataggio", async () => {
    const user = userEvent.setup();
    renderScreen();
    await open(user, "Notifiche & Dati di Sistema");
    await type(user, "Soglia di freschezza prezzi", "zzz");
    expect(saveButton()).toBeDisabled();
    await user.click(restoreButton());
    expect(field("Soglia di freschezza prezzi")).toHaveValue("72");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("SettingsScreen — unità del consumo (km/L ↔ L/100 km, solo display)", () => {
  const unitRadio = (name: string) => screen.getByRole("radio", { name });

  it("l'unità è un selettore nell'accordion «Consumi e Carburante»; di fabbrica è km/L e la pill ha sempre l'etichetta dell'unità", async () => {
    const user = userEvent.setup();
    renderScreen();
    await open(user, "Consumi e Carburante");
    expect(screen.getByRole("radiogroup", { name: "Unità del consumo" })).toBeInTheDocument();
    expect(unitRadio("km/L")).toBeChecked();
    expect(unitRadio("L/100 km")).not.toBeChecked();
    expect(screen.getByTestId("consumption-pill")).toHaveTextContent("15,0 km/L");
  });

  it("in L/100 km: pill «6,7 L/100 km», slider 2,5–33,3 a passo 0,1 e tacche «12,5 Sport · 6,7 Medio · 3,3 Eco»", async () => {
    const user = userEvent.setup();
    renderScreen();
    await open(user, "Consumi e Carburante");
    await user.click(unitRadio("L/100 km"));
    expect(screen.getByTestId("consumption-pill")).toHaveTextContent("6,7 L/100 km");
    const slider = consumptionSlider();
    expect(slider).toHaveAttribute("min", "2.5");
    expect(slider).toHaveAttribute("max", "33.3");
    expect(slider).toHaveAttribute("step", "0.1");
    expect(slider).toHaveValue("6.7");
    const marks = screen.getByText("12,5 Sport").parentElement!;
    expect([...marks.children].map((c) => c.textContent)).toEqual(["12,5 Sport", "6,7 Medio", "3,3 Eco"]);
  });

  it("cambiare unità non cambia il valore (15 km/L resta 15 km/L): torna «15,0 km/L» e lo slider a 15", async () => {
    const user = userEvent.setup();
    renderScreen();
    await open(user, "Consumi e Carburante");
    await user.click(unitRadio("L/100 km"));
    await user.click(unitRadio("km/L"));
    expect(screen.getByTestId("consumption-pill")).toHaveTextContent("15,0 km/L");
    expect(consumptionSlider()).toHaveValue("15");
    expect(screen.queryByRole("button", { name: "Ripristina" })).not.toBeInTheDocument();
  });

  it("muovere lo slider in L/100 km converte al change e salva km/L (5 L/100 km → 20 km/L), l'unità resta «l100km»", async () => {
    const user = userEvent.setup();
    renderScreen();
    await open(user, "Consumi e Carburante");
    await user.click(unitRadio("L/100 km"));
    setSlider(consumptionSlider(), 5);
    expect(screen.getByTestId("consumption-pill")).toHaveTextContent("5,0 L/100 km");
    await user.click(saveButton());
    expect(saved().consumptionKmPerLiter).toBe(20);
    expect(saved().consumptionUnit).toBe("l100km");
    const stored = JSON.parse(localStorage.getItem(SETTINGS_KEY)!).settings;
    expect(stored.consumptionKmPerLiter).toBe(20); // il modello salvato è km/L, mai L/100 km
  });

  it("gli estremi dello slider in L/100 km salvano 40 e 3 km/L (dentro la validazione 3–40)", async () => {
    const user = userEvent.setup();
    renderScreen();
    await open(user, "Consumi e Carburante");
    await user.click(unitRadio("L/100 km"));
    setSlider(consumptionSlider(), 2.5);
    await user.click(saveButton());
    expect(saved().consumptionKmPerLiter).toBe(40);
    setSlider(consumptionSlider(), 33.3);
    await user.click(saveButton());
    expect(saved().consumptionKmPerLiter).toBe(3);
  });

  it("l'unità scelta si salva e alla riapertura della schermata è ancora quella", async () => {
    const user = userEvent.setup();
    const first = renderScreen();
    await open(user, "Consumi e Carburante");
    await user.click(unitRadio("L/100 km"));
    expect(saveButton()).toBeEnabled();
    await user.click(saveButton());
    first.unmount();
    renderScreen();
    await open(user, "Consumi e Carburante");
    expect(unitRadio("L/100 km")).toBeChecked();
    expect(screen.getByTestId("consumption-pill")).toHaveTextContent("6,7 L/100 km");
  });

  it("«Ripristina Predefiniti» riporta l'unità a km/L e il consumo a 15", async () => {
    seed({ consumptionUnit: "l100km", consumptionKmPerLiter: 20 });
    const user = userEvent.setup();
    renderScreen();
    await open(user, "Consumi e Carburante");
    expect(screen.getByTestId("consumption-pill")).toHaveTextContent("5,0 L/100 km");
    await user.click(restoreButton());
    await open(user, "Consumi e Carburante");
    expect(unitRadio("km/L")).toBeChecked();
    expect(screen.getByTestId("consumption-pill")).toHaveTextContent("15,0 km/L");
    expect(saved().consumptionUnit).toBe("kmpl");
  });

  it("il tooltip del costo/km usa l'unità scelta (la formula non cambia)", async () => {
    seed({ lastAutomaticReference: { benzina: 1.8 } });
    const user = userEvent.setup();
    renderScreen();
    await open(user, "Consumi e Carburante");
    await user.click(unitRadio("L/100 km"));
    expect(screen.getByTestId("cost-per-km")).toHaveTextContent("~€0,12/km"); // 1,80 ÷ 15, identico a prima
    expect(screen.getByTestId("cost-per-km")).toHaveAttribute("title", "calcolato da €1,800/L (ultimo riferimento automatico Benzina) × 6,7 L/100 km ÷ 100");
  });
});

describe("SettingsScreen — cronologia dei tragitti (Tragitti frequenti)", () => {
  const place = (text: string) => ({ text });

  it("senza tragitti dice che non c'è nulla e «Cancella cronologia» è disattivato", async () => {
    const user = userEvent.setup();
    renderScreen();
    await open(user, "Notifiche & Dati di Sistema");
    expect(screen.getByTestId("recent-routes-count")).toHaveTextContent("Nessun tragitto salvato");
    expect(screen.getByRole("button", { name: "Cancella cronologia" })).toBeDisabled();
  });

  it("con tragitti salvati li conta e «Cancella cronologia» li elimina subito (senza passare da «Salva Preferenze»)", async () => {
    recordRecentRoute({ origin: place("A"), destination: place("B"), fuelType: "benzina" });
    recordRecentRoute({ origin: place("C"), destination: place("D"), fuelType: "diesel" });
    const user = userEvent.setup();
    renderScreen();
    await open(user, "Notifiche & Dati di Sistema");
    expect(screen.getByTestId("recent-routes-count")).toHaveTextContent("2 tragitti salvati");
    expect(saveButton()).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Cancella cronologia" }));
    expect(loadRecentRoutes()).toEqual([]);
    expect(screen.getByTestId("recent-routes-count")).toHaveTextContent("Nessun tragitto salvato");
    expect(screen.getByRole("status")).toHaveTextContent("Cronologia dei tragitti cancellata");
    expect(saveButton()).toBeDisabled(); // non è una preferenza
  });
});

describe("SettingsScreen — ogni campo persistito abilita «Salva Preferenze»", () => {
  type Case = (user: User) => Promise<unknown>;
  const toggle = (name: string): Case => async (user) => user.click(screen.getByRole("switch", { name }));
  const CASES: Record<Exclude<keyof Settings, "lastAutomaticReference">, { seed?: Partial<Settings>; act: Case }> = {
    vehicle: { act: async (user) => user.click(screen.getByRole("radio", { name: "SUV" })) },
    consumptionKmPerLiter: { act: async () => setSlider(consumptionSlider(), 20) },
    consumptionUnit: { act: async (user) => user.click(screen.getByRole("radio", { name: "L/100 km" })) },
    valueOfTimePerMinute: { act: async (user) => user.click(screen.getByRole("radio", { name: "Tranquillo" })) },
    referenceMode: { act: async (user) => user.click(screen.getByRole("radio", { name: /Manuale/ })) },
    manualReference: { seed: { referenceMode: "manual" }, act: async (user) => type(user, "Benzina", "1,95") },
    avoidMotorway: { act: toggle("Evita autostrada") },
    avoidTolls: { act: toggle("Evita pedaggi") },
    avoidFerries: { act: toggle("Evita traghetti") },
    onlySelf: { act: toggle("Cerca solo stazioni Self per impostazione predefinita") },
    defaultMaxDetourKm: { act: async () => setSlider(detourSlider(), 8) },
    maxPriceAgeHours: { act: async (user) => type(user, "Soglia di freschezza prezzi", "24") },
  };

  it("la tabella copre TUTTI i campi di FACTORY_SETTINGS (un campo nuovo senza caso fa fallire questo test)", () => {
    const persisted = Object.keys(FACTORY_SETTINGS).filter((key) => key !== "lastAutomaticReference");
    expect(Object.keys(CASES).sort()).toEqual(persisted.sort());
  });

  it.each(Object.keys(CASES) as Array<keyof typeof CASES>)("%s: modificarlo abilita il salvataggio e lo scrive", async (key) => {
    const { seed: seedPatch, act } = CASES[key];
    if (seedPatch) seed(seedPatch);
    const user = userEvent.setup();
    renderScreen();
    await openAll(user);
    expect(saveButton()).toBeDisabled();
    await act(user);
    expect(saveButton()).toBeEnabled();
    await user.click(saveButton());
    const before = { ...FACTORY_SETTINGS, ...seedPatch }[key];
    expect(JSON.stringify(saved()[key])).not.toBe(JSON.stringify(before)); // il valore scritto è cambiato
  });
});

describe("SettingsScreen — robustezza", () => {
  it("con localStorage danneggiato parte dai valori di fabbrica", async () => {
    localStorage.setItem(SETTINGS_KEY, "{rotto");
    const user = userEvent.setup();
    renderScreen();
    await openAll(user);
    expect(screen.getByRole("radio", { name: "Berlina" })).toBeChecked();
    expect(consumptionSlider()).toHaveValue("15");
    expect(screen.getByRole("radio", { name: "Bilanciato" })).toBeChecked();
  });

  it("un salvataggio precedente senza i campi nuovi (pedaggi, traghetti, Solo Self) si legge senza errori, con i default", async () => {
    localStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify({ version: 1, settings: { vehicle: { bodyType: "suv", modelName: "", tankLiters: 60, defaultFuel: "diesel" }, avoidMotorway: true } }),
    );
    const user = userEvent.setup();
    renderScreen();
    await openAll(user);
    expect(screen.getByRole("radio", { name: "SUV" })).toBeChecked();
    expect(screen.getByRole("switch", { name: "Evita autostrada" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("switch", { name: "Evita pedaggi" })).toHaveAttribute("aria-checked", "false");
    expect(screen.getByRole("switch", { name: "Cerca solo stazioni Self per impostazione predefinita" })).toHaveAttribute("aria-checked", "true");
  });
});

describe("SettingsScreen — layout desktop", () => {
  const sectionButtons = () => SECTIONS.map((name) => screen.getByRole("button", { name }));

  it("su mobile le quattro sezioni sono chiuse al caricamento, in colonna singola", () => {
    setViewportWidth(390);
    renderScreen();
    for (const button of sectionButtons()) expect(button).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByTestId("settings-grid")).toHaveClass("grid-cols-1");
  });

  it("anche da 1024 px (1280, 1920) le quattro sezioni sono chiuse al caricamento", () => {
    for (const width of [1024, 1280, 1920]) {
      setViewportWidth(width);
      renderScreen();
      for (const button of sectionButtons()) expect(button).toHaveAttribute("aria-expanded", "false");
      cleanup();
    }
  });

  it("tra 768 e 1023 px la griglia è 2×2 e le sezioni sono chiuse", () => {
    setViewportWidth(900);
    renderScreen();
    for (const button of sectionButtons()) expect(button).toHaveAttribute("aria-expanded", "false");
  });

  it("contenitore max-w-3xl (xl 5xl, 2xl 6xl) con le quattro sezioni in griglia md:grid-cols-2 (2×2), allineate in alto, e «Tema Mappa» a tutta riga", () => {
    setViewportWidth(1280);
    renderScreen();
    const grid = screen.getByTestId("settings-grid");
    expect(grid).toHaveClass("grid", "md:grid-cols-2", "items-start");
    expect(grid.children).toHaveLength(5);
    expect(grid.children[4]).toHaveClass("md:col-span-2");
    expect(within(grid.children[4] as HTMLElement).getByRole("button", { name: "Tema Mappa" })).toBeInTheDocument();
    expect(screen.getByRole("main")).toHaveClass("md:max-w-3xl", "xl:max-w-5xl", "2xl:max-w-6xl", "mx-auto");
  });

  it("i campi restano quelli di sempre: niente soglia risparmio minimo, frequenza sync MIMIT o avvisi alla guida; deviazione solo in km (1–10)", async () => {
    setViewportWidth(1280);
    renderScreen();
    await openAll(userEvent.setup());
    expect(screen.queryByText(/soglia risparmio minimo/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/frequenza sincronizzazione|sync(ronizzazione)? MIMIT/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/avvisi (variazioni )?(durante|alla) (la )?guida/i)).not.toBeInTheDocument();
    const slider = screen.getByRole("slider", { name: /deviazione/i });
    expect(slider).toHaveAttribute("min", "1");
    expect(slider).toHaveAttribute("max", "10");
    expect(screen.getByTestId("default-detour-pill")).toHaveTextContent(/km$/);
    expect(screen.getByTestId("default-detour-pill").textContent).not.toMatch(/min/);
  });

  it("tacche del consumo: «8 Sport», «15 Medio», «30 Eco»", async () => {
    setViewportWidth(1280);
    renderScreen();
    await openAll(userEvent.setup());
    const slider = screen.getByRole("slider", { name: /consumo/i });
    const marks = slider.parentElement!.lastElementChild as HTMLElement;
    expect([...marks.children].map((el) => el.textContent?.replace(/s+/g, " ").trim())).toEqual(["8 Sport", "15 Medio", "30 Eco"]);
  });

  it("«Salva Preferenze» e «Ripristina Predefiniti» stanno su una riga centrata e fissa sopra la barra di navigazione (da lg), senza card", () => {
    setViewportWidth(1280);
    renderScreen();
    const bar = screen.getByTestId("save-bar");
    expect(bar).toHaveClass("lg:fixed", "lg:inset-x-0", "lg:bottom-24", "lg:bg-transparent", "lg:border-0", "lg:shadow-none");
    const row = within(bar).getByRole("button", { name: "Salva Preferenze" }).parentElement!;
    expect(row).toHaveClass("lg:flex-row", "lg:justify-center");
    expect(within(row).getByRole("button", { name: "Ripristina Predefiniti" })).toBeInTheDocument();
    expect(screen.getByRole("main")).toHaveClass("lg:pb-44"); // spazio perché la barra non copra i campi in fondo
  });

  it("la barra continua a funzionare: modificare abilita «Salva Preferenze», salvare dà l'avviso", async () => {
    setViewportWidth(1280);
    const user = userEvent.setup();
    renderScreen();
    await openAll(user);
    const save = screen.getByRole("button", { name: "Salva Preferenze" });
    expect(save).toBeDisabled();
    await user.click(screen.getByRole("radio", { name: "Diesel" }));
    expect(save).toBeEnabled();
    expect(within(screen.getByTestId("save-bar")).getByRole("status")).toHaveTextContent("Modifiche non salvate");
    await user.click(save);
    expect(within(screen.getByTestId("save-bar")).getByRole("status")).toHaveTextContent("Preferenze salvate");
  });
});

describe("SettingsScreen — Tema Mappa", () => {
  const radio = (name: string) => screen.getByRole("radio", { name: `Seleziona stile mappa ${name}` }) as HTMLInputElement;
  const events: MapStyleChangedDetail[] = [];
  const onChanged = (event: Event) => events.push((event as CustomEvent<MapStyleChangedDetail>).detail);
  beforeEach(() => {
    events.length = 0;
    window.addEventListener(MAP_STYLE_CHANGED_EVENT, onChanged);
  });
  afterEach(() => window.removeEventListener(MAP_STYLE_CHANGED_EVENT, onChanged));
  const openMap = async (user: User) => open(user, "Tema Mappa");

  it("è la quinta sezione, dopo «Notifiche & Dati di Sistema», chiusa al caricamento; aperta mostra il sotto-titolo e le quattro card", async () => {
    renderScreen();
    const buttons = screen.getAllByRole("button", { expanded: false }).map((b) => b.textContent);
    expect(buttons).toEqual([...SECTIONS, "Tema Mappa"]);
    expect(screen.getByRole("button", { name: "Tema Mappa" })).toHaveAttribute("aria-expanded", "false");

    await openMap(userEvent.setup());
    expect(screen.getByText("Scegli lo stile della mappa che preferisci")).toBeVisible();
    expect(screen.getAllByRole("radio", { name: /^Seleziona stile mappa / })).toHaveLength(4);
  });

  it("senza una scelta salvata è selezionato Light", async () => {
    renderScreen();
    await openMap(userEvent.setup());
    expect(radio("Light").checked).toBe(true);
  });

  it("riaprendo Impostazioni è selezionato lo stile salvato", async () => {
    localStorage.setItem("tappafurba.mapStyle", "stradale");
    renderScreen();
    await openMap(userEvent.setup());
    expect(radio("Carta Stradale").checked).toBe(true);
    expect(radio("Light").checked).toBe(false);
  });

  it("toccare una card cambia solo la selezione: finché non si salva niente viene scritto né annunciato, e «Salva Preferenze» si abilita", async () => {
    renderScreen();
    const user = userEvent.setup();
    await openMap(user);
    expect(saveButton()).toBeDisabled();

    await user.click(screen.getByAltText("Anteprima stile Duotono"));
    expect(radio("Duotono").checked).toBe(true);
    expect(screen.getByTestId("map-style-duotono")).toHaveClass("border-primary");
    expect(localStorage.getItem("tappafurba.mapStyle")).toBeNull();
    expect(events).toEqual([]);
    expect(screen.getByText("Modifiche non salvate.")).toBeInTheDocument();
    expect(saveButton()).toBeEnabled();
  });

  it("«Salva Preferenze» scrive lo stile in tappafurba.mapStyle e emette un solo «map-style-changed», con detail { styleId }", async () => {
    renderScreen();
    const user = userEvent.setup();
    await openMap(user);
    await user.click(screen.getByAltText("Anteprima stile Monocromo"));
    await user.click(saveButton());

    expect(localStorage.getItem("tappafurba.mapStyle")).toBe("monochrome");
    expect(events).toEqual([{ styleId: "monochrome" }]);
    expect(screen.getByRole("status")).toHaveTextContent("Preferenze salvate");
    expect(saveButton()).toBeDisabled(); // salvato: niente più bozza
  });

  it("tornare sullo stile salvato prima di salvare annulla la modifica (nessuna bozza, nessun evento)", async () => {
    localStorage.setItem("tappafurba.mapStyle", "duotono");
    renderScreen();
    const user = userEvent.setup();
    await openMap(user);
    await user.click(screen.getByAltText("Anteprima stile Light"));
    expect(saveButton()).toBeEnabled();
    await user.click(screen.getByAltText("Anteprima stile Duotono"));
    expect(saveButton()).toBeDisabled();
    expect(events).toEqual([]);
  });

  it("salvare un'altra preferenza senza toccare il tema non emette alcun evento", async () => {
    renderScreen();
    const user = userEvent.setup();
    await open(user, "Profilo Veicolo");
    await type(user, "Modello", "Panda");
    await user.click(saveButton());
    expect(saved().vehicle.modelName).toBe("Panda");
    expect(events).toEqual([]);
    expect(localStorage.getItem("tappafurba.mapStyle")).toBeNull();
  });

  it("la tastiera funziona anche qui: Enter su una card la seleziona", async () => {
    renderScreen();
    const user = userEvent.setup();
    await openMap(user);
    radio("Carta Stradale").focus();
    await user.keyboard("{Enter}");
    expect(radio("Carta Stradale").checked).toBe(true);
    expect(saveButton()).toBeEnabled();
  });

  it("«Ripristina Predefiniti» riporta subito a Light: scrive, emette l'evento e riseleziona la card", async () => {
    localStorage.setItem("tappafurba.mapStyle", "duotono");
    renderScreen();
    const user = userEvent.setup();
    await openMap(user);
    await user.click(restoreButton());

    expect(localStorage.getItem("tappafurba.mapStyle")).toBe("light");
    expect(events).toEqual([{ styleId: "light" }]);
    expect(radio("Light").checked).toBe(true);
    expect(saveButton()).toBeDisabled();
  });

  it("«Ripristina Predefiniti» con Light già attivo non emette nulla", async () => {
    renderScreen();
    await userEvent.setup().click(restoreButton());
    expect(events).toEqual([]);
  });

  it("anche a 390 e a 1280 px le quattro card ci sono e la sezione si apre (la griglia è in CSS: lista < lg, 2×2 da lg)", async () => {
    for (const width of [390, 1280]) {
      setViewportWidth(width);
      const { unmount } = renderScreen();
      await openMap(userEvent.setup());
      expect(screen.getAllByRole("radio", { name: /^Seleziona stile mappa / })).toHaveLength(4);
      expect(screen.getByRole("radiogroup", { name: "Scegli lo stile della mappa che preferisci" })).toHaveClass("grid-cols-1", "lg:grid-cols-2");
      unmount();
    }
  });
});

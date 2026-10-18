import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DETOUR_RANGE } from "./defaults";
import {
  factorySettings,
  FACTORY_SETTINGS,
  loadSettings,
  CONSUMPTION_SLIDER,
  parseDecimal,
  perHourFromMinute,
  perMinuteFromHour,
  prefillManualReference,
  referenceOverrideFor,
  resetSettingsMemory,
  sanitizeSettings,
  samePreferences,
  saveSettings,
  SETTINGS_KEY,
  SETTINGS_VERSION,
  V_TIME_CUSTOM_RANGE,
  V_TIME_PRESETS,
  vTimePresetFor,
  type Settings,
} from "./settings";

beforeEach(() => {
  localStorage.clear();
  resetSettingsMemory();
});
afterEach(() => vi.restoreAllMocks());

const custom = (): Settings => ({
  vehicle: { bodyType: "suv", modelName: "Golf 1.5 eTSI", tankLiters: 50, defaultFuel: "diesel" },
  consumptionKmPerLiter: 17.5,
  consumptionUnit: "l100km",
  valueOfTimePerMinute: 0.3,
  referenceMode: "manual",
  manualReference: { benzina: 1.9, diesel: 1.8 },
  lastAutomaticReference: { benzina: 1.85 },
  avoidMotorway: true,
  avoidTolls: true,
  avoidFerries: false,
  onlySelf: false,
  defaultMaxDetourKm: 8,
  maxPriceAgeHours: 48,
});

describe("unità del consumo (solo display)", () => {
  it("sanitizeSettings accetta solo «kmpl» e «l100km»; ogni altro valore (o l'assenza) torna a «kmpl»", () => {
    expect(sanitizeSettings({ consumptionUnit: "l100km" }).consumptionUnit).toBe("l100km");
    expect(sanitizeSettings({ consumptionUnit: "kmpl" }).consumptionUnit).toBe("kmpl");
    for (const bad of ["mpg", "L/100km", "", null, 1, undefined, {}]) {
      expect(sanitizeSettings({ consumptionUnit: bad }).consumptionUnit, String(bad)).toBe("kmpl");
    }
    expect(sanitizeSettings({}).consumptionUnit).toBe("kmpl"); // un salvataggio precedente senza il campo
  });

  it("l'unità non tocca mai il valore salvato: consumptionKmPerLiter resta km/L qualunque unità sia scelta", () => {
    const clean = sanitizeSettings({ consumptionKmPerLiter: 14.93, consumptionUnit: "l100km" });
    expect(clean.consumptionKmPerLiter).toBe(14.93);
    expect(clean.consumptionUnit).toBe("l100km");
  });

  it("si salva e si rilegge da localStorage nella stessa chiave versionata", () => {
    saveSettings({ ...FACTORY_SETTINGS, consumptionUnit: "l100km", consumptionKmPerLiter: 20 });
    const stored = JSON.parse(localStorage.getItem(SETTINGS_KEY)!);
    expect(stored.version).toBe(1);
    expect(stored.settings.consumptionUnit).toBe("l100km");
    expect(stored.settings.consumptionKmPerLiter).toBe(20); // mai 5 L/100 km
    expect(loadSettings().consumptionUnit).toBe("l100km");
  });

  it("factorySettings() lo riporta a «kmpl»", () => {
    expect(factorySettings().consumptionUnit).toBe("kmpl");
  });
});

describe("valori di fabbrica", () => {
  it("coincidono con i default confermati: 45 L, 15 km/L, 0,15 €/min («Bilanciato»), 72 h, Benzina, Automatico, nessuna esclusione, Solo Self ON", () => {
    expect(FACTORY_SETTINGS.vehicle).toEqual({ bodyType: "berlina", modelName: "", tankLiters: 45, defaultFuel: "benzina" });
    expect(FACTORY_SETTINGS.consumptionKmPerLiter).toBe(15);
    expect(FACTORY_SETTINGS.consumptionUnit).toBe("kmpl");
    expect(FACTORY_SETTINGS.valueOfTimePerMinute).toBe(0.15);
    expect(FACTORY_SETTINGS.referenceMode).toBe("auto");
    expect(FACTORY_SETTINGS.manualReference).toEqual({});
    expect(FACTORY_SETTINGS.avoidMotorway).toBe(false);
    expect(FACTORY_SETTINGS.avoidTolls).toBe(false);
    expect(FACTORY_SETTINGS.avoidFerries).toBe(false);
    expect(FACTORY_SETTINGS.onlySelf).toBe(true);
    expect(FACTORY_SETTINGS.defaultMaxDetourKm).toBe(5);
    expect(FACTORY_SETTINGS.maxPriceAgeHours).toBe(72);
  });

  it("senza nulla di salvato si parte dai valori di fabbrica", () => {
    expect(loadSettings()).toEqual(FACTORY_SETTINGS);
  });
});

describe("persistenza (tappafurba.settings.v1)", () => {
  it("usa la chiave versionata e scrive versione + impostazioni", () => {
    expect(SETTINGS_KEY).toBe("tappafurba.settings.v1");
    saveSettings(custom());
    const raw = JSON.parse(localStorage.getItem("tappafurba.settings.v1")!);
    expect(raw.version).toBe(SETTINGS_VERSION);
    expect(raw.settings.vehicle.tankLiters).toBe(50);
  });

  it("salvataggio e rilettura coincidono", () => {
    saveSettings(custom());
    expect(loadSettings()).toEqual(custom());
  });

  it("NON salva indirizzi né coordinate (vincolo ToS Mapbox)", () => {
    saveSettings(custom());
    const raw = localStorage.getItem(SETTINGS_KEY)!;
    expect(raw).not.toMatch(/lat|lon|coordinat|indirizzo|address|origin|destination/i);
  });

  it("una versione sconosciuta (futura o danneggiata) non viene interpretata: valori di fabbrica", () => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ version: 99, settings: custom() }));
    expect(loadSettings()).toEqual(FACTORY_SETTINGS);
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ settings: custom() }));
    expect(loadSettings()).toEqual(FACTORY_SETTINGS);
  });

  it("JSON corrotto o di forma sbagliata → valori di fabbrica, senza lanciare", () => {
    for (const raw of ["non json", "null", "[]", "42", '"x"']) {
      localStorage.setItem(SETTINGS_KEY, raw);
      expect(loadSettings()).toEqual(FACTORY_SETTINGS);
    }
  });

  it("senza storage utilizzabile funziona in memoria", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("bloccato");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("bloccato");
    });
    saveSettings(custom());
    expect(loadSettings()).toEqual(custom());
  });
});

describe("sanitizeSettings — ogni campo non valido torna al valore di fabbrica", () => {
  it("campi validi passano, fuori intervallo o di tipo sbagliato no", () => {
    const dirty = {
      vehicle: { bodyType: "astronave", modelName: 12, tankLiters: 999, defaultFuel: "idrogeno" },
      consumptionKmPerLiter: 100,
      valueOfTimePerMinute: 1.5,
      referenceMode: "boh",
      manualReference: { benzina: 0.1, diesel: 99, gpl: "2", metano: 1.2 },
      lastAutomaticReference: { benzina: 1.7 },
      avoidMotorway: "sì",
      avoidTolls: 1,
      avoidFerries: "true",
      onlySelf: "no",
      defaultMaxDetourKm: 11,
      maxPriceAgeHours: 3.5,
    };
    const clean = sanitizeSettings(dirty);
    expect(clean.vehicle).toEqual(FACTORY_SETTINGS.vehicle);
    expect(clean.consumptionKmPerLiter).toBe(15);
    expect(clean.valueOfTimePerMinute).toBe(0.15);
    expect(clean.referenceMode).toBe("auto");
    expect(clean.manualReference).toEqual({ metano: 1.2 }); // solo il valore nell'intervallo 0,5–4
    expect(clean.lastAutomaticReference).toEqual({ benzina: 1.7 });
    expect(clean.avoidMotorway).toBe(false);
    expect(clean.avoidTolls).toBe(false);
    expect(clean.avoidFerries).toBe(false);
    expect(clean.onlySelf).toBe(true); // solo un false esplicito lo spegne
    expect(clean.defaultMaxDetourKm).toBe(5);
    expect(clean.maxPriceAgeHours).toBe(72);
  });

  it("deviazione massima predefinita: 1–10 km come lo schema API; 0, 11, testo o NaN tornano a 5; assente (salvataggio vecchio) = 5", () => {
    for (const ok of [1, 5, 8, 10]) expect(sanitizeSettings({ defaultMaxDetourKm: ok }).defaultMaxDetourKm).toBe(ok);
    for (const bad of [0, 0.5, 10.5, 11, -3, "7", null, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(sanitizeSettings({ defaultMaxDetourKm: bad }).defaultMaxDetourKm, String(bad)).toBe(5);
    }
    expect(sanitizeSettings({}).defaultMaxDetourKm).toBe(5);
    expect(DETOUR_RANGE).toMatchObject({ min: 1, max: 10 }); // stesso intervallo dello schema API (min 1, max 10)
  });

  it("«Solo denaro»: valueOfTimePerMinute = 0 è conservato (non è scambiato per «assente» né ripristinato al default)", () => {
    expect(sanitizeSettings({ valueOfTimePerMinute: 0 }).valueOfTimePerMinute).toBe(0);
    saveSettings({ ...FACTORY_SETTINGS, valueOfTimePerMinute: 0 });
    expect(loadSettings().valueOfTimePerMinute).toBe(0);
    expect(JSON.parse(localStorage.getItem(SETTINGS_KEY)!).settings.valueOfTimePerMinute).toBe(0);
  });

  it("lo slider dei consumi ha passo 0,1 e copre 3–40 km/L; i valori a un decimale sono ammessi", () => {
    expect(CONSUMPTION_SLIDER).toEqual({ min: 3, max: 40, step: 0.1, default: 15 });
    expect(sanitizeSettings({ consumptionKmPerLiter: 15.3 }).consumptionKmPerLiter).toBe(15.3);
    expect(sanitizeSettings({ consumptionKmPerLiter: 2.9 }).consumptionKmPerLiter).toBe(15);
  });

  it("«Solo Self» predefinito: solo `false` lo spegne; un salvataggio senza il campo resta ON", () => {
    expect(sanitizeSettings({ onlySelf: false }).onlySelf).toBe(false);
    expect(sanitizeSettings({ onlySelf: true }).onlySelf).toBe(true);
    expect(sanitizeSettings({}).onlySelf).toBe(true);
    expect(sanitizeSettings({ avoidTolls: true, avoidFerries: true })).toMatchObject({ avoidTolls: true, avoidFerries: true });
  });

  it("V_time: da 0,00 («Solo denaro») a 1,00 €/min sono ammessi, -0,01 e 1,01 no", () => {
    expect(sanitizeSettings({ valueOfTimePerMinute: 0 }).valueOfTimePerMinute).toBe(0);
    expect(sanitizeSettings({ valueOfTimePerMinute: 0.05 }).valueOfTimePerMinute).toBe(0.05);
    expect(sanitizeSettings({ valueOfTimePerMinute: 1 }).valueOfTimePerMinute).toBe(1);
    expect(sanitizeSettings({ valueOfTimePerMinute: -0.01 }).valueOfTimePerMinute).toBe(0.15);
    expect(sanitizeSettings({ valueOfTimePerMinute: 1.01 }).valueOfTimePerMinute).toBe(0.15);
    expect(sanitizeSettings({ valueOfTimePerMinute: "0,15" }).valueOfTimePerMinute).toBe(0.15);
  });

  it("il modello è limitato a 60 caratteri", () => {
    expect(sanitizeSettings({ vehicle: { modelName: "x".repeat(100) } }).vehicle.modelName).toHaveLength(60);
  });
});

describe("valore del tuo tempo: preset in €/ora, valore sempre in €/min", () => {
  it("quattro preset nominati: 0, 6, 9 e 15 €/h", () => {
    expect(V_TIME_PRESETS.map((p) => [p.label, p.perHour])).toEqual([
      ["Solo denaro", 0],
      ["Tranquillo", 6],
      ["Bilanciato", 9],
      ["Ho fretta", 15],
    ]);
  });

  it("€/h ÷ 60 = €/min: 0, 0,10, 0,15, 0,25 (nessun errore di virgola mobile nei preset)", () => {
    expect(V_TIME_PRESETS.map((p) => perMinuteFromHour(p.perHour))).toEqual([0, 0.1, 0.15, 0.25]);
    expect(perMinuteFromHour(60)).toBe(1);
    expect(perMinuteFromHour(7)).toBe(0.1167); // arrotondato a 4 decimali
  });

  it("«Bilanciato» è il default di fabbrica (0,15 €/min)", () => {
    expect(FACTORY_SETTINGS.valueOfTimePerMinute).toBe(perMinuteFromHour(9));
    expect(vTimePresetFor(FACTORY_SETTINGS.valueOfTimePerMinute)?.label).toBe("Bilanciato");
  });

  it("riconosce il preset di un valore salvato; un valore intermedio è «Personalizzato» (nessun preset)", () => {
    expect(vTimePresetFor(0)?.label).toBe("Solo denaro");
    expect(vTimePresetFor(0.1)?.label).toBe("Tranquillo");
    expect(vTimePresetFor(0.25)?.label).toBe("Ho fretta");
    expect(vTimePresetFor(0.3)).toBeUndefined();
    expect(vTimePresetFor(0.1167)).toBeUndefined(); // 7 €/h
  });

  it("slider «Personalizzato»: 3–60 €/h a passo 1, cioè 0,05–1,00 €/min: dentro la validazione", () => {
    expect(V_TIME_CUSTOM_RANGE).toEqual({ min: 3, max: 60, step: 1 });
    expect(perMinuteFromHour(V_TIME_CUSTOM_RANGE.min)).toBe(0.05);
    expect(perMinuteFromHour(V_TIME_CUSTOM_RANGE.max)).toBe(1);
    for (let hour = V_TIME_CUSTOM_RANGE.min; hour <= V_TIME_CUSTOM_RANGE.max; hour++) {
      expect(sanitizeSettings({ valueOfTimePerMinute: perMinuteFromHour(hour) }).valueOfTimePerMinute).toBe(perMinuteFromHour(hour));
    }
  });

  it("€/min → €/h con due decimali, es. 0,3 → 18", () => {
    expect(perHourFromMinute(0.3)).toBe(18);
    expect(perHourFromMinute(0.1167)).toBe(7.0);
    expect(perHourFromMinute(0)).toBe(0);
  });
});

describe("Ripristina Predefiniti", () => {
  it("riporta tutto ai valori di fabbrica, incluso Automatico, ma conserva la cache dell'ultimo prezzo automatico", () => {
    const reset = factorySettings(custom());
    expect(reset).toEqual({ ...FACTORY_SETTINGS, lastAutomaticReference: { benzina: 1.85 } });
    expect(reset.referenceMode).toBe("auto");
    expect(reset.manualReference).toEqual({});
  });

  it("non condivide riferimenti con i valori di fabbrica (nessuna mutazione accidentale)", () => {
    const reset = factorySettings();
    reset.manualReference.benzina = 2;
    reset.vehicle.tankLiters = 80;
    expect(FACTORY_SETTINGS.manualReference).toEqual({});
    expect(FACTORY_SETTINGS.vehicle.tankLiters).toBe(45);
  });
});

describe("prezzo di riferimento manuale", () => {
  it("passando a Manuale pre-compila i campi vuoti con l'ultimo prezzo automatico noto, senza toccare quelli scritti", () => {
    const filled = prefillManualReference({
      ...FACTORY_SETTINGS,
      manualReference: { diesel: 1.77 },
      lastAutomaticReference: { benzina: 1.8543, diesel: 1.9, gpl: 0.82 },
    });
    expect(filled).toEqual({ diesel: 1.77, benzina: 1.854, gpl: 0.82 });
    expect(filled.metano).toBeUndefined(); // mai cercato: resta vuoto
  });

  it("referenceOverrideFor: solo in modalità Manuale e solo se c'è un valore per quel carburante", () => {
    const s = { ...custom(), referenceMode: "manual" as const, manualReference: { benzina: 1.9 } };
    expect(referenceOverrideFor(s, "benzina")).toBe(1.9);
    expect(referenceOverrideFor(s, "diesel")).toBeUndefined(); // vuoto → calcolo automatico
    expect(referenceOverrideFor({ ...s, referenceMode: "auto" }, "benzina")).toBeUndefined(); // Automatico: i valori manuali restano ma non contano
  });
});

describe("parseDecimal", () => {
  it("accetta virgola e punto, rifiuta il resto", () => {
    expect(parseDecimal("0,15")).toBe(0.15);
    expect(parseDecimal(" 15.5 ")).toBe(15.5);
    expect(parseDecimal("72")).toBe(72);
    expect(parseDecimal(".5")).toBe(0.5);
    for (const bad of ["", " ", "abc", "1,2,3", "-1", "1e3", "0x10", "∞"]) expect(parseDecimal(bad)).toBeNull();
  });
});

describe("samePreferences", () => {
  it("ignora la cache dell'ultimo prezzo automatico e l'ordine delle chiavi", () => {
    const a = custom();
    const b: Settings = { ...custom(), lastAutomaticReference: { gpl: 1 }, manualReference: { diesel: 1.8, benzina: 1.9 } };
    expect(samePreferences(a, b)).toBe(true);
  });

  it("rileva ogni preferenza modificata", () => {
    const base = custom();
    const variants: Settings[] = [
      { ...base, vehicle: { ...base.vehicle, tankLiters: 55 } },
      { ...base, consumptionKmPerLiter: 18 },
      { ...base, consumptionUnit: "kmpl" },
      { ...base, valueOfTimePerMinute: 0.31 },
      { ...base, referenceMode: "auto" },
      { ...base, manualReference: { benzina: 1.91, diesel: 1.8 } },
      { ...base, avoidMotorway: false },
      { ...base, avoidTolls: false },
      { ...base, avoidFerries: true },
      { ...base, onlySelf: true },
      { ...base, defaultMaxDetourKm: 9 },
      { ...base, maxPriceAgeHours: 49 },
    ];
    for (const v of variants) expect(samePreferences(base, v)).toBe(false);
  });

  it("copre TUTTI i campi persistiti: per ciascuno (tranne la cache) una variante deve risultare diversa", () => {
    const base = custom();
    const change: Record<Exclude<keyof Settings, "lastAutomaticReference">, Partial<Settings>> = {
      vehicle: { vehicle: { ...base.vehicle, modelName: "altro" } },
      consumptionKmPerLiter: { consumptionKmPerLiter: base.consumptionKmPerLiter + 0.1 },
      consumptionUnit: { consumptionUnit: base.consumptionUnit === "kmpl" ? "l100km" : "kmpl" },
      valueOfTimePerMinute: { valueOfTimePerMinute: 0 },
      referenceMode: { referenceMode: "auto" },
      manualReference: { manualReference: { ...base.manualReference, gpl: 0.8 } },
      avoidMotorway: { avoidMotorway: !base.avoidMotorway },
      avoidTolls: { avoidTolls: !base.avoidTolls },
      avoidFerries: { avoidFerries: !base.avoidFerries },
      onlySelf: { onlySelf: !base.onlySelf },
      defaultMaxDetourKm: { defaultMaxDetourKm: base.defaultMaxDetourKm + 1 },
      maxPriceAgeHours: { maxPriceAgeHours: base.maxPriceAgeHours + 1 },
    };
    // Una chiave nuova in Settings senza una riga qui (e senza essere confrontata in samePreferences) fa fallire il test.
    expect(Object.keys(change).sort()).toEqual(Object.keys(custom()).filter((key) => key !== "lastAutomaticReference").sort());
    for (const [field, patch] of Object.entries(change)) {
      expect(samePreferences(base, { ...base, ...patch }), field).toBe(false);
    }
  });
});

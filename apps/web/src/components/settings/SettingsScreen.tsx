import { useState } from "react";
import { useNotice } from "../../hooks/useNotice";
import { formatPrice } from "../../lib/format";
import { useSettings } from "../../hooks/useSettings";
import {
  CONSUMPTION_MARKS,
  CONSUMPTION_UNITS,
  displayRange,
  formatConsumption,
  formatConsumptionWithUnit,
  fromDisplay,
  L100_SLIDER,
  toDisplay,
  unitLabel,
} from "../../lib/consumption";
import { DETOUR_RANGE, FUEL_OPTIONS } from "../../lib/defaults";
import { DEFAULT_MAP_STYLE, getSelectedMapStyle, setMapStyle, type MapStyleId } from "../../lib/mapStyle";
import { BRAND_ATTRIBUTION } from "../../lib/brandLogos";
import { RangeInput } from "../RangeInput";
import { clearRecentRoutes, useRecentRoutes } from "../../lib/recentRoutes";
import {
  BODY_TYPES,
  CONSUMPTION_SLIDER,
  FRESHNESS_RANGE,
  perHourFromMinute,
  perMinuteFromHour,
  prefillManualReference,
  REFERENCE_PRICE_RANGE,
  samePreferences,
  TANK_RANGE,
  V_TIME_CUSTOM_RANGE,
  V_TIME_PRESETS,
  vTimePresetFor,
  type BodyType,
  type ReferenceMode,
  type Settings,
} from "../../lib/settings";
import { FuelChips } from "../FuelChips";
import { CarIcon, DatabaseIcon, GasStationIcon, MapIcon, RestoreIcon, SlidersIcon } from "../icons";
import { Stepper } from "../Stepper";
import { ToggleRow } from "../ToggleRow";
import { Accordion } from "./Accordion";
import { AboutCard } from "./AboutCard";
import { MapStylePicker } from "./MapStylePicker";
import { NumberField } from "./NumberField";

type SectionId = "vehicle" | "fuel" | "algorithm" | "system" | "map";

const REFERENCE_MODES: ReadonlyArray<{ value: ReferenceMode; label: string; hint: string }> = [
  { value: "auto", label: "Automatico", hint: "consigliato" },
  { value: "manual", label: "Manuale", hint: "lo imposti tu" },
];

const number = (digits: number) => new Intl.NumberFormat("it-IT", { minimumFractionDigits: digits, maximumFractionDigits: digits });
const decimals = { 0: number(0), 1: number(1), 2: number(2) };
/** €/ora senza decimali inutili: "9", "7,5". */
const hourly = new Intl.NumberFormat("it-IT", { maximumFractionDigits: 2 });
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** Valore di una tacca nell'unità scelta: «8», «15», «30» in km/L; «12,5», «6,7», «3,3» in L/100 km. */
const formatMark = (kmpl: number, unit: "kmpl" | "l100km") => (unit === "kmpl" ? String(kmpl) : decimals[1].format(toDisplay(kmpl, unit)));

/** Es. "9 €/h · ≈ €0,15/min". */
const vTimeText = (perMinute: number) => `${hourly.format(perHourFromMinute(perMinute))} €/h · ≈ €${decimals[2].format(perMinute)}/min`;

/**
 * Screen 5 — Impostazioni. Le sezioni sono tutte chiuse al caricamento, anche su desktop (aperte sarebbero troppo lunghe); da `lg`
 * stanno in un contenitore `max-w-3xl` con le quattro sezioni in griglia 2×2 (`md:grid-cols-2`) e la barra «Salva Preferenze» /
 * «Ripristina Predefiniti» su una riga centrata, fissa sopra la barra di navigazione. Le modifiche stanno in una bozza finché non si
 * preme «Salva Preferenze»; «Ripristina Predefiniti» riporta subito tutto ai valori di fabbrica (compreso «Automatico»
 * sul prezzo di riferimento e «Bilanciato» sul valore del tempo). Le preferenze precompilano la ricerca successiva.
 * «Tema Mappa» (quinta sezione, a tutta larghezza) sta nella stessa bozza: il tema scelto si scrive, e la mappa lo applica, solo
 * con «Salva Preferenze»; «Ripristina Predefiniti» lo riporta subito a Light.
 */
export function SettingsScreen({ focusFreshness = false }: { focusFreshness?: boolean } = {}) {
  const { settings, save, reset } = useSettings();
  const [draft, setDraft] = useState<Settings>(settings);
  // Il tema della mappa non fa parte di `Settings` (chiave propria in localStorage): `savedMapStyle` è quello in vigore, `mapStyleDraft` la scelta in corso.
  const [savedMapStyle, setSavedMapStyle] = useState<MapStyleId>(getSelectedMapStyle);
  const [mapStyleDraft, setMapStyleDraft] = useState<MapStyleId>(savedMapStyle);
  // Arrivando dall'avviso «stazioni non mostrate» dei Risultati (`focusFreshness`) si apre «Notifiche & Dati di Sistema» e il
  // cursore va sulla soglia di freschezza.
  const [open, setOpen] = useState<Record<SectionId, boolean>>({ vehicle: false, fuel: false, algorithm: false, system: focusFreshness, map: false });
  const [invalid, setInvalid] = useState<Record<string, boolean>>({});
  const [resetCount, setResetCount] = useState(0);
  // «Personalizzato» è uno stato dell'interfaccia (non salvato): all'apertura vale solo se il valore non è un preset.
  const [customTime, setCustomTime] = useState(() => vTimePresetFor(settings.valueOfTimePerMinute) === undefined);
  const [notice, showNotice] = useNotice();
  const recentRoutes = useRecentRoutes();

  const dirty = !samePreferences(draft, settings) || mapStyleDraft !== savedMapStyle;
  const blocked = Object.values(invalid).some(Boolean);
  const markValid = (field: string) => (valid: boolean) => setInvalid((current) => (current[field] === !valid ? current : { ...current, [field]: !valid }));
  const toggle = (id: SectionId) => setOpen((current) => ({ ...current, [id]: !current[id] }));

  const setVehicle = (patch: Partial<Settings["vehicle"]>) => setDraft((d) => ({ ...d, vehicle: { ...d.vehicle, ...patch } }));
  const patch = (changes: Partial<Settings>) => setDraft((d) => ({ ...d, ...changes }));

  const chooseReferenceMode = (mode: ReferenceMode) =>
    setDraft((d) => ({
      ...d,
      referenceMode: mode,
      // Passando a «Manuale» i campi vuoti si pre-compilano con l'ultimo prezzo automatico noto; i valori già scritti restano.
      manualReference: mode === "manual" ? prefillManualReference({ ...d, lastAutomaticReference: settings.lastAutomaticReference }) : d.manualReference,
    }));

  const save_ = () => {
    save(draft);
    if (mapStyleDraft !== savedMapStyle) {
      setMapStyle(mapStyleDraft); // salva e avvisa la mappa (evento `map-style-changed`)
      setSavedMapStyle(mapStyleDraft);
    }
    showNotice("Preferenze salvate");
  };

  const restore = () => {
    const next = reset();
    setDraft(next);
    setMapStyle(DEFAULT_MAP_STYLE);
    setSavedMapStyle(DEFAULT_MAP_STYLE);
    setMapStyleDraft(DEFAULT_MAP_STYLE);
    setInvalid({});
    setCustomTime(false); // «Bilanciato»
    setResetCount((count) => count + 1);
    showNotice("Valori di fabbrica ripristinati");
  };

  // Valore del tempo: preset nominati; «Personalizzato» rivela lo slider (3–60 €/h).
  const perHour = perHourFromMinute(draft.valueOfTimePerMinute);
  const isCustomTime = customTime || vTimePresetFor(draft.valueOfTimePerMinute) === undefined;
  const activePreset = isCustomTime ? undefined : vTimePresetFor(draft.valueOfTimePerMinute);
  const chooseCustomTime = () => {
    setCustomTime(true);
    // Lo slider parte dal valore corrente, portato dentro il suo intervallo (da «Solo denaro» parte a 3 €/h).
    patch({ valueOfTimePerMinute: perMinuteFromHour(clamp(perHour, V_TIME_CUSTOM_RANGE.min, V_TIME_CUSTOM_RANGE.max)) });
  };

  // Costo al km del carburante predefinito: prezzo di riferimento (manuale se attivo, altrimenti l'ultimo automatico noto) ÷ consumo.
  const referenceFuel = draft.vehicle.defaultFuel;
  const manualPrice = draft.referenceMode === "manual" ? draft.manualReference[referenceFuel] : undefined;
  const referencePrice = manualPrice ?? settings.lastAutomaticReference[referenceFuel];
  const fuelLabel = FUEL_OPTIONS.find((o) => o.value === referenceFuel)?.label ?? "";
  const costPerKm = referencePrice !== undefined ? referencePrice / draft.consumptionKmPerLiter : null;
  const costTooltip =
    costPerKm !== null && referencePrice !== undefined
      ? `calcolato da €${formatPrice(referencePrice)}/L (${manualPrice !== undefined ? "riferimento manuale" : "ultimo riferimento automatico"} ${fuelLabel}) ${
          draft.consumptionUnit === "kmpl"
            ? `÷ ${formatConsumptionWithUnit(draft.consumptionKmPerLiter, "kmpl")}`
            : `× ${formatConsumptionWithUnit(draft.consumptionKmPerLiter, "l100km")} ÷ 100`
        }`
      : undefined;
  const consumptionChanged = draft.consumptionKmPerLiter !== CONSUMPTION_SLIDER.default;
  // Lo slider lavora nell'unità scelta e converte al change: il valore salvato resta sempre km/L.
  const unit = draft.consumptionUnit;
  const slider = unit === "kmpl" ? CONSUMPTION_SLIDER : L100_SLIDER;
  const sliderValue = Math.min(displayRange(unit).max, Math.max(displayRange(unit).min, toDisplay(draft.consumptionKmPerLiter, unit)));

  return (
    <main className="flex-1 w-full bg-surface pt-24 pb-28 px-margin max-w-md md:max-w-3xl xl:max-w-5xl 2xl:max-w-6xl md:px-8 mx-auto flex flex-col gap-space-lg lg:pb-44">
      <header className="flex flex-col gap-space-sm">
        <h1 className="text-headline-md font-headline-md md:text-headline-lg md:font-headline-lg text-on-surface">Impostazioni Veicolo &amp; Risparmio</h1>
        <p className="text-body-sm font-body-sm text-on-surface-variant">
          Ottimizza il calcolo dei rifornimenti lungo il percorso in base alle specifiche reali della tua auto.
        </p>
      </header>

      <div key={resetCount} data-testid="settings-grid" className="grid grid-cols-1 md:grid-cols-2 gap-space-lg items-start">
        <Accordion id="vehicle" title="Profilo Veicolo" icon={<CarIcon />} open={open.vehicle} onToggle={() => toggle("vehicle")}>
          <div className="flex flex-col gap-space-sm">
            <span id="body-type-label" className="text-label-sm font-label-sm font-semibold text-on-surface">
              Tipologia carrozzeria
            </span>
            <div role="radiogroup" aria-labelledby="body-type-label" className="flex gap-space-sm overflow-x-auto no-scrollbar md:flex-wrap md:overflow-visible">
              {BODY_TYPES.map((option) => {
                const active = draft.vehicle.bodyType === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setVehicle({ bodyType: option.value as BodyType })}
                    className={`h-9 px-space-lg rounded-full shrink-0 whitespace-nowrap text-label-lg font-label-lg transition-colors ${
                      active ? "bg-primary-strong text-on-primary" : "bg-surface-container-low text-on-surface-variant"
                    }`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-col gap-space-xs">
            <label htmlFor="model-name" className="text-label-sm font-label-sm font-semibold text-on-surface">
              Modello
            </label>
            <input
              id="model-name"
              data-testid="settings-model-name"
              type="text"
              maxLength={60}
              value={draft.vehicle.modelName}
              placeholder="es. Volkswagen Golf 1.5 eTSI"
              onChange={(event) => setVehicle({ modelName: event.target.value })}
              className="h-11 rounded bg-surface-container-low px-space-lg field-text font-body-md text-on-surface placeholder:text-on-surface-variant outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>

          <div className="flex flex-col gap-space-xs">
            <Stepper
              label="Capacità serbatoio"
              testId="tank"
              value={draft.vehicle.tankLiters}
              unit="L"
              {...TANK_RANGE}
              onChange={(tankLiters) => setVehicle({ tankLiters })}
            />
            <p className="text-body-sm font-body-sm text-on-surface-variant">Vale come valore iniziale di «Litri» nella ricerca.</p>
          </div>

          <div className="flex flex-col gap-space-sm">
            <span className="text-label-sm font-label-sm font-semibold text-on-surface">Carburante predefinito</span>
            <FuelChips value={draft.vehicle.defaultFuel} onChange={(defaultFuel) => setVehicle({ defaultFuel })} />
          </div>
        </Accordion>

        <Accordion id="fuel" title="Consumi e Carburante" icon={<GasStationIcon />} open={open.fuel} onToggle={() => toggle("fuel")}>
          <div className="flex flex-col gap-space-sm">
            <span id="consumption-unit-label" className="text-label-sm font-label-sm font-semibold text-on-surface">
              Unità del consumo
            </span>
            <div role="radiogroup" aria-labelledby="consumption-unit-label" className="flex gap-space-sm">
              {CONSUMPTION_UNITS.map((option) => {
                const active = unit === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => patch({ consumptionUnit: option.value })}
                    className={`h-9 px-space-lg rounded-full whitespace-nowrap text-label-lg font-label-lg transition-colors ${
                      active ? "bg-primary-strong text-on-primary" : "bg-surface-container-low text-on-surface-variant"
                    }`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
            <p className="text-body-sm font-body-sm text-on-surface-variant">Cambia solo come lo vedi: i calcoli restano gli stessi.</p>
          </div>
          <div className="flex flex-col gap-space-sm rounded bg-surface-container-lowest border border-outline-variant/30 p-space-md">
            <div className="flex items-start justify-between gap-space-md">
              <div className="flex flex-col gap-space-xs">
                <label htmlFor="consumption-slider" className="text-label-sm font-label-sm font-semibold text-on-surface">
                  Consumo medio misto
                </label>
                <div className="flex items-center gap-space-sm">
                  <output
                    htmlFor="consumption-slider"
                    data-testid="consumption-pill"
                    className="inline-flex items-baseline gap-1 rounded-full bg-primary-fixed/30 text-on-primary-fixed-variant px-space-md py-space-xs tabular-nums"
                  >
                    <span className="text-label-lg font-label-lg font-bold">{formatConsumption(draft.consumptionKmPerLiter, unit)}</span>{" "}
                    <span className="text-label-sm font-label-sm">{unitLabel(unit)}</span>
                  </output>
                  {consumptionChanged && (
                    <button
                      type="button"
                      onClick={() => patch({ consumptionKmPerLiter: CONSUMPTION_SLIDER.default })}
                      className="flex items-center gap-1 text-label-md font-label-md text-on-primary-fixed-variant hover:underline"
                    >
                      <RestoreIcon className="w-4 h-4" />
                      Ripristina
                    </button>
                  )}
                </div>
              </div>
              <div className="text-right flex flex-col">
                <span className="text-label-sm font-label-sm text-on-surface-variant">Costo / km</span>
                <span
                  data-testid="cost-per-km"
                  title={costTooltip}
                  className={`text-label-lg font-label-lg font-bold text-on-primary-fixed-variant tabular-nums ${costTooltip ? "cursor-help" : ""}`}
                >
                  {costPerKm !== null ? `~€${decimals[2].format(costPerKm)}/km` : "—"}
                </span>
                {costPerKm === null && <span className="text-label-sm font-label-sm text-on-surface-variant">nessun prezzo di riferimento noto</span>}
              </div>
            </div>
            <RangeInput
              id="consumption-slider"
              min={slider.min}
              max={slider.max}
              step={slider.step}
              value={sliderValue}
              onChange={(event) => patch({ consumptionKmPerLiter: fromDisplay(Number(event.target.value), unit) })}
            />
            {/* Tre tacche distribuite sotto lo slider. */}
            <div className="flex justify-between text-label-sm font-label-sm text-on-surface-variant">
              {CONSUMPTION_MARKS.map((mark) => (
                <span key={mark.name}>
                  {formatMark(mark.kmpl, unit)} {mark.name}
                </span>
              ))}
            </div>
          </div>
        </Accordion>

        <Accordion id="algorithm" title="Algoritmo & Filtri" icon={<SlidersIcon />} open={open.algorithm} onToggle={() => toggle("algorithm")}>
          <div className="flex flex-col gap-space-sm">
            <span id="vtime-label" className="text-label-sm font-label-sm font-semibold text-on-surface">
              Valore del tuo tempo
            </span>
            <div role="radiogroup" aria-labelledby="vtime-label" className="flex flex-wrap gap-space-sm">
              {V_TIME_PRESETS.map((preset) => {
                const active = activePreset?.id === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    title={`${hourly.format(preset.perHour)} €/h · ≈ €${decimals[2].format(perMinuteFromHour(preset.perHour))}/min`}
                    onClick={() => {
                      setCustomTime(false);
                      patch({ valueOfTimePerMinute: perMinuteFromHour(preset.perHour) });
                    }}
                    className={`h-9 px-space-lg rounded-full whitespace-nowrap text-label-lg font-label-lg transition-colors ${
                      active ? "bg-primary-strong text-on-primary" : "bg-surface-container-low text-on-surface-variant"
                    }`}
                  >
                    {preset.label}
                  </button>
                );
              })}
              <button
                type="button"
                role="radio"
                aria-checked={isCustomTime}
                onClick={chooseCustomTime}
                className={`h-9 px-space-lg rounded-full whitespace-nowrap text-label-lg font-label-lg transition-colors ${
                  isCustomTime ? "bg-primary-strong text-on-primary" : "bg-surface-container-low text-on-surface-variant"
                }`}
              >
                Personalizzato
              </button>
            </div>

            <p data-testid="vtime-summary" className="text-label-md font-label-md text-on-surface tabular-nums">
              {draft.valueOfTimePerMinute === 0 ? "0 €/h · il tempo non entra nel risparmio netto" : vTimeText(draft.valueOfTimePerMinute)}
            </p>

            {isCustomTime && (
              <div className="flex flex-col gap-space-xs rounded bg-surface-container-low p-space-md">
                <RangeInput
                  aria-label="Valore del tuo tempo in euro all'ora"
                  min={V_TIME_CUSTOM_RANGE.min}
                  max={V_TIME_CUSTOM_RANGE.max}
                  step={V_TIME_CUSTOM_RANGE.step}
                  value={clamp(perHour, V_TIME_CUSTOM_RANGE.min, V_TIME_CUSTOM_RANGE.max)}
                  onChange={(event) => patch({ valueOfTimePerMinute: perMinuteFromHour(Number(event.target.value)) })}
                />
                <div className="flex justify-between text-label-sm font-label-sm text-on-surface-variant">
                  <span>{V_TIME_CUSTOM_RANGE.min} €/h</span>
                  <span>{V_TIME_CUSTOM_RANGE.max} €/h</span>
                </div>
              </div>
            )}

            <p className="text-body-sm font-body-sm text-on-surface-variant">
              Quanto vale un&apos;ora del tuo tempo? TappaFurba sottrae al risparmio il tempo perso in deviazione, a questo valore.
            </p>
          </div>

          <div className="flex flex-col gap-space-sm">
            <span id="reference-mode-label" className="text-label-sm font-label-sm font-semibold text-on-surface">
              Prezzo di riferimento
            </span>
            <div role="radiogroup" aria-labelledby="reference-mode-label" className="grid grid-cols-2 gap-space-sm">
              {REFERENCE_MODES.map((option) => {
                const active = draft.referenceMode === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => chooseReferenceMode(option.value)}
                    className={`rounded px-space-md py-space-sm flex flex-col items-center transition-colors ${
                      active ? "bg-primary-strong text-on-primary" : "bg-surface-container-low text-on-surface-variant"
                    }`}
                  >
                    <span className="text-label-lg font-label-lg">{option.label}</span>
                    <span className="text-label-sm font-label-sm opacity-90">{option.hint}</span>
                  </button>
                );
              })}
            </div>
            {draft.referenceMode === "auto" ? (
              <p className="text-body-sm font-body-sm text-on-surface-variant">
                Si calcola a ogni ricerca: il prezzo tipico delle stazioni sul percorso; se sono poche, quello delle stazioni vicine al percorso; se ancora poche, quello nazionale.
              </p>
            ) : (
              <div className="flex flex-col gap-space-md rounded bg-surface-container-low p-space-md">
                <p className="text-body-sm font-body-sm text-on-surface-variant">
                  Sostituisce completamente il calcolo automatico in tutte le ricerche, finché non torni su Automatico. Un carburante senza valore usa il
                  calcolo automatico.
                </p>
                {FUEL_OPTIONS.map((fuel) => (
                  <NumberField
                    key={fuel.value}
                    label={fuel.label}
                    value={draft.manualReference[fuel.value] ?? null}
                    min={REFERENCE_PRICE_RANGE.min}
                    max={REFERENCE_PRICE_RANGE.max}
                    unit="€/L"
                    optional
                    placeholder="auto"
                    onChange={(value) =>
                      setDraft((d) => {
                        const manualReference = { ...d.manualReference };
                        if (value === null) delete manualReference[fuel.value];
                        else manualReference[fuel.value] = value;
                        return { ...d, manualReference };
                      })
                    }
                    onValidityChange={markValid(`manual-${fuel.value}`)}
                  />
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-space-sm">
            <div className="flex items-center justify-between">
              <label htmlFor="default-detour" className="text-label-sm font-label-sm font-semibold text-on-surface">
                Deviazione massima predefinita
              </label>
              <output
                htmlFor="default-detour"
                data-testid="default-detour-pill"
                className="rounded-full bg-secondary/10 text-on-secondary-fixed-variant px-space-md py-space-xs text-label-lg font-label-lg tabular-nums"
              >
                {draft.defaultMaxDetourKm} km
              </output>
            </div>
            <RangeInput id="default-detour" {...DETOUR_RANGE} value={draft.defaultMaxDetourKm} onChange={(event) => patch({ defaultMaxDetourKm: Number(event.target.value) })} />
            <p className="text-body-sm font-body-sm text-on-surface-variant">
              Km extra totali (andata e ritorno) rispetto al percorso diretto. Vale come valore iniziale dello slider della ricerca: puoi cambiarlo per ogni ricerca.
            </p>
          </div>

          <div className="flex flex-col gap-space-md">
            <ToggleRow
              label="Evita autostrada"
              description="Il percorso consigliato e il calcolo delle deviazioni evitano le autostrade. Vale come valore iniziale dello switch «Evita autostrada» nella ricerca: puoi cambiarlo per ogni viaggio."
              checked={draft.avoidMotorway}
              onChange={(avoidMotorway) => patch({ avoidMotorway })}
            />
            <ToggleRow
              label="Evita pedaggi"
              description="Il percorso consigliato evita le strade a pedaggio. Vale come valore iniziale delle «Opzioni percorso» nei Risultati: puoi cambiarlo per ogni ricerca. Il costo del pedaggio non è incluso nel risparmio calcolato."
              checked={draft.avoidTolls}
              onChange={(avoidTolls) => patch({ avoidTolls })}
            />
            <ToggleRow
              label="Evita traghetti"
              description="Il percorso consigliato evita i traghetti. Vale come valore iniziale delle «Opzioni percorso» nei Risultati: puoi cambiarlo per ogni ricerca."
              checked={draft.avoidFerries}
              onChange={(avoidFerries) => patch({ avoidFerries })}
            />
            <ToggleRow
              label="Cerca solo stazioni Self per impostazione predefinita"
              description="Le nuove ricerche mostrano solo stazioni con Self. Puoi cambiarlo per ogni ricerca con lo switch «Solo Self»."
              checked={draft.onlySelf}
              onChange={(onlySelf) => patch({ onlySelf })}
            />
          </div>
        </Accordion>

        <Accordion id="system" title="Notifiche & Dati di Sistema" icon={<DatabaseIcon />} open={open.system} onToggle={() => toggle("system")}>
          <NumberField
            label="Soglia di freschezza prezzi"
            focusOnMount={focusFreshness}
            value={draft.maxPriceAgeHours}
            min={FRESHNESS_RANGE.min}
            max={FRESHNESS_RANGE.max}
            unit="ore"
            integer
            hint="I prezzi non aggiornati da più di questo tempo non compaiono nei risultati (default 72 ore)."
            onChange={(value) => value !== null && patch({ maxPriceAgeHours: value })}
            onValidityChange={markValid("freshness")}
          />
          <div className="flex items-center justify-between gap-space-md">
            <div>
              <span className="text-label-sm font-label-sm font-semibold text-on-surface">Tragitti frequenti</span>
              <p data-testid="recent-routes-count" className="text-body-sm font-body-sm text-on-surface-variant">
                {recentRoutes.length === 0
                  ? "Nessun tragitto salvato su questo dispositivo."
                  : `${recentRoutes.length} ${recentRoutes.length === 1 ? "tragitto salvato" : "tragitti salvati"} su questo dispositivo (solo il testo di partenza e arrivo, senza coordinate).`}
              </p>
            </div>
            <button
              type="button"
              disabled={recentRoutes.length === 0}
              onClick={() => {
                clearRecentRoutes();
                showNotice("Cronologia dei tragitti cancellata");
              }}
              className="h-9 px-space-lg rounded-full bg-surface-container-low text-on-surface text-label-lg font-label-lg whitespace-nowrap shrink-0 disabled:opacity-50"
            >
              Cancella cronologia
            </button>
          </div>
          <p className="text-body-sm font-body-sm text-on-surface-variant">
            Fonte dei prezzi: MIMIT Osservaprezzi (file giornaliero e prezzi in tempo reale dal sito ufficiale). Le notifiche non sono disponibili in questa
            versione.
          </p>
          <p data-testid="brand-attribution" className="text-body-sm font-body-sm text-on-surface-variant">
            {BRAND_ATTRIBUTION}
          </p>
        </Accordion>

        <Accordion id="map" title="Tema Mappa" icon={<MapIcon />} open={open.map} onToggle={() => toggle("map")} className="md:col-span-2">
          <MapStylePicker value={mapStyleDraft} onChange={setMapStyleDraft} />
        </Accordion>
      </div>

      <AboutCard />

      {/* Mobile: card in fondo ai contenuti. Da lg: riga centrata e fissa sopra la barra di navigazione (nessuna card). */}
      <div
        data-testid="save-bar"
        className="rounded-lg bg-surface/85 backdrop-blur-xl shadow-lg border border-outline-variant/30 p-space-md flex flex-col gap-space-sm lg:fixed lg:inset-x-0 lg:bottom-24 lg:z-30 lg:items-center lg:rounded-none lg:bg-transparent lg:backdrop-blur-none lg:shadow-none lg:border-0 lg:p-0 lg:pointer-events-none"
      >
        {notice && (
          <p
            role="status"
            data-testid="settings-notice"
            className="text-center text-label-lg font-label-lg text-on-primary-fixed-variant lg:rounded-full lg:bg-surface lg:px-space-lg lg:py-1 lg:shadow-sm lg:pointer-events-auto"
          >
            {notice}
          </p>
        )}
        {!notice && dirty && (
          <p
            role="status"
            className="text-center text-label-md font-label-md text-on-surface-variant lg:rounded-full lg:bg-surface lg:px-space-lg lg:py-1 lg:shadow-sm lg:pointer-events-auto"
          >
            {blocked ? "Correggi i campi evidenziati per salvare." : "Modifiche non salvate."}
          </p>
        )}
        <div className="flex flex-col gap-space-sm lg:flex-row lg:justify-center lg:gap-space-md lg:pointer-events-auto">
          <button
            type="button"
            onClick={save_}
            data-testid="settings-save"
            disabled={!dirty || blocked}
            className="h-12 lg:px-10 rounded-full bg-primary-strong text-on-primary text-headline-sm font-headline-sm flex items-center justify-center gap-space-sm shadow-sm lg:shadow-lg hover:brightness-95 active:scale-[0.99] transition disabled:opacity-50 disabled:hover:brightness-100 lg:disabled:opacity-100 lg:disabled:bg-surface-container-high lg:disabled:text-on-surface-variant"
          >
            Salva Preferenze
          </button>
          <button
            type="button"
            onClick={restore}
            data-testid="settings-restore"
            className="h-10 lg:h-12 lg:px-8 rounded-full bg-surface-container-low lg:bg-surface-container-lowest lg:border lg:border-outline-variant/40 lg:shadow-md text-on-surface text-label-lg font-label-lg flex items-center justify-center gap-space-sm"
          >
            <RestoreIcon className="w-4 h-4" />
            Ripristina Predefiniti
          </button>
        </div>
      </div>
    </main>
  );
}

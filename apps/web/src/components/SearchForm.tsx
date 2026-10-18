import type { LonLat, SearchFuelType, SearchRequest } from "@tappafurba/shared";
import { useEffect, useRef, useState } from "react";
import { useSettings } from "../hooks/useSettings";
import type { SearchLabels } from "../hooks/useSearch";
import { reverseGeocode } from "../lib/api";
import { DETOUR_RANGE, LITERS_RANGE } from "../lib/defaults";
import { RangeInput } from "./RangeInput";
import { CURRENT_POSITION_TEXT, type RecentRoute } from "../lib/recentRoutes";
import { describeResolveFailure, RecentResolveError, resolveRecentEndpoint } from "../lib/resolveRecentEndpoint";
import { referenceOverrideFor } from "../lib/settings";
import { AddressInput, type Place } from "./AddressInput";
import { ConsumptionStepper } from "./ConsumptionStepper";
import { FuelChips } from "./FuelChips";
import { LocateIcon, SpinnerIcon, SwapIcon } from "./icons";
import { Stepper } from "./Stepper";
import { ToggleRow } from "./ToggleRow";

/** Un tragitto scelto dai «Tragitti frequenti»: precompila i testi e il carburante e RITROVA i due luoghi con nuove richieste. `key` cambia a ogni scelta. */
export interface SearchPrefill {
  key: number;
  route: RecentRoute;
}

interface SearchFormProps {
  onSubmit: (request: SearchRequest, labels: SearchLabels) => void;
  busy: boolean;
  prefill?: SearchPrefill | null;
}

interface Endpoint {
  text: string;
  place: Place | null;
  /** true se il luogo è la posizione attuale del dispositivo (pulsante mirino o tragitto salvato con GPS). */
  current?: boolean;
  /** true se il testo arriva da un tragitto salvato e l'utente non l'ha toccato: niente suggerimenti automatici. */
  fromHistory?: boolean;
}

const EMPTY_ENDPOINT: Endpoint = { text: "", place: null };

/**
 * Altezza fissa delle due righe (72 px) + divisore da 1 px: i pallini stanno a 36 px dal bordo interno di ogni
 * riga, quindi la linea tratteggiata, ancorata a `top`/`bottom` = padding + 36 px, parte e arriva esattamente al centro
 * dei due pallini (nessun valore «a occhio»).
 */
const CARD_PADDING_PX = 14;
const ROW_HALF_PX = 36;
const DOT_COLUMN_CENTER_PX = CARD_PADDING_PX + 4 + 6; // padding della card + px-1 della riga + metà del pallino (12 px)

/**
 * Il form di ricerca, pensato per stare nel foglio della Home: card A→B con linea tratteggiata e pulsante di
 * scambio sul divisore, poi carburante, litri, consumo, deviazione e interruttori, con il pulsante di ricerca fisso in
 * fondo. Parte dai default delle Impostazioni e resta modificabile per ricerca.
 */
export function SearchForm({ onSubmit, busy, prefill }: SearchFormProps) {
  // I default vengono dalle Impostazioni salvate (profilo veicolo e consumi); l'algoritmo ne prende i parametri.
  const { settings } = useSettings();
  const [origin, setOrigin] = useState<Endpoint>(EMPTY_ENDPOINT);
  const [destination, setDestination] = useState<Endpoint>(EMPTY_ENDPOINT);
  const [userLocation, setUserLocation] = useState<LonLat | undefined>();
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  // Riapertura di un tragitto salvato: i luoghi si ritrovano di fresco (geocoding / GPS), mai da coordinate salvate.
  const [resolving, setResolving] = useState(false);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const resolveRun = useRef<AbortController | null>(null);
  useEffect(() => () => resolveRun.current?.abort(), []);

  const [fuelType, setFuelType] = useState<SearchFuelType>(settings.vehicle.defaultFuel);
  const [liters, setLiters] = useState<number>(settings.vehicle.tankLiters);
  const [maxDetourKm, setMaxDetourKm] = useState<number>(settings.defaultMaxDetourKm);
  // Il consumo della ricerca è sempre km/L (modello interno); `settings.consumptionUnit` cambia solo come lo si vede.
  const [consumption, setConsumption] = useState<number>(settings.consumptionKmPerLiter);
  // «Solo Self» e «Evita autostrada» partono dai default delle Impostazioni e restano modificabili per ricerca.
  const [onlySelf, setOnlySelf] = useState<boolean>(settings.onlySelf);
  const [avoidMotorway, setAvoidMotorway] = useState<boolean>(settings.avoidMotorway);

  // Quando le Impostazioni cambiano (salvataggio o ripristino) la ricerca successiva riparte dai nuovi default.
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    setFuelType(settings.vehicle.defaultFuel);
    setLiters(settings.vehicle.tankLiters);
    setConsumption(settings.consumptionKmPerLiter);
    setOnlySelf(settings.onlySelf);
    setAvoidMotorway(settings.avoidMotorway);
    setMaxDetourKm(settings.defaultMaxDetourKm);
  }, [settings.vehicle.defaultFuel, settings.vehicle.tankLiters, settings.consumptionKmPerLiter, settings.onlySelf, settings.avoidMotorway, settings.defaultMaxDetourKm]);

  // Un tragitto scelto dai «Tragitti frequenti» riempie i testi e il carburante (il resto resta com'è) e lancia DUE nuove
  // richieste di geocoding (o il GPS per la posizione attuale). Lo storico non ha coordinate: se la risoluzione
  // fallisce o si è offline i campi restano con il testo, senza luogo, e un messaggio dice cosa fare.
  const appliedPrefill = useRef<number | null>(null);
  useEffect(() => {
    if (!prefill || appliedPrefill.current === prefill.key) return;
    appliedPrefill.current = prefill.key;
    resolveRun.current?.abort();
    const { origin: from, destination: to, fuelType: fuel } = prefill.route;
    setOrigin({ text: from.text, place: null, current: from.current === true, fromHistory: true });
    setDestination({ text: to.text, place: null, current: to.current === true, fromHistory: true });
    setFuelType(fuel);
    setLocationError(null);
    setResolveError(null);

    const controller = new AbortController();
    resolveRun.current = controller;
    setResolving(true);
    const options = { signal: controller.signal, proximity: userLocation };
    void Promise.allSettled([resolveRecentEndpoint(from, options), resolveRecentEndpoint(to, options)]).then(([fromResult, toResult]) => {
      if (controller.signal.aborted) return;
      setResolving(false);
      // Un campo che l'utente ha già cambiato nel frattempo non si tocca.
      if (fromResult.status === "fulfilled") {
        const place = fromResult.value;
        setOrigin((current) => (current.text === from.text && current.place === null ? { ...current, place } : current));
        if (from.current) setUserLocation({ lon: place.lon, lat: place.lat });
      }
      if (toResult.status === "fulfilled") {
        const place = toResult.value;
        setDestination((current) => (current.text === to.text && current.place === null ? { ...current, place } : current));
        if (to.current) setUserLocation({ lon: place.lon, lat: place.lat });
      }
      const failure = [fromResult, toResult].find((result): result is PromiseRejectedResult => result.status === "rejected");
      if (failure) {
        setResolveError(failure.reason instanceof RecentResolveError ? describeResolveFailure(failure.reason) : describeResolveFailure(new RecentResolveError("service", "")));
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- si applica con un'unica esecuzione per scelta (key); userLocation serve solo come bias.
  }, [prefill]);

  const ready = origin.place !== null && destination.place !== null;

  const swap = () => {
    setOrigin(destination);
    setDestination(origin);
  };

  const useCurrentPosition = () => {
    if (!navigator.geolocation) {
      setLocationError("Il tuo browser non supporta la geolocalizzazione.");
      return;
    }
    setLocating(true);
    setLocationError(null);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const point = { lon: position.coords.longitude, lat: position.coords.latitude };
        setUserLocation(point);
        setOrigin({ text: CURRENT_POSITION_TEXT, place: { ...point, label: CURRENT_POSITION_TEXT }, current: true });
        setLocating(false);

        // L'etichetta con l'indirizzo è un'aggiunta: se il server non risponde resta "Posizione attuale". Nello storico
        // finisce comunque solo il flag «posizione attuale» (mai l'indirizzo ricavato dalla posizione).
        const label = await reverseGeocode(point);
        if (label) {
          setOrigin((current) => (current.place?.lon === point.lon ? { text: label, place: { ...point, label }, current: true } : current));
        }
      },
      (error) => {
        setLocating(false);
        setLocationError(
          error.code === error.PERMISSION_DENIED
            ? "Permesso di posizione negato: digita l'indirizzo di partenza."
            : "Impossibile determinare la posizione: digita l'indirizzo di partenza.",
        );
      },
      { timeout: 10_000, maximumAge: 60_000 },
    );
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!origin.place || !destination.place) return;
    const referenceOverride = referenceOverrideFor(settings, fuelType);
    onSubmit(
      {
        origin: { lon: origin.place.lon, lat: origin.place.lat },
        destination: { lon: destination.place.lon, lat: destination.place.lat },
        fuelType,
        liters,
        maxDetourKm,
        consumptionKmPerLiter: consumption,
        valueOfTimePerMinute: settings.valueOfTimePerMinute,
        onlySelf,
        maxPriceAgeHours: settings.maxPriceAgeHours,
        avoidMotorway,
        // Pedaggi e traghetti non sono nel form: si cambiano dalle Opzioni percorso nei Risultati o dai default nelle Impostazioni.
        avoidTolls: settings.avoidTolls,
        avoidFerries: settings.avoidFerries,
        // Prezzo di riferimento manuale (se impostato per questo carburante): sostituisce il calcolo automatico.
        ...(referenceOverride !== undefined ? { referencePriceOverride: referenceOverride } : {}),
      },
      {
        origin: origin.place.label,
        destination: destination.place.label,
        ...(origin.current ? { originCurrent: true } : {}),
        ...(destination.current ? { destinationCurrent: true } : {}),
      },
    );
  };

  return (
    <form onSubmit={submit} className="flex flex-col min-h-0 flex-1">
      {/* Corpo scorrevole: solo questo scorre, l'intestazione del foglio e il pulsante di ricerca restano fermi. */}
      <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar px-space-xl py-space-lg flex flex-col gap-space-xl">
        {/* Card A → B: linea tratteggiata verticale tra i due pallini, scambio sul divisore. */}
        <div
          data-testid="route-card"
          className="relative rounded-2xl bg-surface-container-lowest border border-outline-variant/50 shadow-md"
          style={{ padding: CARD_PADDING_PX }}
        >
          <div
            aria-hidden="true"
            data-testid="route-dashed-line"
            className="absolute w-0 border-l-2 border-dashed border-outline-variant pointer-events-none"
            style={{
              left: DOT_COLUMN_CENTER_PX - 1, // la linea è larga 2 px: il suo centro coincide con quello dei pallini
              top: CARD_PADDING_PX + ROW_HALF_PX,
              bottom: CARD_PADDING_PX + ROW_HALF_PX,
            }}
          />
          <AddressInput
            label="Partenza"
            caption="Da (Partenza)"
            placeholder="Da dove parti?"
            testId="origin-input"
            text={origin.text}
            onTextChange={(text) => setOrigin({ text, place: null })}
            place={origin.place}
            suggestions={!origin.fromHistory}
            onPlaceSelect={(place) => setOrigin({ text: place.label, place })}
            proximity={userLocation}
            leading={<span className="block w-3 h-3 rounded-full bg-primary" />}
            trailing={
              <button
                type="button"
                onClick={useCurrentPosition}
                disabled={locating}
                aria-label="Usa la posizione attuale"
                className="group w-11 h-11 flex items-center justify-center text-secondary disabled:opacity-50"
              >
                <span className="w-9 h-9 rounded-full flex items-center justify-center group-hover:bg-secondary/10 transition-colors">
                  {locating ? <SpinnerIcon className="w-4 h-4" /> : <LocateIcon />}
                </span>
              </button>
            }
          />
          {/* Divisore con il pulsante di scambio al centro (in verticale) tra i due campi. Sta 28 px a sinistra della
              colonna dei controlli (mirino, «×»): così ogni controllo dista dagli altri almeno ~45 px tra i centri e le aree di tocco da 44 px
              non si accavallano. */}
          <div data-testid="route-divider" className="relative h-px bg-outline-variant/40 mx-1 z-20">
            <button
              type="button"
              onClick={swap}
              aria-label="Scambia partenza e destinazione"
              className="group absolute right-7 top-1/2 -translate-y-1/2 w-11 h-11 flex items-center justify-center text-primary"
            >
              {/* Gira di mezzo giro (transition-transform duration-300) al passaggio del mouse e alla pressione. */}
              <span className="w-8 h-8 rounded-full bg-surface-container-lowest shadow-sm border border-outline-variant/40 flex items-center justify-center transition-transform duration-300 group-hover:rotate-180 group-active:rotate-180 group-hover:bg-primary-fixed/30 group-hover:text-primary motion-reduce:transition-none">
                <SwapIcon className="w-4 h-4" />
              </span>
            </button>
          </div>
          <AddressInput
            label="Destinazione"
            caption="A (Destinazione)"
            placeholder="Dove stai andando?"
            testId="destination-input"
            text={destination.text}
            onTextChange={(text) => setDestination({ text, place: null })}
            place={destination.place}
            suggestions={!destination.fromHistory}
            onPlaceSelect={(place) => setDestination({ text: place.label, place })}
            proximity={userLocation}
            leading={<span className="block w-3 h-3 rounded-full bg-secondary" />}
          />
        </div>
        {locationError && (
          <p role="alert" className="-mt-space-md text-body-sm font-body-sm text-error">
            {locationError}
          </p>
        )}
        {resolving && (
          <p role="status" className="-mt-space-md flex items-center gap-space-sm text-body-sm font-body-sm text-on-surface-variant">
            <SpinnerIcon className="w-4 h-4" /> Ritrovo i luoghi del tragitto…
          </p>
        )}
        {resolveError && (
          <p role="alert" data-testid="resolve-error" className="-mt-space-md text-body-sm font-body-sm text-error">
            {resolveError}
          </p>
        )}

        <div className="flex flex-col gap-space-sm">
          <span className="text-label-sm font-label-sm font-semibold text-on-surface">Carburante</span>
          <FuelChips value={fuelType} onChange={setFuelType} />
        </div>

        <Stepper label="Litri" value={liters} unit="L" {...LITERS_RANGE} onChange={setLiters} />

        <div className="flex flex-col gap-space-sm">
          <span className="text-label-sm font-label-sm font-semibold text-on-surface">Consumo veicolo</span>
          <ConsumptionStepper value={consumption} profile={settings.consumptionKmPerLiter} unit={settings.consumptionUnit} onChange={setConsumption} />
        </div>

        <div className="flex flex-col gap-space-sm">
          <div className="flex items-center justify-between">
            <label htmlFor="max-detour" className="text-label-sm font-label-sm font-semibold text-on-surface">
              Deviazione massima
            </label>
            <output htmlFor="max-detour" className="rounded-full bg-secondary/10 text-on-secondary-fixed-variant px-space-md py-space-xs text-label-lg font-label-lg tabular-nums">
              {maxDetourKm} km
            </output>
          </div>
          <RangeInput id="max-detour" {...DETOUR_RANGE} value={maxDetourKm} onChange={(event) => setMaxDetourKm(Number(event.target.value))} />
          <p className="text-body-sm font-body-sm text-on-surface-variant">Km extra totali (andata e ritorno) rispetto al percorso diretto.</p>
        </div>

        <div className="flex flex-col gap-space-lg">
          <ToggleRow label="Solo Self" description="Se disattivato include anche le stazioni solo servito." checked={onlySelf} onChange={setOnlySelf} />
          <ToggleRow
            label="Evita autostrada"
            description="Percorso e deviazioni senza autostrada. Il pedaggio non rientra nel calcolo."
            checked={avoidMotorway}
            onChange={setAvoidMotorway}
          />
        </div>
      </div>

      {/* Pulsante fisso in fondo al foglio, con sfumatura verso la superficie. */}
      <div className="shrink-0 bg-gradient-to-t from-surface-container-lowest via-surface-container-lowest/95 to-transparent px-space-xl pt-space-md pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))] flex flex-col gap-space-sm">
        <button
          type="submit"
          data-testid="search-submit"
          disabled={!ready || busy}
          className="h-12 rounded-full bg-primary-strong text-on-primary text-label-lg font-label-lg shadow-lg flex items-center justify-center gap-space-sm hover:brightness-95 active:scale-[0.99] transition disabled:opacity-50 disabled:hover:brightness-100"
        >
          {busy && <SpinnerIcon />}
          {busy ? "Cerco le stazioni…" : "Trova il carburante più conveniente"}
        </button>
        {!ready && !busy && (
          <p className="text-center text-body-sm font-body-sm text-on-surface-variant">Scegli partenza e destinazione dai suggerimenti per iniziare.</p>
        )}
      </div>
    </form>
  );
}

import type { RefinementInfo, StaleStationsInfo, StationResult } from "@tappafurba/shared";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useBottomSheet } from "../../hooks/useBottomSheet";
import type { SearchState } from "../../hooks/useSearch";
import { useStopRoute } from "../../hooks/useStopRoute";
import { formatPrice } from "../../lib/format";
import { launchNavigation } from "../../lib/navigation";
import { isNearbyResponse } from "../../lib/searchMode";
import { describeExclusions, type RouteExclusions } from "../../lib/routeOptions";
import { applyFilters, bestStationId, DEFAULT_SORT, fuelModeLabel, referenceLevelText, type SortMode } from "../../lib/stationView";
import { CheckIcon, InfoIcon, RouteIcon, SavingsIcon, SlidersIcon, SpinnerIcon } from "../icons";
import { brandLogoUrl } from "../../lib/brandLogos";
import type { MapStation } from "./MapCanvas";
import { MapView } from "./MapView";
import { NavigateSheet } from "./NavigateSheet";
import { PricesBanner } from "./PricesBanner";
import { ResultCard } from "./ResultCard";
import { RouteOptionsSheet } from "./RouteOptionsSheet";
import { TelemetryCapsule } from "./TelemetryCapsule";

type SuccessState = Extract<SearchState, { status: "success" }>;

/** Nessun tracciato da disegnare («Intorno a me»): un riferimento fisso, così la mappa non si ridisegna a ogni rendering. */
const EMPTY_GEOMETRY: ReadonlyArray<[number, number]> = [];

/** Schede mostrate subito: l'elenco completo resta a un tap ("Mostra altre"), la mappa e i filtri lavorano sempre su tutte. */
export const INITIAL_CARDS = 20;

const SORTS: ReadonlyArray<{ mode: SortMode; label: string; title: string; Icon: typeof SavingsIcon }> = [
  { mode: "savings", label: "Più conveniente", title: "Risparmio netto maggiore per prime", Icon: SavingsIcon },
  { mode: "detour", label: "Minor deviazione", title: "Meno chilometri extra per prime (a pari km, la più vicina alla strada)", Icon: RouteIcon },
];

/** «Intorno a me»: non c'è un percorso da cui deviare, quindi il secondo ordinamento è per strada da fare. */
const NEARBY_SORTS: typeof SORTS = [
  SORTS[0]!,
  { mode: "detour", label: "Più vicina", title: "Meno strada per prime (giro andata e ritorno)", Icon: RouteIcon },
];

function Chip({
  active,
  disabled,
  onClick,
  small,
  children,
  title,
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  small?: boolean;
  children: React.ReactNode;
  title?: string;
}) {
  // DESIGN.md — Interactive States: attivo bg-primary/text-on-primary, inattivo bg-surface-container-low senza bordo.
  return (
    <button
      type="button"
      aria-pressed={active}
      disabled={disabled}
      title={title}
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-full shrink-0 whitespace-nowrap transition-colors disabled:cursor-not-allowed ${
        small ? "h-8 px-space-md text-label-sm font-label-sm" : "h-9 px-space-lg text-label-md font-label-md"
      } ${active ? "bg-primary-strong text-on-primary shadow-sm" : "bg-surface-container-low text-on-surface-variant hover:text-on-surface"} ${
        disabled ? (active ? "opacity-80" : "opacity-50") : ""
      }`}
    >
      {children}
    </button>
  );
}

function RefinementNotice({ refinement, nearby = false }: { refinement: RefinementInfo; nearby?: boolean }) {
  if (refinement.status === "done") return null;
  const pending = refinement.status === "pending";
  const what = nearby ? "distanze" : "deviazioni";
  return (
    <p role="status" className="flex items-center gap-space-sm text-body-sm font-body-sm text-on-surface-variant">
      {pending ? <SpinnerIcon className="w-4 h-4 text-secondary" /> : <InfoIcon className="w-4 h-4 text-outline" />}
      {pending
        ? `Calcolo le ${what} reali delle migliori stazioni…`
        : refinement.status === "skipped"
          ? `${nearby ? "Distanze stimate" : "Deviazioni stimate"} (il calcolo sul percorso reale è sospeso).`
          : `Calcolo non riuscito: ${nearby ? "le distanze sono stime approssimate" : "le deviazioni sono stime approssimate"}.`}
    </p>
  );
}

/**
 * «Intorno a me»: se nessuna stazione in elenco fa risparmiare rispetto al prezzo medio della zona (il giro costa più dello
 * sconto) lo si dice, invece di lasciare una classifica tutta «Non conviene». L'elenco resta sotto, ordinato come sempre.
 */
function NoSavingsNotice({ results }: { results: readonly StationResult[] }) {
  if (results.length === 0 || results.some((r) => r.netSavings > 0)) return null;
  return (
    <p data-testid="no-savings-notice" role="status" className="flex items-start gap-space-sm text-body-sm font-body-sm text-on-surface-variant">
      <InfoIcon className="w-4 h-4 text-outline shrink-0 mt-0.5" />
      <span>Nessuna stazione conviene rispetto al prezzo medio della zona: il tragitto costa più di quanto si risparmia. In cima all'elenco c'è comunque la migliore.</span>
    </p>
  );
}

/**
 * Stazioni scartate SOLO perché il prezzo non è aggiornato da più di X ore (né comunicato né confermato dalla fonte).
 * Discreto (una riga, come gli altri avvisi): il numero è quello del server, l'azione porta alla soglia nelle Impostazioni. Non compare a zero.
 */
function StaleStationsNotice({ info, onOpenSettings }: { info: StaleStationsInfo | undefined; onOpenSettings?: () => void }) {
  if (!info || info.count <= 0) return null;
  return (
    <p data-testid="stale-notice" role="status" className="flex flex-wrap items-center gap-x-space-sm gap-y-0.5 text-body-sm font-body-sm text-on-surface-variant">
      <InfoIcon className="w-4 h-4 text-outline shrink-0" />
      <span>
        {info.count === 1 ? "1 stazione non mostrata" : `${info.count} stazioni non mostrate`}: prezzo non aggiornato da più di {info.maxAgeHours} h
      </span>
      {onOpenSettings && (
        <button type="button" onClick={onOpenSettings} className="underline underline-offset-2 text-on-primary-fixed-variant font-medium hover:text-on-surface transition-colors">
          Cambia soglia
        </button>
      )}
    </p>
  );
}

/**
 * Screen 2 — Risultati & Mappa. Mappa sopra (40% dell'altezza) e bottom sheet con filtri e schede sotto; su schermi
 * larghi il foglio diventa una barra laterale sopra la mappa. Ordinamento e filtri sono solo client-side.
 *
 * Su mobile il foglio è ancorato al fondo dello schermo (dietro la barra inferiore, senza spazio morto) ed è
 * trascinabile dalla maniglia tra due punti: chiuso (come prima, sotto la mappa) ed espanso (~85% dello schermo).
 * Vedi `useBottomSheet` e `lib/sheetSnap.ts`.
 */
export function ResultsScreen({
  state,
  onOpenStation,
  routeDefaults,
  onApplyRouteOptions,
  onOpenFreshnessSettings,
  searching = false,
}: {
  state: SuccessState;
  onOpenStation: (result: StationResult) => void;
  /** Default delle Impostazioni per le opzioni percorso («Reimposta» nel foglio). */
  routeDefaults: RouteExclusions;
  /** «Applica» nel foglio Opzioni percorso: rilancia la ricerca con lo stesso A/B e le nuove esclusioni. */
  onApplyRouteOptions: (exclusions: RouteExclusions) => void;
  /** «Cambia soglia» nell'avviso delle stazioni escluse per età del prezzo: porta alla soglia nelle Impostazioni. */
  onOpenFreshnessSettings?: () => void;
  /** Una ricerca è in corso (rilanciata da qui): si resta sui risultati precedenti finché arrivano i nuovi. */
  searching?: boolean;
}) {
  const { response, results, refinement, request, labels } = state;
  const nearby = isNearbyResponse(response);
  const sorts = nearby ? NEARBY_SORTS : SORTS;
  // Punto di partenza di «Intorno a me», stabile tra i rendering (la mappa si riadatta solo se cambia davvero).
  const nearbyLon = nearby ? response.nearby.origin.lon : null;
  const nearbyLat = nearby ? response.nearby.origin.lat : null;
  const center = useMemo<readonly [number, number] | null>(() => (nearbyLon !== null && nearbyLat !== null ? [nearbyLon, nearbyLat] : null), [nearbyLon, nearbyLat]);

  const [sort, setSort] = useState<SortMode>(DEFAULT_SORT);
  // Se la ricerca era già limitata ai soli Self non c'è nulla da aggiungere lato client: la pill resta attiva e bloccata.
  const [onlySelf, setOnlySelf] = useState(request.onlySelf);
  const [motorwayOnly, setMotorwayOnly] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [navigating, setNavigating] = useState<StationResult | null>(null);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [shown, setShown] = useState(INITIAL_CARDS);
  const selectionFromMap = useRef(false);
  const mainRef = useRef<HTMLElement>(null);
  const sheetRef = useRef<HTMLElement>(null);
  const footerRef = useRef<HTMLDivElement>(null);
  const sheet = useBottomSheet({ containerRef: mainRef, sheetRef, footerRef, resetKey: response.searchId });
  const expanded = sheet.snap === "expanded";
  // Foglio ridotto a riposo: elenco e banner non si vedono (e non si raggiungono con Tab); resta la maniglia. Il nascondimento
  // scatta a fine aggancio (ritardo = durata della transizione), il ritorno è immediato.
  const hiddenContent = sheet.contentHidden ? "invisible transition-[visibility] duration-0 delay-200 motion-reduce:delay-0" : "";

  // Una nuova ricerca riparte da filtri puliti.
  useEffect(() => {
    setSort(DEFAULT_SORT);
    setOnlySelf(request.onlySelf);
    setMotorwayOnly(false);
    setSelectedId(null);
    setShown(INITIAL_CARDS);
  }, [response.searchId, request.onlySelf]);

  // Con «Evita autostrada» la pill «Autostrada» non ha senso (nessun percorso usa l'autostrada): resta spenta. Nessun
  // auto-disable per «Evita pedaggi»: il filtro «Tipo impianto» non dipende dal tracciato.
  const motorwayFilter = motorwayOnly && !request.avoidMotorway;
  useEffect(() => {
    if (request.avoidMotorway) setMotorwayOnly(false);
  }, [request.avoidMotorway]);

  const visible = useMemo(() => applyFilters(results, { sort, onlySelf, motorwayOnly: motorwayFilter }), [results, sort, onlySelf, motorwayFilter]);
  const bestId = useMemo(() => bestStationId(visible), [visible]);
  // Percorso A→stazione→B della stazione selezionata; resta null se il routing non è disponibile.
  const stopRoute = useStopRoute(response.searchId, selectedId);

  // Se un filtro nasconde la stazione selezionata, la selezione (e il suo percorso) decade.
  useEffect(() => {
    if (selectedId !== null && !visible.some((r) => r.station.id === selectedId)) setSelectedId(null);
  }, [visible, selectedId]);

  const mapStations = useMemo<MapStation[]>(
    () =>
      visible.map((result) => ({
        id: result.station.id,
        lon: result.station.lon,
        lat: result.station.lat,
        priceLabel: `€${formatPrice(result.price)}`,
        ariaLabel: `${result.station.nomeImpianto}, ${fuelModeLabel(request.fuelType, result.isSelf)}, ${formatPrice(result.price)} euro al litro`,
        best: result.station.id === bestId,
        logoUrl: brandLogoUrl(result.station.bandiera),
      })),
    [visible, bestId, request.fuelType],
  );

  // Toccare una scheda la seleziona (pin evidenziato e percorso con sosta); toccarla di nuovo la deseleziona.
  // Il dettaglio della stazione (Screen 3) si apre solo da «Info».
  const selectFromCard = useCallback((id: number) => {
    selectionFromMap.current = false;
    setSelectedId((current) => (current === id ? null : id));
  }, []);

  const deselect = useCallback(() => setSelectedId(null), []);

  const selectFromMap = useCallback(
    (id: number) => {
      selectionFromMap.current = true;
      setSelectedId((current) => (current === id ? null : id));
      // Il pin può riguardare una stazione oltre le schede mostrate: le si mostra fino a quella.
      const index = visible.findIndex((r) => r.station.id === id);
      if (index >= 0) setShown((count) => Math.max(count, index + 1));
    },
    [visible],
  );

  // Un tap su un pin porta la scheda in vista nell'elenco.
  useEffect(() => {
    if (selectedId === null || !selectionFromMap.current) return;
    document.getElementById(`station-${selectedId}`)?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
  }, [selectedId]);

  const closeNavigation = useCallback(() => setNavigating(null), []);

  const navigate = useCallback((result: StationResult) => {
    const target = { name: result.station.nomeImpianto, lat: result.station.lat, lon: result.station.lon };
    if (!launchNavigation(target)) setNavigating(result); // desktop o piattaforma sconosciuta: menu con Google Maps, Apple Maps e Waze
  }, []);

  const resetFilters = () => {
    setSort(DEFAULT_SORT);
    setOnlySelf(request.onlySelf);
    setMotorwayOnly(false);
    setShown(INITIAL_CARDS);
  };

  const hasFilters = motorwayFilter || (onlySelf && !request.onlySelf);
  const exclusions: RouteExclusions = { avoidMotorway: request.avoidMotorway, avoidTolls: request.avoidTolls, avoidFerries: request.avoidFerries };
  const exclusionsText = describeExclusions(exclusions);

  return (
    <main ref={mainRef} className="fixed inset-x-0 top-[calc(72px+env(safe-area-inset-top,0px))] bottom-0 bg-surface-container-high">
      {/* Mappa: 40% dell'altezza su mobile (il foglio espanso la copre in parte, mai del tutto); quando il foglio scende sotto
          «chiuso» si allunga fino a lui, così da riempire tutto lo spazio rimasto; a tutta pagina su schermi larghi. `isolate`
          crea uno stacking context: i pin (z-index fino a 1000), la capsula e i comandi restano SOTTO l'elenco (z-20), mai sopra. */}
      <div
        data-testid="map-region"
        style={sheet.mapHeight === null ? undefined : ({ "--map-h": `${sheet.mapHeight}px` } as CSSProperties)}
        className="relative isolate w-full bg-surface-container-high overflow-hidden shadow-md h-[var(--map-h,40vh)] min-h-[140px] transition-[height] duration-200 ease-out motion-reduce:transition-none md:absolute md:inset-0 md:h-auto md:transition-none"
      >
        <MapView
          geometry={nearby ? EMPTY_GEOMETRY : response.route.geometry}
          center={center}
          radiusKm={nearby ? response.nearby.radiusKm : undefined}
          stations={mapStations}
          selectedId={selectedId}
          stopRoute={stopRoute}
          onSelectStation={selectFromMap}
          onDeselect={deselect}
        />
        <TelemetryCapsule
          origin={labels.origin}
          destination={labels.destination}
          distanceKm={nearby ? 0 : response.route.distanceKm}
          durationMinutes={nearby ? 0 : response.route.durationMinutes}
          stationCount={visible.length}
          radiusKm={nearby ? response.nearby.radiusKm : undefined}
        />
      </div>

      {/* Mobile: ancorato al fondo dello schermo, l'altezza la decide `useBottomSheet` (`--sheet-h`; prima della misura vale il
          ripiego in CSS = punto chiuso). Dietro la barra inferiore: il fondo (banner dei prezzi) tiene lo spazio della barra. */}
      <section
        ref={sheetRef}
        aria-label={nearby ? "Stazioni intorno a te" : "Stazioni lungo il percorso"}
        data-testid="bottom-sheet"
        data-snap={sheet.snap}
        data-dragging={sheet.dragging}
        style={sheet.height === null ? undefined : ({ "--sheet-h": `${sheet.height}px` } as CSSProperties)}
        className={`absolute inset-x-0 bottom-0 z-20 flex flex-col bg-surface-container-lowest rounded-t-3xl shadow-lg h-[var(--sheet-h,calc(100%_-_40vh_+_12px))] ${
          sheet.dragging ? "transition-none" : "transition-[height] duration-200 ease-out motion-reduce:transition-none"
        } md:inset-x-auto md:left-space-lg md:top-space-lg md:bottom-28 md:w-[440px] md:h-auto md:rounded-3xl md:transition-none md:backdrop-blur-md`}
      >
        {/* Testata: maniglia + striscia che la contiene (alta 18 px come prima; l'area che risponde al dito è più ampia grazie
            al pseudo-elemento). Il trascinamento parte solo da qui; l'elenco sotto scorre da sé. */}
        <div
          data-testid="sheet-header"
          {...sheet.headerHandlers}
          onClick={sheet.onToggleClick}
          className="relative shrink-0 h-[18px] flex justify-center items-center touch-none select-none cursor-grab active:cursor-grabbing before:absolute before:inset-x-0 before:-top-2 before:-bottom-3 md:hidden"
        >
          <button
            type="button"
            data-testid="sheet-handle"
            aria-label={expanded ? "Comprimi elenco stazioni" : "Espandi elenco stazioni"}
            aria-expanded={sheet.snap !== "minimized"}
            className="relative z-10 h-full px-space-xl flex items-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary/60"
          >
            <span className="block w-10 h-1.5 rounded-full bg-outline-variant/60" />
          </button>
        </div>

        {/* Solo questa area scorre: la mappa resta ferma. */}
        <div data-testid="sheet-scroll" className={`flex-1 min-h-0 overflow-y-auto no-scrollbar px-gutter pb-space-lg flex flex-col gap-space-md ${hiddenContent}`}>
          <div className="flex flex-col gap-space-sm pt-space-xs md:pt-space-lg">
            <div role="group" aria-label="Ordina per" className="flex items-center gap-space-sm overflow-x-auto no-scrollbar py-0.5">
              {sorts.map(({ mode, label, title, Icon }) => (
                <Chip key={mode} active={sort === mode} title={title} onClick={() => setSort(mode)}>
                  <Icon className="w-4 h-4" />
                  {label}
                </Chip>
              ))}
            </div>
            <div role="group" aria-label="Filtri" className="flex items-center gap-space-sm overflow-x-auto no-scrollbar py-0.5">
              <Chip
                small
                active={onlySelf}
                disabled={request.onlySelf}
                title={request.onlySelf ? "La ricerca include già solo le stazioni con il Self" : undefined}
                onClick={() => setOnlySelf((value) => !value)}
              >
                {onlySelf && <CheckIcon className="w-3.5 h-3.5" />}
                Solo Self
              </Chip>
              <Chip
                small
                active={motorwayFilter}
                disabled={request.avoidMotorway}
                title={request.avoidMotorway ? "Non disponibile con Evita autostrada" : undefined}
                onClick={() => setMotorwayOnly((value) => !value)}
              >
                {motorwayFilter && <CheckIcon className="w-3.5 h-3.5" />}
                Autostrada
              </Chip>
              <button
                type="button"
                data-testid="route-options-chip"
                aria-haspopup="dialog"
                disabled={searching}
                onClick={() => setOptionsOpen(true)}
                title={
                  exclusionsText
                    ? "Le deviazioni sono misurate contro il percorso diretto con le stesse opzioni (il pedaggio non rientra nel calcolo)"
                    : "Evita autostrade, pedaggi o traghetti"
                }
                className={`shrink-0 whitespace-nowrap flex items-center gap-1.5 h-8 px-space-md rounded-full text-label-md font-label-md transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                  exclusionsText ? "bg-secondary/10 text-on-secondary-fixed-variant" : "bg-surface-container-low text-on-surface-variant hover:text-on-surface"
                }`}
              >
                <SlidersIcon className="w-4 h-4" />
                Opzioni percorso{exclusionsText ? ` · ${exclusionsText}` : ""}
              </button>
            </div>
            <RefinementNotice refinement={refinement} nearby={nearby} />
            <StaleStationsNotice info={response.staleStations} onOpenSettings={onOpenFreshnessSettings} />
            {searching && (
              <p role="status" className="flex items-center gap-space-sm text-body-sm font-body-sm text-on-surface-variant">
                <SpinnerIcon className="w-4 h-4 text-secondary" />
                Ricalcolo con le nuove opzioni…
              </p>
            )}
            <p data-testid="reference-price" className="text-body-sm font-body-sm text-on-surface-variant tabular-nums">
              Prezzo di riferimento €{formatPrice(response.referencePrice.value)}/L ({referenceLevelText(response.referencePrice.level, response.referencePrice.sampleSize, nearby)})
            </p>
            {nearby && <NoSavingsNotice results={visible} />}
          </div>

          {visible.length === 0 ? (
            <div role="status" className="rounded-lg bg-surface-container-low p-space-xl text-center flex flex-col items-center gap-space-md">
              <p className="text-headline-sm font-headline-sm text-on-surface">
                {results.length === 0 ? (nearby ? "Nessuna stazione nel raggio di ricerca" : "Nessuna stazione conveniente sul percorso") : "Nessuna stazione con questi filtri"}
              </p>
              <p className="text-body-sm font-body-sm text-on-surface-variant">
                {results.length === 0
                  ? nearby
                    ? "Prova ad aumentare il raggio di ricerca, a cambiare carburante o a disattivare «Solo Self» nella ricerca."
                    : "Prova ad aumentare la deviazione massima, a cambiare carburante o a disattivare «Solo Self» nella ricerca."
                  : "Cambia i filtri per vedere le altre stazioni."}
              </p>
              {results.length > 0 && hasFilters && (
                <button type="button" onClick={resetFilters} className="h-9 px-space-xl rounded-full bg-primary-strong text-on-primary text-label-lg font-label-lg">
                  Azzera i filtri
                </button>
              )}
            </div>
          ) : (
            <ol aria-label="Elenco stazioni" className="flex flex-col gap-space-md">
              {visible.slice(0, shown).map((result) => (
                <ResultCard
                  key={result.station.id}
                  result={result}
                  fuelType={request.fuelType}
                  best={result.station.id === bestId}
                  selected={result.station.id === selectedId}
                  onSelect={selectFromCard}
                  onInfo={onOpenStation}
                  onNavigate={navigate}
                  nearby={nearby}
                />
              ))}
            </ol>
          )}

          {visible.length > shown && (
            <button
              type="button"
              onClick={() => setShown((count) => count + INITIAL_CARDS)}
              className="self-center h-10 px-space-xl rounded-full bg-surface-container-low text-on-surface text-label-lg font-label-lg hover:text-on-primary-fixed-variant transition-colors shrink-0"
            >
              Mostra altre {Math.min(INITIAL_CARDS, visible.length - shown)} stazioni ({visible.length - shown} rimaste)
            </button>
          )}
        </div>

        <div ref={footerRef} data-testid="sheet-footer" className={`shrink-0 pb-[var(--bottom-nav-clearance)] md:pb-0 ${hiddenContent}`}>
          <PricesBanner livePrices={response.livePrices} dailyFileAt={response.pricesUpdatedAt} />
        </div>
      </section>

      {optionsOpen && (
        <RouteOptionsSheet
          current={exclusions}
          defaults={routeDefaults}
          onApply={(next) => {
            setOptionsOpen(false);
            onApplyRouteOptions(next);
          }}
          onClose={() => setOptionsOpen(false)}
        />
      )}

      {navigating && (
        <NavigateSheet
          station={navigating.station}
          summary={{ price: navigating.price, modeLabel: fuelModeLabel(request.fuelType, navigating.isSelf), netSavings: navigating.netSavings }}
          onClose={closeNavigation}
        />
      )}
    </main>
  );
}

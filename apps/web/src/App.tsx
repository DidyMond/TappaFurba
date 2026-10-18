import type { StationResult } from "@tappafurba/shared";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { BottomNav } from "./components/BottomNav";
import { Header } from "./components/Header";
import { InstallBanner } from "./components/InstallBanner";
import { OfflineNotice } from "./components/OfflineNotice";
import { ResultsScreen } from "./components/results/ResultsScreen";
import { HomeScreen } from "./components/home/HomeScreen";
import { PrivacyScreen } from "./components/privacy/PrivacyScreen";
import { SettingsScreen } from "./components/settings/SettingsScreen";
import { StationDetailDialog } from "./components/station/StationDetailDialog";
import { StationDetailScreen } from "./components/station/StationDetailScreen";
import { useIsDesktop } from "./hooks/useMediaQuery";
import { useSearch } from "./hooks/useSearch";
import { SettingsProvider, useSettings } from "./hooks/useSettings";
import { PRIVACY_PATH } from "./lib/links";
import { recordRecentRoute } from "./lib/recentRoutes";
import type { RouteExclusions } from "./lib/routeOptions";

export default function App() {
  return (
    <SettingsProvider>
      <AppShell />
    </SettingsProvider>
  );
}

function AppShell() {
  const { state, search } = useSearch();
  const { settings, rememberAutomaticReference } = useSettings();
  const navigate = useNavigate();
  const { pathname, state: locationState } = useLocation();

  // Ogni nuova ricerca riuscita porta alla schermata Risultati. Gli aggiornamenti successivi (verifica del routing)
  // non cambiano searchId, quindi non ri-navigano.
  const lastNavigatedSearch = useRef<string | null>(null);
  useEffect(() => {
    if (state.status !== "success" || state.response.searchId === lastNavigatedSearch.current) return;
    lastNavigatedSearch.current = state.response.searchId;
    navigate("/results");
  }, [state, navigate]);

  // L'ultimo prezzo di riferimento AUTOMATICO di ogni carburante serve a pre-compilare «Manuale» nelle Impostazioni.
  const successId = state.status === "success" ? state.response.searchId : null;
  useEffect(() => {
    if (state.status !== "success" || state.response.referencePrice.level === "manual") return;
    rememberAutomaticReference(state.request.fuelType, state.response.referencePrice.value);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- un solo avvio per ricerca.
  }, [successId]);

  // Ogni ricerca riuscita alimenta «Tragitti frequenti» (storico sul dispositivo, vedi lib/recentRoutes).
  useEffect(() => {
    if (state.status !== "success") return;
    // Solo testi e flag «posizione attuale»: nessuna coordinata (vedi lib/recentRoutes).
    recordRecentRoute({
      origin: { text: state.labels.origin, ...(state.labels.originCurrent ? { current: true as const } : {}) },
      destination: { text: state.labels.destination, ...(state.labels.destinationCurrent ? { current: true as const } : {}) },
      fuelType: state.request.fuelType,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- un solo avvio per ricerca.
  }, [successId]);

  // Mentre il server cerca si scarica già il codice della mappa (chunk separato): compare prima sui Risultati.
  const searching = state.status === "loading";
  useEffect(() => {
    if (searching) void import("./components/results/MapCanvas");
  }, [searching]);

  // Rilanciando la ricerca dai Risultati («Opzioni percorso» → Applica) si resta sui risultati precedenti finché
  // arrivano i nuovi: lo stato passa da «loading» ma la schermata non sparisce.
  const lastSuccess = useRef<Extract<typeof state, { status: "success" }> | null>(null);
  if (state.status === "success") lastSuccess.current = state;
  const resultsState = state.status === "success" ? state : state.status === "loading" ? lastSuccess.current : null;

  const routeDefaults = useMemo<RouteExclusions>(
    () => ({ avoidMotorway: settings.avoidMotorway, avoidTolls: settings.avoidTolls, avoidFerries: settings.avoidFerries }),
    [settings.avoidMotorway, settings.avoidTolls, settings.avoidFerries],
  );
  // Dall'avviso dei Risultati alla soglia di freschezza (si apre la sezione e si porta il cursore sul campo).
  const openFreshnessSettings = useCallback(() => navigate("/settings", { state: { focus: "freshness" } }), [navigate]);
  const applyRouteOptions = useCallback(
    (exclusions: RouteExclusions) => {
      if (state.status !== "success") return;
      void search({ ...state.request, ...exclusions }, state.labels);
    },
    [state, search],
  );

  const onHome = pathname === "/";
  const onStation = pathname.startsWith("/station/");
  const searchId = state.status === "success" ? state.response.searchId : null;

  // Su desktop (≥1024 px), con i risultati in memoria, «Info» apre il dettaglio in un DIALOGO sopra i Risultati, senza cambiare
  // rotta. Su mobile, o senza risultati vivi (indirizzo diretto), resta la schermata a pagina intera su /station/:searchId/:stationId.
  const desktop = useIsDesktop();
  const resultsSearchId = resultsState?.response.searchId ?? null;
  const [dialog, setDialog] = useState<{ searchId: string; stationId: number } | null>(null);
  const openStation = useCallback(
    (result: StationResult) => {
      if (desktop && resultsSearchId) setDialog({ searchId: resultsSearchId, stationId: result.station.id });
      else navigate(`/station/${searchId}/${result.station.id}`);
    },
    [navigate, searchId, desktop, resultsSearchId],
  );
  const closeDialog = useCallback(() => setDialog(null), []);
  // Il dialogo vive solo sui Risultati della ricerca per cui è stato aperto, su desktop.
  useEffect(() => {
    if (dialog && (pathname !== "/results" || !desktop || dialog.searchId !== resultsSearchId)) setDialog(null);
  }, [dialog, pathname, desktop, resultsSearchId]);

  return (
    <div className="bg-surface font-body-md text-on-surface flex flex-col min-h-screen relative overflow-x-hidden">
      {/* Le schermate a pila (dettaglio stazione) hanno il proprio header e niente barra inferiore. */}
      {!onStation && <Header transparentAtTop={onHome} wide={pathname !== "/results"} />}

      {/* La Home resta montata (solo nascosta) sulle altre schermate, così il form conserva i valori inseriti. */}
      <main className={`flex-1 w-full bg-surface pt-24 pb-28 px-margin gap-space-xl max-w-md mx-auto lg:max-w-4xl xl:max-w-6xl 2xl:max-w-7xl lg:px-8 ${onHome ? "flex flex-col lg:justify-center" : "hidden"}`}>
        <InstallBanner />
        <OfflineNotice />
        <HomeScreen onSubmit={search} busy={state.status === "loading"} error={state.status === "error" ? state.error : null} />
        <Link to={PRIVACY_PATH} data-testid="home-privacy-link" className="self-center mt-auto pt-space-lg text-label-md font-label-md text-on-surface-variant underline underline-offset-2 hover:text-on-surface">
          Privacy e note legali
        </Link>
      </main>

      {/* Anche i Risultati restano montati (nascosti) sul dettaglio stazione: tornando indietro ordinamento, filtri,
          selezione e posizione della mappa sono quelli di prima. */}
      {resultsState && (pathname === "/results" || onStation) && (
        <div className={onStation ? "hidden" : ""}>
          <ResultsScreen
            state={resultsState}
            onOpenStation={openStation}
            routeDefaults={routeDefaults}
            onApplyRouteOptions={applyRouteOptions}
            onOpenFreshnessSettings={openFreshnessSettings}
            searching={state.status === "loading"}
          />
        </div>
      )}

      <Routes>
        <Route path="/" element={null} />
        <Route path="/results" element={resultsState ? null : <Navigate to="/" replace />} />
        <Route path="/station/:searchId/:stationId" element={<StationDetailScreen />} />
        <Route path="/settings" element={<SettingsScreen focusFreshness={(locationState as { focus?: string } | null)?.focus === "freshness"} />} />
        <Route path={PRIVACY_PATH} element={<PrivacyScreen />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      {dialog && <StationDetailDialog key={`${dialog.searchId}:${dialog.stationId}`} searchId={dialog.searchId} stationId={dialog.stationId} onClose={closeDialog} />}

      {!onStation && <BottomNav hasResults={resultsState !== null} />}
    </div>
  );
}

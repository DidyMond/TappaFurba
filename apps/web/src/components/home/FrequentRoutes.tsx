import { useIsWide } from "../../hooks/useMediaQuery";
import { FUEL_OPTIONS } from "../../lib/defaults";
import { formatLastUsed } from "../../lib/format";
import { RECENT_ROUTES_SHOWN, RECENT_ROUTES_SHOWN_WIDE, type RecentEndpoint, type RecentRoute } from "../../lib/recentRoutes";
import { shortPlaceName } from "../../lib/stationView";
import { ChevronRightIcon, HistoryIcon, NavigateIcon } from "../icons";

interface FrequentRoutesProps {
  routes: RecentRoute[];
  onPick: (route: RecentRoute) => void;
  /** Layout desktop: conteggio «N salvati» nell'intestazione e icona a sinistra di ogni scheda. */
  desktop?: boolean;
  /** Per i test: il «adesso» con cui si scrive «oggi»/«ieri». */
  now?: number;
}

/** Nome breve del tragitto: «Città di Prova → Borgo Campione»; se i due comuni coincidono, la via di ciascuno. */
export function routeTitle(route: RecentRoute): string {
  const short = (endpoint: RecentEndpoint) => (endpoint.current ? endpoint.text : shortPlaceName(endpoint.text));
  const from = short(route.origin);
  const to = short(route.destination);
  if (from !== to) return `${from} → ${to}`;
  const street = (endpoint: RecentEndpoint) => endpoint.text.split(",")[0]!.trim();
  return `${street(route.origin)} → ${street(route.destination)}`;
}

/**
 * «Tragitti frequenti»: i tragitti più cercati (fino a tre), dallo storico del dispositivo. Ogni scheda ha
 * SOLO ciò che lo storico conserva: l'etichetta del tragitto, il carburante e la data dell'ultimo uso (niente km, uscite
 * o risparmi: non sono salvati). Un tap precompila il foglio di ricerca. Senza storico resta un riquadro discreto.
 */
export function FrequentRoutes({ routes, onPick, desktop = false, now }: FrequentRoutesProps) {
  // Da 2xl (Full HD) la colonna ha più spazio: fino a sei schede, su due colonne se sono almeno quattro.
  const wide = useIsWide() && desktop;
  const shown = routes.slice(0, wide ? RECENT_ROUTES_SHOWN_WIDE : RECENT_ROUTES_SHOWN);
  const twoColumns = wide && shown.length >= 4;
  return (
    <section aria-labelledby="frequent-routes-title" className="flex flex-col gap-space-md pt-space-xs">
      <div className="flex items-center justify-between px-0.5">
        <div className="flex items-center gap-space-sm">
          <span className="w-6 h-6 rounded-md bg-primary/10 text-on-primary-fixed-variant flex items-center justify-center">
            <HistoryIcon className="w-4 h-4" />
          </span>
          <h2 id="frequent-routes-title" className="text-headline-sm font-headline-sm font-bold text-on-surface">
            Tragitti frequenti
          </h2>
        </div>
        {desktop ? (
          <span data-testid="saved-count" className="text-label-md font-label-md font-semibold text-on-surface-variant tabular-nums">
            {routes.length} {routes.length === 1 ? "salvato" : "salvati"}
          </span>
        ) : (
          shown.length > 0 && <span className="text-label-sm font-label-sm text-on-surface-variant">Seleziona e cerca</span>
        )}
      </div>

      {shown.length === 0 ? (
        <p data-testid="frequent-routes-empty" className="rounded-2xl border border-dashed border-outline-variant/70 px-space-lg py-space-lg text-center text-body-sm font-body-sm text-on-surface-variant">
          Qui compariranno i tragitti che cerchi più spesso, per rifarli con un tocco.
        </p>
      ) : (
        <ul data-testid="frequent-routes-list" className={twoColumns ? "grid grid-cols-2 gap-3.5" : `flex flex-col ${desktop ? "gap-3.5" : "gap-space-sm"}`}>
          {shown.map((route) => {
            const fuel = FUEL_OPTIONS.find((option) => option.value === route.fuelType)?.label ?? "";
            const lastUsed = formatLastUsed(route.lastAt, now);
            return (
              <li key={route.id}>
                <button
                  type="button"
                  data-testid="frequent-route"
                  onClick={() => onPick(route)}
                  className="group w-full h-full text-left bg-surface-container-lowest border border-surface-container-high rounded-2xl p-space-lg shadow-xs hover:shadow-sm hover:border-primary/40 active:scale-[0.99] transition-all flex items-center justify-between gap-space-md"
                >
                  {desktop && (
                    <span aria-hidden="true" className="w-10 h-10 rounded-full bg-secondary/10 text-secondary flex items-center justify-center shrink-0 group-hover:bg-primary-strong group-hover:text-on-primary transition-colors">
                      <NavigateIcon className="w-5 h-5" />
                    </span>
                  )}
                  <span className="flex flex-col min-w-0 gap-1.5 flex-1">
                    <span className="text-body-md font-body-md font-bold text-on-surface line-clamp-2 break-words">{routeTitle(route)}</span>
                    <span data-testid="frequent-route-meta" className="text-body-sm font-body-sm text-on-surface-variant">
                      {fuel}
                      {lastUsed ? ` · ultimo uso ${lastUsed}` : ""}
                    </span>
                  </span>
                  <span aria-hidden="true" className="w-8 h-8 rounded-full bg-surface-container-low text-on-surface-variant flex items-center justify-center shrink-0">
                    <ChevronRightIcon className="w-[18px] h-[18px]" />
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

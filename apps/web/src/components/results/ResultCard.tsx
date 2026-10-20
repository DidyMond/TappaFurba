import type { SearchFuelType, StationResult } from "@tappafurba/shared";
import { formatDetourMinutes, formatEuro, formatKm, formatPrice, formatShortDate } from "../../lib/format";
import { fuelModeLabel } from "../../lib/stationView";
import { BrandAvatar } from "../BrandAvatar";
import { InfoIcon, NavigateIcon, RouteIcon, SavingsIcon, VerifiedIcon } from "../icons";

interface ResultCardProps {
  result: StationResult;
  fuelType: SearchFuelType;
  best: boolean;
  selected: boolean;
  /** Tap sulla scheda: seleziona la stazione (pin evidenziato e percorso con sosta sulla mappa). */
  onSelect: (id: number) => void;
  /** «Info»: apre il dettaglio della stazione (Screen 3). */
  onInfo: (result: StationResult) => void;
  onNavigate: (result: StationResult) => void;
  /**
   * «Intorno a me»: niente percorso. In alto si mostra la distanza di sola andata «a X km» (metà del giro, che è ciò che
   * conta nel risparmio) e nella riga in fondo il giro andata e ritorno al posto della posizione lungo il percorso.
   */
  nearby?: boolean;
}

/**
 * Card di una stazione (DESIGN.md — Station Recommendation Cards). L'intera card è cliccabile
 * (seleziona la stazione sulla mappa), quindi ammette l'elevazione in hover; Info (dettaglio) e Naviga sono
 * pulsanti propri e non propagano il click.
 */
export function ResultCard({ result, fuelType, best, selected, onSelect, onInfo, onNavigate, nearby = false }: ResultCardProps) {
  const { station } = result;
  const saves = result.netSavings > 0;
  const estimated = result.detourSource === "proxy";
  const approx = estimated ? "~" : "";
  const place = [station.indirizzo.trim(), station.comune].filter(Boolean).join(" · ");

  return (
    <li
      id={`station-${station.id}`}
      data-testid="station-card"
      data-station-id={station.id}
      aria-current={selected ? "true" : undefined}
      tabIndex={0}
      onClick={() => onSelect(station.id)}
      onKeyDown={(event) => {
        if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault();
          onSelect(station.id);
        }
      }}
      className={`relative rounded-lg bg-surface-container-lowest p-space-lg flex flex-col gap-space-md cursor-pointer transition-shadow outline-none focus-visible:ring-2 focus-visible:ring-secondary/60 hover:shadow-md ${
        best ? "shadow-md border-t-2 border-primary" : "shadow-sm border border-outline-variant/30"
      } ${selected ? "ring-2 ring-secondary/50" : ""}`}
    >
      <div className="flex items-center justify-between gap-space-sm">
        <div className="flex items-center gap-space-md min-w-0">
          <BrandAvatar bandiera={station.bandiera} gestore={station.gestore} size="card" best={best} />
          <div className="flex flex-col min-w-0">
            <div className="flex items-start gap-1.5 min-w-0">
              <h3 className="text-headline-sm font-headline-sm text-on-surface line-clamp-2 break-words min-w-0">{station.nomeImpianto}</h3>
              {best && (
                <span className="inline-flex items-center gap-1 h-[22px] px-1.5 rounded-full bg-primary-strong text-on-primary whitespace-nowrap shrink-0 text-label-sm font-label-sm">
                  <VerifiedIcon className="w-3 h-3" />
                  Migliore
                </span>
              )}
            </div>
            <span className="text-body-sm font-body-sm text-on-surface-variant truncate">{place}</span>
          </div>
        </div>

        <div className="flex flex-col items-end shrink-0 text-right">
          <span className={`text-numeric-stat font-numeric-stat tabular-nums leading-tight ${best ? "text-primary" : "text-on-surface"}`}>
            €{formatPrice(result.price)}
          </span>
          <span className="text-label-sm font-label-sm text-on-surface-variant leading-none">{fuelModeLabel(fuelType, result.isSelf)}</span>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-space-sm pt-space-sm border-t border-outline-variant/20">
        <span
          className="inline-flex items-center gap-1 h-[22px] px-space-md rounded-full bg-secondary/10 text-on-secondary-fixed-variant text-label-sm font-label-sm tabular-nums whitespace-nowrap"
          title={
            (nearby ? `Giro andata e ritorno ${approx}${formatKm(result.detourKm)}. ` : "") +
            (estimated ? "Stima approssimata, in attesa del calcolo sul percorso reale" : "Calcolato sul percorso reale")
          }
        >
          <RouteIcon className="w-3.5 h-3.5" />
          {nearby
            ? `a ${approx}${formatKm(result.detourKm / 2)} (${approx}${formatDetourMinutes(result.detourMinutes / 2)})`
            : `${approx}+${formatKm(result.detourKm)} (+${formatDetourMinutes(result.detourMinutes)})`}
        </span>

        <span
          className={`inline-flex items-center gap-1 h-[22px] px-space-md rounded-full text-label-sm font-label-sm tabular-nums whitespace-nowrap ${
            saves ? "bg-primary/10 text-on-primary-fixed-variant" : "bg-error-container text-on-error-container"
          }`}
        >
          <SavingsIcon className="w-3.5 h-3.5" />
          {saves ? "Risparmi" : "Non conviene"} {approx}
          {formatEuro(result.netSavings)}
        </span>
      </div>

      <p className="text-body-sm font-body-sm text-on-surface-variant tabular-nums">
        {result.servitoOnly && (
          <span className="mr-space-sm inline-flex items-center h-[18px] px-space-sm rounded-full bg-surface-container-high text-on-surface-variant text-label-sm font-label-sm">
            Solo servito
          </span>
        )}
        {station.tipoImpianto === "autostradale" && (
          <span className="mr-space-sm inline-flex items-center h-[18px] px-space-sm rounded-full bg-surface-container-high text-on-surface-variant text-label-sm font-label-sm">
            Autostrada
          </span>
        )}
        {nearby ? `Andata e ritorno ${approx}${formatKm(result.detourKm)}` : `A ${formatKm(result.alongRouteKm)} dalla partenza`} · prezzo del{" "}
        {formatShortDate(result.priceUpdatedAt)}
      </p>

      <div className="flex items-center justify-between w-full">
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onInfo(result);
          }}
          data-testid="station-info"
          aria-label={`Info su ${station.nomeImpianto}`}
          className="h-9 px-space-lg rounded-full bg-surface-container-low text-on-surface text-label-lg font-label-lg flex items-center gap-1.5 border border-transparent hover:border-primary hover:text-on-primary-fixed-variant transition-colors"
        >
          <InfoIcon className="w-4 h-4" />
          Info
        </button>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onNavigate(result);
          }}
          data-testid="station-navigate"
          aria-label={`Naviga verso ${station.nomeImpianto}`}
          className={`h-9 px-space-xl rounded-full text-label-lg font-label-lg flex items-center gap-1.5 active:scale-[0.98] transition ${
            best ? "bg-primary-strong text-on-primary shadow-sm hover:brightness-95" : "bg-primary/10 text-on-primary-fixed-variant hover:bg-primary/20"
          }`}
        >
          <NavigateIcon className="w-4 h-4" />
          Naviga
        </button>
      </div>
    </li>
  );
}

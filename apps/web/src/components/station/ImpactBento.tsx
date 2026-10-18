import type { StationDetailResponse } from "@tappafurba/shared";
import { formatDetourMinutes, formatEuro, formatKm, formatPrice, formatPriceDifference, formatSignedEuro, formatSignedPercent } from "../../lib/format";
import { referenceLevelText } from "../../lib/stationView";
import { RouteIcon, SavingsIcon } from "../icons";

/**
 * «Impatto sul tuo viaggio»: tre tile (deviazione, risparmio netto, differenza dal prezzo di riferimento). Ogni numero
 * arriva dal server (`computeStationDetail` in `packages/core`): qui si formatta soltanto. Il tile della deviazione dice
 * sempre da dove viene il dato: «Percorso calcolato» (servizio di percorsi di Mapbox) oppure «Stima approssimata» con la tilde; una
 * stima non si presenta mai come verificata.
 */
export function ImpactBento({ detail }: { detail: StationDetailResponse }) {
  const { detour, impact, referencePrice, liters } = detail;
  const estimated = detour.source === "proxy";
  const saves = impact.netSavings > 0;
  const cheaper = impact.priceDifferencePerLiter < 0;
  const approx = estimated ? "~" : "";

  const tile = "rounded p-space-md flex flex-col gap-space-xs min-w-0";
  const label = "text-label-md font-label-md flex items-center justify-between gap-1";

  return (
    <section aria-label="Impatto sul tuo viaggio" className="rounded-lg bg-surface-container-lowest shadow-md border border-outline-variant/30 p-space-lg flex flex-col gap-space-md">
      <h2 className="text-headline-sm font-headline-sm text-on-surface">Impatto sul tuo viaggio</h2>

      <div className="grid grid-cols-3 gap-space-sm">
        <div data-testid="tile-detour" className={`${tile} bg-surface-container-low`}>
          <span className={`${label} text-on-surface-variant`}>
            Deviazione
            <RouteIcon className="w-4 h-4 text-on-secondary-fixed-variant" />
          </span>
          <span className="text-headline-sm font-headline-sm tabular-nums text-on-surface">
            {approx}+{formatKm(detour.km)}
          </span>
          <span className="text-label-md font-label-md tabular-nums text-on-secondary-fixed-variant">
            {approx}+{formatDetourMinutes(detour.minutes)} guida
          </span>
          <span
            data-testid="detour-source"
            title={
              estimated
                ? "Stima approssimata: il percorso reale non è stato calcolato (servizio dei percorsi non disponibile), i valori sono indicativi"
                : "Deviazione calcolata sul percorso reale A→stazione→B con il servizio di percorsi di Mapbox"
            }
            className={`text-label-sm font-label-sm leading-tight break-words ${estimated ? "text-on-surface-variant" : "text-on-primary-fixed-variant"}`}
          >
            {estimated ? "Stima approssimata" : "Percorso calcolato"}
          </span>
        </div>

        <div
          data-testid="tile-savings"
          className={`${tile} ${saves ? "bg-on-primary-fixed-variant text-on-primary" : "bg-error-container text-on-error-container"}`}
        >
          <span className={label}>
            {saves ? "Risparmio" : "Non conviene"}
            <SavingsIcon className="w-4 h-4" />
          </span>
          <span className="text-headline-sm font-headline-sm tabular-nums">
            {approx}
            {formatSignedEuro(impact.netSavings)}
          </span>
          <span className="text-label-md font-label-md tabular-nums">su {liters} L</span>
        </div>

        <div data-testid="tile-differential" className={`${tile} bg-surface-container-low`}>
          <span className={`${label} text-on-surface-variant`}>vs Media</span>
          <span
            className={`text-headline-sm font-headline-sm tabular-nums ${cheaper ? "text-on-primary-fixed-variant" : "text-on-surface"}`}
          >
            {formatPriceDifference(impact.priceDifferencePerLiter)}
            <span className="text-label-md font-label-md text-on-surface-variant"> €/L</span>
          </span>
          <span className="text-label-md font-label-md tabular-nums text-on-surface-variant">{formatSignedPercent(impact.priceDifferencePercent)} medio</span>
        </div>
      </div>

      <p className="text-body-sm font-body-sm text-on-surface-variant tabular-nums">
        Riferimento €{formatPrice(referencePrice.value)}/L ({referenceLevelText(referencePrice.level, referencePrice.sampleSize)}). Risparmio lordo{" "}
        {formatEuro(impact.grossSavings)} − costo della deviazione {formatEuro(impact.detourCost)}.
      </p>
    </section>
  );
}

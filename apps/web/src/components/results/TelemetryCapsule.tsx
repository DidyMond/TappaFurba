import { formatDurationCompact } from "../../lib/format";
import { shortPlaceName } from "../../lib/stationView";
import { GasStationIcon, NavigateIcon } from "../icons";

interface TelemetryCapsuleProps {
  origin: string;
  destination: string;
  distanceKm: number;
  durationMinutes: number;
  stationCount: number;
}

/**
 * Capsula in alto sulla mappa: tratta, distanza, durata e stazioni trovate (DESIGN.md — Screen 2). Su schermi larghi
 * l'elenco è un pannello a sinistra (440 px + margine): la capsula sta in alto a destra, nella parte di mappa che resta
 * scoperta, larga quanto il suo contenuto e mai oltre lo spazio libero.
 */
export function TelemetryCapsule({ origin, destination, distanceKm, durationMinutes, stationCount }: TelemetryCapsuleProps) {
  return (
    <div className="absolute top-space-md inset-x-space-md md:inset-x-auto md:right-space-md md:max-w-[calc(100%-440px-3rem)] z-10 flex items-center justify-between gap-space-xs bg-surface-container-lowest/90 backdrop-blur-md pl-space-md pr-space-sm py-space-xs rounded-full md:max-lg:rounded-2xl shadow-md">
      {/* Tra 768 e 1023 px lo spazio a destra del pannello è stretto: la tratta sta su una riga e i dati sotto. */}
      <div className="flex items-center gap-1 min-w-0 md:max-lg:flex-wrap">
        <div className="flex items-center gap-1 min-w-0 md:max-lg:basis-full">
          <NavigateIcon className="w-[18px] h-[18px] text-secondary shrink-0" />
          <span
            title={`${shortPlaceName(origin)} → ${shortPlaceName(destination)}`}
            className="flex items-center gap-1 min-w-0 text-headline-sm font-headline-sm text-[12px] text-on-surface"
          >
            <span className="truncate min-w-0">{shortPlaceName(origin)}</span>
            <span aria-hidden="true" className="shrink-0">
              →
            </span>
            <span className="truncate min-w-0">{shortPlaceName(destination)}</span>
          </span>
        </div>
        <span aria-hidden="true" className="text-on-surface-variant text-body-sm shrink-0 md:max-lg:hidden">
          •
        </span>
        <span className="text-label-md font-label-md text-on-surface-variant tabular-nums shrink-0">{Math.round(distanceKm)} km</span>
        <span aria-hidden="true" className="text-on-surface-variant text-body-sm shrink-0">
          •
        </span>
        <span className="text-label-md font-label-md text-on-surface-variant tabular-nums shrink-0">{formatDurationCompact(durationMinutes)}</span>
      </div>
      <div className="flex items-center gap-1 bg-surface-container-high px-2 py-0.5 rounded-full shrink-0">
        <GasStationIcon className="w-[13px] h-[13px] text-primary" />
        <span className="text-label-sm font-label-sm text-on-primary-fixed-variant tabular-nums">{stationCount} staz.</span>
      </div>
    </div>
  );
}

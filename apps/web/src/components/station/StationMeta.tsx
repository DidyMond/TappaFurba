import type { StationSummary } from "@tappafurba/shared";
import { useEffect, useRef, useState } from "react";
import { copyText } from "../../lib/clipboard";
import { BrandAvatar } from "../BrandAvatar";
import { CopyIcon, PinIcon } from "../icons";

/** Indirizzo completo come si scrive su un'etichetta: «Via Roma 1, Bregnano (CO)». */
export function fullAddress(station: StationSummary): string {
  const street = station.indirizzo.trim().replace(/\s+/g, " ");
  const place = [station.comune.trim(), station.provincia.trim() && `(${station.provincia.trim()})`].filter(Boolean).join(" ");
  return [street, place].filter(Boolean).join(", ");
}

/**
 * Intestazione della stazione: iniziali del brand, nome, indirizzo completo con «Copia», pill del tipo di impianto
 * (a sinistra) e gestore (a destra, troncato). Solo dati presenti nei CSV MIMIT (bandiera, gestore, nome, indirizzo, tipo impianto):
 * niente uscita autostradale, orari, servizi, telefono o numero di pompe.
 */
export function StationMeta({ station }: { station: StationSummary }) {
  const address = fullAddress(station);
  const [copy, setCopy] = useState<"idle" | "copied" | "failed">("idle");
  const timer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(timer.current), []);

  const onCopy = async () => {
    setCopy((await copyText(address)) ? "copied" : "failed");
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopy("idle"), 2500);
  };

  return (
    <section aria-label="Stazione" className="rounded-lg bg-surface-container-lowest shadow-sm border border-outline-variant/30 p-space-lg flex flex-col gap-space-md">
      <div className="flex items-start gap-space-md">
        <BrandAvatar bandiera={station.bandiera} gestore={station.gestore} size="detail" />
        <div className="min-w-0 flex flex-col gap-space-xs">
          <h1 className="text-headline-md font-headline-md text-on-surface break-words">{station.nomeImpianto}</h1>
          {station.bandiera.trim() && <span className="text-body-sm font-body-sm text-on-surface-variant">{station.bandiera}</span>}
        </div>
      </div>

      <div className="flex items-start justify-between gap-space-sm">
        <p className="flex items-start gap-1.5 min-w-0 text-body-md font-body-md text-on-surface">
          <PinIcon className="w-4 h-4 mt-0.5 text-on-surface-variant" />
          <span data-testid="station-address" className="break-words">
            {address}
          </span>
        </p>
        <button
          type="button"
          onClick={onCopy}
          className="shrink-0 h-9 px-space-lg rounded-full bg-surface-container-low text-on-surface text-label-lg font-label-lg flex items-center gap-1.5 hover:text-on-primary-fixed-variant transition-colors"
        >
          <CopyIcon className="w-4 h-4" />
          Copia
        </button>
      </div>
      <p role="status" aria-live="polite" className="text-label-md font-label-md text-on-surface-variant min-h-4 -mt-space-sm">
        {copy === "copied" && "Indirizzo copiato"}
        {copy === "failed" && "Copia non riuscita: seleziona e copia l'indirizzo a mano"}
      </p>

      <div className="flex items-center justify-between gap-space-md min-w-0">
        <span className="inline-flex items-center h-[26px] px-space-md rounded-full bg-secondary/10 text-on-secondary-fixed-variant text-label-md font-label-md shrink-0">
          {station.tipoImpianto === "autostradale" ? "Autostrada" : "Stradale"}
        </span>
        {station.gestore.trim() && (
          <span title={`Gestore ${station.gestore.trim()}`} className="min-w-0 truncate text-right text-label-md font-label-md text-on-surface-variant">
            Gestore {station.gestore.trim()}
          </span>
        )}
      </div>
    </section>
  );
}

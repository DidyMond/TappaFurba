import type { StationSummary } from "@tappafurba/shared";
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { formatEuro, formatPrice } from "../../lib/format";
import { orderedNavigationLinks } from "../../lib/navigation";
import { CloseIcon, ExternalIcon } from "../icons";

export interface NavigateSummary {
  price: number;
  /** Es. "Benzina Self". */
  modeLabel: string;
  netSavings: number;
}

interface NavigateSheetProps {
  station: StationSummary;
  /** Prezzo e risparmio da mostrare sopra i link (facoltativo). */
  summary?: NavigateSummary;
  onClose: () => void;
}

/**
 * Foglio "Apri in navigatore": i deep-link verso Google Maps, Apple Maps e Waze per la stazione. L'app predefinita del
 * sistema rilevato (Apple Maps su iOS, Google Maps su Android) è in prima posizione ed etichettata «Consigliato»: un tap
 * equivale al lancio diretto. Serve da menu quando "Naviga" non riconosce la piattaforma (desktop) e dalla CTA
 * «Apri nel Navigatore» del dettaglio stazione.
 */
export function NavigateSheet({ station, summary, onClose }: NavigateSheetProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const { links, recommended } = orderedNavigationLinks({ name: station.nomeImpianto, lat: station.lat, lon: station.lon });

  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Portale su body: il contenitore fisso della schermata crea un proprio stacking context e finirebbe sotto la navigazione.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-tertiary/40" onClick={onClose}>
      <div
        role="dialog"
        data-testid="navigate-menu"
        aria-modal="true"
        aria-label="Apri in navigatore"
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-md rounded-t-3xl md:rounded-3xl bg-surface-container-lowest shadow-lg backdrop-blur-md p-space-xl pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))] flex flex-col gap-space-lg"
      >
        <div className="flex items-start justify-between gap-space-md">
          <div className="min-w-0">
            <h2 className="text-headline-md font-headline-md text-on-surface truncate">{station.nomeImpianto}</h2>
            <p className="text-body-sm font-body-sm text-on-surface-variant">
              {[station.indirizzo.trim(), `${station.comune} (${station.provincia})`].filter(Boolean).join(" · ")}
            </p>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Chiudi"
            className="w-9 h-9 rounded-full bg-surface-container-low text-on-surface-variant flex items-center justify-center shrink-0 hover:text-on-surface"
          >
            <CloseIcon className="w-4 h-4" />
          </button>
        </div>

        {summary && (
          <div className="flex items-center gap-space-md rounded bg-surface-container-low p-space-md">
            <span className="text-numeric-stat font-numeric-stat tabular-nums text-on-surface">€{formatPrice(summary.price)}</span>
            <div className="flex flex-col">
              <span className="text-label-md font-label-md text-on-surface-variant">{summary.modeLabel}</span>
              <span className={`text-label-md font-label-md tabular-nums ${summary.netSavings > 0 ? "text-on-primary-fixed-variant" : "text-on-error-container"}`}>
                {summary.netSavings > 0 ? "Risparmi" : "Non conviene"} {formatEuro(summary.netSavings)}
              </span>
            </div>
          </div>
        )}

        <div className="flex flex-col gap-space-sm">
          <span className="text-label-sm font-label-sm font-semibold text-on-surface">Apri in navigatore</span>
          {links.map((link, index) => (
            <a
              key={link.app}
              href={link.url}
              data-testid={`navigate-link-${link.app}`}
              target="_blank"
              rel="noopener noreferrer"
              className={`h-12 rounded-full flex items-center justify-center gap-space-sm text-label-lg font-label-lg transition ${
                index === 0 ? "bg-primary-strong text-on-primary hover:brightness-95" : "bg-surface-container-low text-on-surface hover:text-on-primary-fixed-variant"
              }`}
            >
              {link.label}
              {link.app === recommended && (
                <span className="inline-flex items-center h-[20px] px-space-sm rounded-full bg-on-primary-fixed/25 text-on-primary text-label-sm font-label-sm">
                  Consigliato
                </span>
              )}
              <ExternalIcon className="w-4 h-4" />
            </a>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}

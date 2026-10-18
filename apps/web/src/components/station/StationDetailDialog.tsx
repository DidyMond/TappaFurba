import { useCallback, useEffect, useRef, useState } from "react";
import { useNotice } from "../../hooks/useNotice";
import { useStationDetail } from "../../hooks/useStationDetail";
import { fuelModeLabel } from "../../lib/stationView";
import { CloseIcon, ShareIcon } from "../icons";
import { NavigateSheet } from "../results/NavigateSheet";
import { NavigateBar } from "./NavigateBar";
import { shareDetail, shareNotice } from "./shareDetail";
import { StationDetailBody } from "./StationDetailBody";

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface StationDetailDialogProps {
  searchId: string;
  stationId: number;
  onClose: () => void;
}

/**
 * Dettaglio stazione su desktop (≥1024 px): DIALOGO MODALE centrato sopra i Risultati, che restano dov'erano (la rotta non
 * cambia). Sfondo oscurato e sfocato, `max-w-3xl`, scorrimento interno; si chiude con la «×», con Esc o toccando lo sfondo;
 * il focus resta dentro (Tab e Maiusc+Tab ruotano tra i controlli) e al termine torna al pulsante «Info» che l'ha aperto.
 * Il contenuto è lo stesso della schermata a pagina intera (`StationDetailBody`); la CTA «Apri nel Navigatore» è una pill
 * senza card, ancorata in fondo al dialogo.
 */
export function StationDetailDialog({ searchId, stationId, onClose }: StationDetailDialogProps) {
  const [attempt, setAttempt] = useState(0);
  const state = useStationDetail(searchId, stationId, attempt);
  const [menuOpen, setMenuOpen] = useState(false);
  const [notice, showNotice] = useNotice();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const detail = state.status === "success" ? state.detail : null;

  // Focus: dentro il dialogo all'apertura; al termine torna a ciò che lo aveva (il pulsante «Info»). Lo sfondo non scorre.
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      if (opener && document.contains(opener)) opener.focus();
    };
  }, []);

  const closeMenu = useCallback(() => setMenuOpen(false), []);

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const panel = panelRef.current;
    // Il foglio «Apri in navigatore» è un portale: i suoi eventi risalgono qui nell'albero React ma non sono del dialogo.
    if (!panel || !(event.target instanceof Node) || !panel.contains(event.target)) return;
    if (event.key === "Escape") {
      if (menuOpen) return; // Esc chiude prima il foglio del navigatore
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== "Tab") return;
    const items = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => !el.hasAttribute("hidden") && el.getAttribute("aria-hidden") !== "true");
    if (items.length === 0) {
      event.preventDefault();
      return;
    }
    const first = items[0]!;
    const last = items[items.length - 1]!;
    if (event.shiftKey && (document.activeElement === first || document.activeElement === panel)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  // Esc anche quando il focus è sul <body> (es. dopo un clic su un testo): si ascolta il documento, salvo foglio del navigatore aperto.
  useEffect(() => {
    const onDocKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !menuOpen && !panelRef.current?.contains(event.target as Node)) onClose();
    };
    document.addEventListener("keydown", onDocKey);
    return () => document.removeEventListener("keydown", onDocKey);
  }, [menuOpen, onClose]);

  const share = async () => {
    if (!detail) return;
    const message = shareNotice(await shareDetail(detail));
    if (message) showNotice(message);
  };

  // Il foglio «Apri in navigatore» sta FUORI dallo sfondo del dialogo: è un portale e i suoi tocchi, risalendo l'albero React,
  // altrimenti chiuderebbero anche il dialogo.
  return (
    <>
      <div
        data-testid="station-dialog-backdrop"
        className="fixed inset-0 z-[45] flex items-center justify-center bg-inverse-surface/40 backdrop-blur-sm p-space-xl"
        onClick={onClose}
      >
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-label={detail ? `Dettaglio stazione: ${detail.station.nomeImpianto}` : "Dettaglio stazione"}
          onClick={(event) => event.stopPropagation()}
          onKeyDown={onKeyDown}
          className="relative w-full max-w-3xl 2xl:max-w-5xl max-h-[calc(100dvh-4rem)] flex flex-col rounded-3xl bg-surface shadow-2xl border border-outline-variant/30 overflow-hidden"
        >
          <div className="shrink-0 flex items-center justify-between gap-space-md px-space-xl py-space-md border-b border-outline-variant/20">
            <h2 className="text-headline-sm font-headline-sm text-on-surface">Dettaglio stazione</h2>
            <div className="flex items-center gap-space-sm">
              <button
                type="button"
                onClick={share}
                disabled={detail === null}
                aria-label="Condividi la stazione"
                className="w-10 h-10 rounded-full bg-surface-container-low text-on-surface-variant flex items-center justify-center transition-colors hover:text-on-surface active:scale-95 disabled:opacity-40 disabled:active:scale-100"
              >
                <ShareIcon />
              </button>
              <button
                ref={closeRef}
                type="button"
                onClick={onClose}
                aria-label="Chiudi"
                className="w-10 h-10 rounded-full bg-surface-container-low text-on-surface-variant flex items-center justify-center transition-colors hover:text-on-surface active:scale-95"
              >
                <CloseIcon />
              </button>
            </div>
          </div>

          <div
            data-testid="station-dialog-scroll"
            className="flex-1 min-h-0 overflow-y-auto no-scrollbar px-space-xl pt-space-lg pb-32 flex flex-col gap-space-lg"
          >
            {notice && (
              <p
                role="status"
                className="self-center rounded-full bg-inverse-surface text-inverse-on-surface text-label-lg font-label-lg px-space-xl py-space-sm shadow-lg"
              >
                {notice}
              </p>
            )}
            <StationDetailBody state={state} onRetry={() => setAttempt((n) => n + 1)} onBack={onClose} wide backLabel="Chiudi" />
          </div>

          <NavigateBar
            placement="container"
            stationName={detail?.station.nomeImpianto ?? "stazione"}
            onNavigate={() => setMenuOpen(true)}
            disabled={detail === null}
          />
        </div>
      </div>
      {menuOpen && detail && (
        <NavigateSheet
          station={detail.station}
          summary={{
            price: detail.selected.price,
            modeLabel: fuelModeLabel(detail.selected.fuelType, detail.selected.isSelf),
            netSavings: detail.impact.netSavings,
          }}
          onClose={closeMenu}
        />
      )}
    </>
  );
}

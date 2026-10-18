import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { sameExclusions, type RouteExclusions } from "../../lib/routeOptions";
import { CloseIcon } from "../icons";
import { ToggleRow } from "../ToggleRow";

interface RouteOptionsSheetProps {
  /** Esclusioni della ricerca corrente: i toggle partono da qui. */
  current: RouteExclusions;
  /** Default delle Impostazioni: «Reimposta» ci torna. */
  defaults: RouteExclusions;
  /** «Applica»: rilancia la ricerca con lo stesso A/B e il nuovo insieme di esclusioni. */
  onApply: (exclusions: RouteExclusions) => void;
  onClose: () => void;
}

/**
 * Foglio «Opzioni percorso» (stile Google Maps): tre toggle: evita autostrade, pedaggi, traghetti. «Applica» rilancia
 * la ricerca; «Reimposta» riporta i toggle ai default delle Impostazioni (senza rilanciare, serve poi «Applica»).
 */
export function RouteOptionsSheet({ current, defaults, onApply, onClose }: RouteOptionsSheetProps) {
  const [draft, setDraft] = useState<RouteExclusions>(current);
  const closeRef = useRef<HTMLButtonElement>(null);
  const changed = !sameExclusions(draft, current);

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

  // Portale su body: il contenitore fisso dei Risultati crea un proprio stacking context e finirebbe sotto la navigazione.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-tertiary/40" onClick={onClose}>
      <div
        role="dialog"
        data-testid="route-options-sheet"
        aria-modal="true"
        aria-label="Opzioni percorso"
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-md rounded-t-3xl md:rounded-3xl bg-surface-container-lowest shadow-lg backdrop-blur-md p-space-xl pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))] flex flex-col gap-space-lg"
      >
        <div className="flex items-start justify-between gap-space-md">
          <div>
            <h2 className="text-headline-md font-headline-md text-on-surface">Opzioni percorso</h2>
            <p className="text-body-sm font-body-sm text-on-surface-variant">Applica rilancia la ricerca con la stessa partenza e destinazione.</p>
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

        <div className="flex flex-col gap-space-lg">
          <ToggleRow
            label="Evita autostrade"
            testId="route-option-avoid-motorway"
            description="Il percorso consigliato e il calcolo delle deviazioni evitano le autostrade."
            checked={draft.avoidMotorway}
            onChange={(avoidMotorway) => setDraft((d) => ({ ...d, avoidMotorway }))}
          />
          <ToggleRow
            label="Evita pedaggi"
            testId="route-option-avoid-tolls"
            description="Il percorso consigliato evita le strade a pedaggio. Il costo del pedaggio non è incluso nel risparmio calcolato."
            checked={draft.avoidTolls}
            onChange={(avoidTolls) => setDraft((d) => ({ ...d, avoidTolls }))}
          />
          <ToggleRow
            label="Evita traghetti"
            testId="route-option-avoid-ferries"
            description="Il percorso consigliato evita i traghetti."
            checked={draft.avoidFerries}
            onChange={(avoidFerries) => setDraft((d) => ({ ...d, avoidFerries }))}
          />
        </div>

        <div className="flex flex-col gap-space-sm">
          <button
            type="button"
            onClick={() => onApply(draft)}
            data-testid="route-options-apply"
            disabled={!changed}
            className="h-12 rounded-full bg-primary-strong text-on-primary text-label-lg font-label-lg flex items-center justify-center hover:brightness-95 active:scale-[0.99] transition disabled:opacity-50 disabled:hover:brightness-100"
          >
            Applica
          </button>
          <button
            type="button"
            onClick={() => setDraft(defaults)}
            data-testid="route-options-reset"
            title="Torna ai default delle Impostazioni"
            className="h-10 rounded-full bg-surface-container-low text-on-surface text-label-lg font-label-lg flex items-center justify-center"
          >
            Reimposta
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

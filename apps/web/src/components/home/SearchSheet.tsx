import { useEffect, useRef, type ReactNode } from "react";
import { CloseIcon, RouteIcon } from "../icons";

interface SearchSheetProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}

/**
 * Foglio «Pianifica Viaggio & Risparmio»: `rounded-t-3xl` ancorato in basso su mobile, finestra centrata da
 * `md` in su. Resta MONTATO anche da chiuso (solo `hidden`): il form conserva partenza, destinazione e valori, come
 * quando la Home era una pagina. Si chiude col «×», toccando lo sfondo o con Esc.
 */
export function SearchSheet({ open, onClose, children }: SearchSheetProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    // Il fondo non scorre dietro il foglio.
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // Il cursore va al primo campo ancora vuoto (partenza, poi destinazione).
    const inputs = [...(dialogRef.current?.querySelectorAll<HTMLInputElement>('input[role="combobox"]') ?? [])];
    (inputs.find((input) => input.value === "") ?? inputs[0])?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  return (
    // `hidden` su un contenitore SENZA classi di display (la classe `flex` batterebbe l'attributo): sta nel figlio.
    // Da aperto il contenitore è `display: contents`: non genera un riquadro e quindi non è un elemento del flex della Home
    // (con il `gap` di `main` aggiungeva 24 px di altezza e spostava lo sfondo di 12 px verso l'alto).
    <div hidden={!open} className={open ? "contents" : undefined}>
      <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-inverse-surface/40 backdrop-blur-[2px]" onClick={onClose}>
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="search-sheet-title"
          onClick={(event) => event.stopPropagation()}
          className="w-full max-w-lg flex flex-col max-h-[92dvh] md:max-h-[88vh] rounded-t-3xl md:rounded-3xl bg-surface-container-lowest shadow-2xl border-t border-surface-container-high overflow-hidden"
        >
          <div className="shrink-0 pt-space-md pb-space-md px-space-xl flex flex-col items-center border-b border-surface-container/60">
            <span aria-hidden="true" className="w-12 h-1.5 rounded-full bg-outline-variant/60 mb-space-md md:hidden" />
            <div className="w-full flex items-center justify-between gap-space-md">
              <div className="flex items-center gap-space-sm min-w-0">
                <RouteIcon className="w-[22px] h-[22px] text-primary shrink-0" />
                <h2 id="search-sheet-title" className="text-headline-sm font-headline-sm font-bold text-on-surface truncate">
                  Pianifica Viaggio &amp; Risparmio
                </h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Chiudi"
                className="w-8 h-8 rounded-full bg-surface-container-low text-on-surface-variant hover:text-on-surface flex items-center justify-center shrink-0 active:scale-95 transition"
              >
                <CloseIcon className="w-[18px] h-[18px]" />
              </button>
            </div>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}

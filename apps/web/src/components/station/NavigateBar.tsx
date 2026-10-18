import { NavigateIcon } from "../icons";

interface NavigateBarProps {
  stationName: string;
  /** `viewport` (pagina intera): fissa in fondo alla finestra. `container` (dialogo desktop): ancorata in fondo al dialogo. */
  placement?: "viewport" | "container";
  /** Apre il menu «Apri in navigatore» (app consigliata per il sistema in prima posizione, poi le altre). */
  onNavigate: () => void;
  disabled?: boolean;
}

/**
 * CTA flottante «Apri nel Navigatore»: una pill verde a tutta larghezza del contenitore dei contenuti, SENZA card attorno
 * (nessuno sfondo, bordo od ombra di contenitore). Dietro, una sfocatura progressiva (mask-image con gradiente
 * + backdrop-blur): il contenuto che scorre sfuma sotto la pill. Safe-area aware. Apre sempre il menu di scelta: l'app del
 * sistema è «Consigliata», le altre sono sotto.
 */
export function NavigateBar({ stationName, onNavigate, placement = "viewport", disabled = false }: NavigateBarProps) {
  const inContainer = placement === "container";
  return (
    <div data-testid="navigate-bar" data-placement={placement} className={`${inContainer ? "absolute" : "fixed z-30"} inset-x-0 bottom-0 pointer-events-none`}>
      <div data-testid="progressive-blur" aria-hidden="true" className="progressive-blur absolute inset-x-0 bottom-0 h-32">
        <span />
        <span />
        <span />
      </div>
      <div
        data-testid="navigate-bar-container"
        className={`relative pb-[calc(1rem+env(safe-area-inset-bottom,0px))] ${inContainer ? "px-space-xl" : "px-margin max-w-md mx-auto"}`}
      >
        <button
          type="button"
          onClick={onNavigate}
          data-testid="navigate-cta"
          disabled={disabled}
          aria-label={`Apri nel Navigatore: ${stationName}`}
          className="pointer-events-auto w-full min-h-12 h-12 rounded-full bg-primary-strong text-on-primary text-headline-sm font-headline-sm flex items-center justify-center gap-space-sm shadow-md hover:brightness-95 active:scale-[0.98] transition disabled:opacity-50"
        >
          <NavigateIcon className="w-5 h-5" />
          Apri nel Navigatore
        </button>
      </div>
    </div>
  );
}

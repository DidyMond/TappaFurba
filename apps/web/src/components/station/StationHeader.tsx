import { BackIcon, ShareIcon } from "../icons";
import { BrandLogo } from "../BrandLogo";

interface StationHeaderProps {
  onBack: () => void;
  onShare: () => void;
  /** La condivisione ha senso solo a stazione caricata. */
  actionsDisabled: boolean;
}

const iconButton =
  "w-10 h-10 rounded-full bg-surface-container-low text-on-surface-variant flex items-center justify-center transition-colors hover:text-on-surface active:scale-95 disabled:opacity-40 disabled:active:scale-100";

/**
 * Header delle schermate a pila (DESIGN.md — Header): indietro a sinistra, brand centrato, a destra condividi. Nessun
 * avatar (nell'MVP non c'è profilo, sarebbe un controllo morto) e nessun «Salva» (nessuna schermata recupererebbe le stazioni salvate). Rispetta la safe-area (`pt-safe`) come l'header globale.
 */
export function StationHeader({ onBack, onShare, actionsDisabled }: StationHeaderProps) {
  return (
    <header className="fixed top-0 w-full z-30 pt-safe bg-surface/85 backdrop-blur-xl">
      <div className="h-[72px] px-gutter max-w-md mx-auto grid grid-cols-[1fr_auto_1fr] items-center gap-space-sm">
        <div className="flex justify-start">
          <button type="button" onClick={onBack} aria-label="Torna ai risultati" className={iconButton}>
            <BackIcon />
          </button>
        </div>

        <div className="flex items-center gap-2">
          <BrandLogo className="w-8 h-8 shrink-0" />
          <span className="font-headline-lg text-headline-sm font-bold text-on-surface tracking-tight leading-none">TappaFurba</span>
        </div>

        <div className="flex items-center justify-end gap-space-xs">
          <button type="button" onClick={onShare} disabled={actionsDisabled} aria-label="Condividi la stazione" className={iconButton}>
            <ShareIcon />
          </button>
        </div>
      </div>
    </header>
  );
}

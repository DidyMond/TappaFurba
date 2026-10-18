import { useInstallPrompt, useIosInstallHint } from "../hooks/useInstallPrompt";
import { CloseIcon, IosShareIcon } from "./icons";

/**
 * Banner discreto per installare TappaFurba (DESIGN.md: `rounded-lg`, `shadow-md`, `bg-surface-container-lowest`).
 * Compare solo se il browser offre l'installazione, al massimo una proposta per sessione. Sta nel flusso della Home (in cima, sopra il
 * form): una riga compatta che non copre nulla, nemmeno su schermi stretti. Su iOS (dove il browser non offre
 * l'installazione) al posto del pulsante c'è una breve guida: Condividi → Aggiungi alla schermata Home.
 */
export function InstallBanner() {
  const { canInstall, install, dismiss } = useInstallPrompt();
  const ios = useIosInstallHint();

  if (!canInstall && ios.show) {
    return (
      <aside
        aria-label="Come installare l'app"
        className="rounded-lg bg-surface-container-lowest border border-outline-variant/30 shadow-md p-space-sm pl-space-md flex items-center gap-space-md"
      >
        <img src="/logo.svg" alt="" width={32} height={32} className="shrink-0 rounded" />
        <p className="flex-1 min-w-0 text-body-sm font-body-sm text-on-surface">
          <span className="font-semibold">Installa TappaFurba:</span> tocca{" "}
          <IosShareIcon className="inline w-4 h-4 align-text-bottom text-on-secondary-fixed-variant" />
          <span className="sr-only"> Condividi</span> e poi «Aggiungi alla schermata Home».
        </p>
        <button
          type="button"
          onClick={ios.dismiss}
          aria-label="Non ora"
          title="Non ora"
          className="w-10 h-10 rounded-full shrink-0 flex items-center justify-center text-on-surface-variant hover:text-on-surface bg-surface-container-low"
        >
          <CloseIcon className="w-4 h-4" />
        </button>
      </aside>
    );
  }

  if (!canInstall) return null;

  return (
    <aside
      aria-label="Installa l'app"
      className="rounded-lg bg-surface-container-lowest border border-outline-variant/30 shadow-md p-space-sm pl-space-md flex items-center gap-space-md"
    >
      <img src="/logo.svg" alt="" width={32} height={32} className="shrink-0 rounded" />
      <button
        type="button"
        onClick={() => void install()}
        className="flex-1 min-w-0 h-10 rounded-full bg-primary-strong text-on-primary text-label-lg font-label-lg hover:brightness-95 active:scale-[0.99] transition"
      >
        Installa TappaFurba
      </button>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Non ora"
        title="Non ora"
        className="w-10 h-10 rounded-full shrink-0 flex items-center justify-center text-on-surface-variant hover:text-on-surface bg-surface-container-low"
      >
        <CloseIcon className="w-4 h-4" />
      </button>
    </aside>
  );
}

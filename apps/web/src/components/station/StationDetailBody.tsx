import type { StationDetailResponse } from "@tappafurba/shared";
import type { StationDetailState } from "../../hooks/useStationDetail";
import { formatKm } from "../../lib/format";
import { SpinnerIcon } from "../icons";
import { ImpactBento } from "./ImpactBento";
import { PriceMatrix } from "./PriceMatrix";
import { StationMeta } from "./StationMeta";

export function LoadingBody() {
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-space-lg">
      <div className="flex items-center gap-space-sm text-body-md font-body-md text-on-surface-variant">
        <SpinnerIcon className="w-4 h-4 text-on-secondary-fixed-variant" />
        Verifico la deviazione sul percorso reale…
      </div>
      {[0, 1, 2].map((i) => (
        <div key={i} aria-hidden="true" className="rounded-lg bg-surface-container-high animate-pulse h-36" />
      ))}
    </div>
  );
}

export function ErrorBody({
  code,
  message,
  onRetry,
  onBack,
  backLabel = "Torna ai risultati",
}: {
  code: string;
  message: string;
  onRetry: () => void;
  onBack: () => void;
  backLabel?: string;
}) {
  const expired = code === "SEARCH_NOT_FOUND" || code === "NOT_FOUND";
  return (
    <div
      role="alert"
      className="rounded-lg bg-surface-container-lowest shadow-sm border border-outline-variant/30 p-space-xl flex flex-col items-center gap-space-md text-center"
    >
      <p className="text-headline-sm font-headline-sm text-on-surface">
        {expired ? "Questa ricerca non è più disponibile" : "Non riesco a caricare la stazione"}
      </p>
      <p className="text-body-md font-body-md text-on-surface-variant">
        {expired ? "I risultati restano in memoria per pochi minuti: torna alla ricerca e rifalla." : message}
      </p>
      <div className="flex flex-wrap justify-center gap-space-sm">
        {!expired && (
          <button type="button" onClick={onRetry} className="h-10 px-space-xl rounded-full bg-primary-strong text-on-primary text-label-lg font-label-lg">
            Riprova
          </button>
        )}
        <button type="button" onClick={onBack} className="h-10 px-space-xl rounded-full bg-surface-container-low text-on-surface text-label-lg font-label-lg">
          {backLabel}
        </button>
      </div>
    </div>
  );
}

/**
 * Il contenuto del dettaglio stazione, uguale nella schermata a pagina intera (mobile e deep-link) e nel dialogo desktop:
 * caricamento, errore oppure intestazione della stazione, impatto sul viaggio, listino e posizione sul percorso.
 * `wide` (dialogo) porta il listino a quattro colonne.
 */
export function StationDetailBody({
  state,
  onRetry,
  onBack,
  wide = false,
  backLabel,
}: {
  state: StationDetailState;
  onRetry: () => void;
  onBack: () => void;
  wide?: boolean;
  backLabel?: string;
}) {
  if (state.status === "loading") return <LoadingBody />;
  if (state.status === "error")
    return <ErrorBody code={state.error.code} message={state.error.message} onRetry={onRetry} onBack={onBack} backLabel={backLabel} />;
  const detail: StationDetailResponse = state.detail;
  return (
    <>
      <StationMeta station={detail.station} />
      <ImpactBento detail={detail} />
      <PriceMatrix detail={detail} wide={wide} />
      <p className="text-body-sm font-body-sm text-on-surface-variant text-center px-gutter tabular-nums">
        A {formatKm(detail.alongRouteKm)} dalla partenza, a {formatKm(detail.lateralDistanceKm)} dal percorso diretto.
      </p>
    </>
  );
}

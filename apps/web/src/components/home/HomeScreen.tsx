import { useCallback, useState } from "react";
import { useIsDesktop } from "../../hooks/useMediaQuery";
import type { SearchLabels } from "../../hooks/useSearch";
import type { ApiError } from "../../lib/api";
import { useRecentRoutes, type RecentRoute } from "../../lib/recentRoutes";
import type { AnySearchRequest } from "../../lib/searchMode";
import { SearchIcon, SavingsIcon, SpinnerIcon, VerifiedIcon } from "../icons";
import { SearchError } from "../SearchError";
import { SearchForm, type SearchPrefill } from "../SearchForm";
import { FrequentRoutes } from "./FrequentRoutes";
import { SearchSheet } from "./SearchSheet";

interface HomeScreenProps {
  onSubmit: (request: AnySearchRequest, labels: SearchLabels) => void;
  busy: boolean;
  error: ApiError | null;
}

/**
 * Home: barra di ricerca con alone, riga di presentazione e «Tragitti frequenti». Il form «Pianifica viaggio
 * & risparmio» sta in un foglio che si apre toccando la barra (o un tragitto frequente, che lo precompila). Si chiude
 * da solo alla ricerca: i risultati compaiono nella schermata Risultati, un eventuale errore qui sotto la barra.
 *
 * Da `lg` in su: due colonne in un contenitore `max-w-4xl` centrato — a sinistra l'hero (pillola con
 * il claim, titolo display, paragrafo, barra con alone), a destra «Tragitti frequenti» con il conteggio dei salvati.
 */
export function HomeScreen({ onSubmit, busy, error }: HomeScreenProps) {
  const [open, setOpen] = useState(false);
  const [prefill, setPrefill] = useState<SearchPrefill | null>(null);
  const routes = useRecentRoutes();
  const desktop = useIsDesktop();

  const close = useCallback(() => setOpen(false), []);
  const pick = (route: RecentRoute) => {
    setPrefill((current) => ({ key: (current?.key ?? 0) + 1, route }));
    setOpen(true);
  };

  // Barra di ricerca grande con alone sfumato dietro. Nessuna maschera: a riposo la header della Home è
  // trasparente (vedi Header), quindi non c'è un bordo che lo tagli. L'alone è centrato sul riquadro (inset simmetrici,
  // nessuna rotazione) e ha un gradiente RADIALE con i colori del brand: il lineare verde→azzurro lo faceva
  // sembrare spostato a sinistra (vedi .bg-glow-radial in index.css).
  const searchBar = (
    <div className={`relative w-full my-space-sm ${desktop ? "max-w-xl" : ""}`}>
      <div
        aria-hidden="true"
        data-testid="search-glow"
        className="absolute -inset-4 sm:-inset-6 bg-glow-radial rounded-full blur-2xl z-0 pointer-events-none scale-105"
      />
      <button
        type="button"
        data-testid="search-bar"
        aria-haspopup="dialog"
        disabled={busy}
        onClick={() => setOpen(true)}
        className="relative z-10 w-full h-14 px-space-xl rounded-full bg-surface-container-lowest border border-surface-container-high/80 hover:border-primary/50 shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-space-md active:scale-[0.99] disabled:opacity-80"
      >
        {busy ? <SpinnerIcon className="w-6 h-6 text-primary" /> : <SearchIcon className="w-6 h-6 text-primary" />}
        <span className="text-headline-sm font-headline-sm font-bold text-on-surface truncate">{busy ? "Cerco le stazioni…" : "Dove vuoi andare?"}</span>
      </button>
    </div>
  );

  const sheet = (
    <SearchSheet open={open} onClose={close}>
      <SearchForm
        prefill={prefill}
        busy={busy}
        onSubmit={(request, labels) => {
          setOpen(false);
          onSubmit(request, labels);
        }}
      />
    </SearchSheet>
  );

  // Il foglio sta fuori dai due layout, nello stesso posto dell'albero: cambiando larghezza (es. un tablet che ruota) il form
  // non si rimonta e non perde i valori inseriti.
  return (
    <>
      {desktop ? (
        <div data-testid="home-desktop" className="grid grid-cols-12 gap-10 items-start">
          <section className="col-span-7 2xl:col-span-6 flex flex-col pt-3">
            <div className="inline-flex items-center gap-2 self-start bg-primary-fixed/40 px-3.5 py-1.5 rounded-full border border-primary/20 mb-5">
              <span aria-hidden="true" className="w-2 h-2 rounded-full bg-primary" />
              <span className="text-label-md font-label-md font-semibold text-on-primary-fixed-variant">
                Trova il carburante al minor costo sul tuo tragitto
              </span>
            </div>
            <h1 className="font-headline-xl text-headline-xl 2xl:text-headline-2xl text-on-surface mb-4">
              Naviga intelligente.
              <br />
              <span className="text-primary-strong">Risparmia ad ogni pieno.</span>
            </h1>
            <p className="text-body-lg font-body-lg text-on-surface-variant max-w-prose mb-8">
              Ottimizza le soste lungo il tuo tragitto confrontando i prezzi MIMIT con il tempo e i chilometri di deviazione.
            </p>
            {searchBar}
            <p className="flex items-center gap-2 text-body-sm font-body-sm text-on-surface-variant mt-6 ml-2">
              <VerifiedIcon className="w-4 h-4 text-primary" />
              Prezzi dall'Osservaprezzi carburanti del MIMIT
            </p>
            {error && (
              <div className="mt-space-lg max-w-xl">
                <SearchError error={error} />
              </div>
            )}
          </section>
          <div className="col-span-5 2xl:col-span-6">
            <FrequentRoutes routes={routes} onPick={pick} desktop />
          </div>
        </div>
      ) : (
        <>
          <section className="flex flex-col gap-space-sm pt-space-xs">
            {searchBar}

            {/* Il claim di prodotto è anche il titolo della pagina (h1): contiene la parola chiave principale. */}
            <h1 className="self-center flex items-center justify-center gap-1.5 px-space-md py-1.5 mb-space-lg rounded-full bg-surface-container-low border border-surface-container-high/60 text-label-sm font-label-sm font-semibold text-on-surface-variant text-center">
              <SavingsIcon className="w-4 h-4 text-primary shrink-0" />
              Trova il carburante al minor costo sul tuo tragitto
            </h1>
          </section>

          {error && <SearchError error={error} />}

          <FrequentRoutes routes={routes} onPick={pick} />
        </>
      )}

      {sheet}
    </>
  );
}

import type { SearchFuelType, StationDetailResponse } from "@tappafurba/shared";
import { formatPrice, formatShortDate } from "../../lib/format";
import { fuelLabel } from "../../lib/stationView";
import { VerifiedIcon } from "../icons";

type Selected = StationDetailResponse["selected"];

const isSelectedCombination = (selected: Selected, fuelType: SearchFuelType, isSelf: boolean) => selected.fuelType === fuelType && selected.isSelf === isSelf;

/**
 * Listino della stazione: una tile per ogni combinazione carburante × modalità con prezzo recente (dati MIMIT).
 * La combinazione scelta nella ricerca è evidenziata. Nessuna tile per ciò che la stazione non vende. Il badge
 * «Verificato MISE» attribuisce i prezzi (fonte ufficiale Osservaprezzi): non riguarda la deviazione.
 */
export function PriceMatrix({ detail, wide = false }: { detail: StationDetailResponse; wide?: boolean }) {
  const { prices, selected } = detail;
  // Diciture DERIVATE dai dati (niente giudizi come «Ottimo prezzo»): la tile scelta dice «Scelto nella ricerca»; una tile
  // Servito dice di quanto costa più (o meno) del Self dello stesso carburante.
  const versusSelf = (entry: StationDetailResponse["prices"][number]): string | null => {
    if (entry.isSelf) return null;
    const self = prices.find((p) => p.fuelType === entry.fuelType && p.isSelf);
    if (!self) return null;
    const diff = Math.round((entry.price - self.price) * 1000) / 1000;
    return `${diff < 0 ? "−" : "+"}€${formatPrice(Math.abs(diff))} vs self`;
  };

  return (
    <section
      aria-label="Listino carburanti"
      className="rounded-lg bg-surface-container-lowest shadow-sm border border-outline-variant/30 p-space-lg flex flex-col gap-space-md"
    >
      <div className="flex items-center justify-between gap-space-sm">
        <h2 className="text-headline-sm font-headline-sm text-on-surface">Listino carburanti</h2>
        <span
          className="inline-flex items-center gap-1 h-[26px] px-space-md rounded-full bg-primary/10 text-on-primary-fixed-variant text-label-md font-label-md whitespace-nowrap"
          title="Prezzi dal sito ufficiale Osservaprezzi del MIMIT (Ministero delle Imprese e del Made in Italy)"
        >
          <VerifiedIcon className="w-3.5 h-3.5" />
          Verificato MISE
        </span>
      </div>

      {prices.length === 0 ? (
        <p role="status" className="text-body-md font-body-md text-on-surface-variant">
          Nessun prezzo recente disponibile per questa stazione.
        </p>
      ) : (
        <ul className={`grid grid-cols-2 gap-space-sm ${wide ? "lg:grid-cols-4" : ""}`}>
          {prices.map((entry) => {
            const chosen = isSelectedCombination(selected, entry.fuelType, entry.isSelf);
            return (
              <li
                key={`${entry.fuelType}-${entry.isSelf ? "self" : "servito"}`}
                data-testid="price-tile"
                data-fuel={entry.fuelType}
                data-mode={entry.isSelf ? "self" : "servito"}
                aria-current={chosen ? "true" : undefined}
                className={`rounded p-space-md flex flex-col gap-space-xs min-w-0 ${chosen ? "bg-primary/10 ring-2 ring-primary" : "bg-surface-container-low"}`}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="text-headline-sm font-headline-sm text-on-surface">{fuelLabel(entry.fuelType)}</span>
                  <span className="inline-flex items-center h-[20px] px-space-sm rounded-full bg-surface-container-lowest text-on-surface-variant text-label-sm font-label-sm">
                    {entry.isSelf ? "Self" : "Servito"}
                  </span>
                </div>
                <div className="flex items-baseline justify-between gap-1">
                  <span
                    className={`text-numeric-stat font-numeric-stat tabular-nums leading-tight ${chosen ? "text-on-primary-fixed-variant" : "text-on-surface"}`}
                  >
                    {formatPrice(entry.price)}
                  </span>
                  <span className="text-label-md font-label-md text-on-surface-variant">€/L</span>
                </div>
                <span className="text-body-sm font-body-sm text-on-surface-variant tabular-nums">
                  {chosen ? "Scelto nella ricerca · " : ""}
                  {versusSelf(entry) ? `${versusSelf(entry)} · ` : ""}
                  prezzo del {formatShortDate(entry.communicatedAt)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

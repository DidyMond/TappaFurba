import type { LivePricesInfo } from "@tappafurba/shared";
import { formatDateTime } from "../../lib/format";

interface PricesBannerProps {
  livePrices: LivePricesInfo;
  /** Fine dell'ultima ingestione del file giornaliero MIMIT (ISO 8601). */
  dailyFileAt: string | null;
}

/** Testo sullo stato dei prezzi in tempo reale, esplicito su quanto e da dove sono aggiornati. */
export function livePricesText({ status, tilesLive, tilesTotal, oldestLiveAgeMinutes }: LivePricesInfo): string {
  switch (status) {
    case "live":
      return `Prezzi in tempo reale${oldestLiveAgeMinutes ? ` · aggiornati ${oldestLiveAgeMinutes} min fa` : ""}`;
    case "partial":
      return `Tempo reale su ${tilesLive} zone su ${tilesTotal} · per il resto file giornaliero`;
    case "unavailable":
      return "Tempo reale non raggiungibile · uso il file giornaliero";
    default:
      return "Prezzi dal file giornaliero MIMIT";
  }
}

/**
 * Banner fisso in fondo al foglio: fonte dei dati (MIMIT Osservaprezzi), data del file giornaliero e stato
 * dei prezzi in tempo reale. Il file giornaliero è indietro di 1-2 giorni, quindi lo si dichiara sempre.
 */
export function PricesBanner({ livePrices, dailyFileAt }: PricesBannerProps) {
  const live = livePrices.status === "live";
  return (
    <div
      role="status"
      data-testid="prices-banner"
      className="shrink-0 border-t border-outline-variant/20 bg-surface-container-lowest px-gutter py-space-sm flex items-start gap-space-sm"
    >
      <span className="relative flex h-2 w-2 shrink-0 mt-[5px]" aria-hidden="true">
        {live && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />}
        <span className={`relative inline-flex rounded-full h-2 w-2 ${live ? "bg-primary" : "bg-outline"}`} />
      </span>
      <div className="flex flex-col min-w-0">
        <span className="text-body-sm font-body-sm text-on-surface">{livePricesText(livePrices)}</span>
        <span className="text-body-sm font-body-sm text-on-surface-variant tabular-nums">
          MIMIT Osservaprezzi · file del {dailyFileAt ? formatDateTime(dailyFileAt) : "— (nessuna ingestione registrata)"}
        </span>
      </div>
    </div>
  );
}

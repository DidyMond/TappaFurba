import type { StationDetailResponse } from "@tappafurba/shared";
import { formatPrice } from "../../lib/format";
import { navigationLink } from "../../lib/navigation";
import { shareStation, type ShareOutcome } from "../../lib/share";
import { fuelModeLabel } from "../../lib/stationView";
import { fullAddress } from "./StationMeta";

/** Condivide la stazione del dettaglio: nome, carburante e prezzo scelti, indirizzo e il link a Google Maps con le coordinate. */
export function shareDetail(detail: StationDetailResponse): Promise<ShareOutcome> {
  const { station, selected } = detail;
  const target = { name: station.nomeImpianto, lat: station.lat, lon: station.lon };
  return shareStation({
    title: station.nomeImpianto,
    text: `${station.nomeImpianto} · ${fuelModeLabel(selected.fuelType, selected.isSelf)} €${formatPrice(selected.price)}/L · ${fullAddress(station)}`,
    url: navigationLink("google", target).url,
  });
}

/** Il messaggio da mostrare dopo la condivisione, o null se non serve (condivisione riuscita o annullata). */
export function shareNotice(outcome: ShareOutcome): string | null {
  if (outcome === "copied") return "Link copiato negli appunti";
  if (outcome === "failed") return "Condivisione non riuscita";
  return null;
}

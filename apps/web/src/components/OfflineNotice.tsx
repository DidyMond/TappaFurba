import { useOnlineStatus } from "../hooks/useOnlineStatus";

/** Avviso discreto sulla Home quando manca la rete: l'app si apre, ma la ricerca (prezzi, indirizzi, mappa) richiede la connessione. */
export function OfflineNotice() {
  const online = useOnlineStatus();
  if (online) return null;
  return (
    <p role="status" className="rounded-lg bg-surface-container-high text-on-surface-variant px-space-lg py-space-md text-body-sm font-body-sm">
      Sei offline. L&apos;app si apre comunque, ma per cercare servono i prezzi aggiornati: riconnettiti per continuare.
    </p>
  );
}

import { lazy, Suspense, useState } from "react";
import { useOnlineStatus } from "../../hooks/useOnlineStatus";
import { OFFLINE_MAP_DETAIL, OFFLINE_MAP_TITLE } from "../../lib/connectivity";
import { getMapboxToken } from "../../lib/env";
import { RouteIcon } from "../icons";
import type { MapCanvasProps } from "./MapCanvas";

// Mapbox GL pesa ~500 kB: si scarica solo quando compare la schermata Risultati, non nella Home.
const MapCanvas = lazy(() => import("./MapCanvas"));

type MapViewProps = Omit<MapCanvasProps, "token" | "onUnavailable">;

function MapPlaceholder({ title, detail }: { title: string; detail?: string }) {
  return (
    <div role="status" className="absolute inset-0 bg-surface-container-high flex flex-col items-center justify-center gap-space-sm px-gutter text-center">
      <RouteIcon className="w-8 h-8 text-secondary" />
      <p className="text-headline-sm font-headline-sm text-on-surface">{title}</p>
      {detail && <p className="max-w-xs text-body-sm font-body-sm text-on-surface-variant">{detail}</p>}
    </div>
  );
}

/**
 * Mappa dei risultati. Se manca il token o Mapbox non è utilizzabile mostra un segnaposto:
 * l'elenco delle stazioni sotto resta pienamente funzionante.
 */
export function MapView(props: MapViewProps) {
  const token = getMapboxToken();
  const [unavailable, setUnavailable] = useState<string | null>(null);
  const online = useOnlineStatus();

  // Senza rete la mappa (tile e stile Mapbox) non c'è e non si mette in cache: l'elenco già caricato resta visibile.
  if (!online) return <MapPlaceholder title={OFFLINE_MAP_TITLE} detail={OFFLINE_MAP_DETAIL} />;

  if (!token) {
    return (
      <MapPlaceholder
        title="Mappa non disponibile"
        detail={
          import.meta.env.DEV
            ? "Imposta VITE_MAPBOX_PUBLIC_TOKEN in apps/web/.env e riavvia il server di sviluppo (vedi README)."
            : "L'elenco delle stazioni qui sotto è comunque aggiornato."
        }
      />
    );
  }

  if (unavailable) {
    return <MapPlaceholder title="Mappa non disponibile" detail={unavailable} />;
  }

  return (
    <Suspense fallback={<div aria-hidden="true" className="absolute inset-0 bg-surface-container-high animate-pulse" />}>
      <MapCanvas {...props} token={token} onUnavailable={setUnavailable} />
    </Suspense>
  );
}

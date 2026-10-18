import { useEffect, useRef, useState } from "react";
import { fetchStationRoute } from "../lib/api";

export type StopRoute = ReadonlyArray<[number, number]>;

/**
 * Percorso A→stazione→B della stazione selezionata, da disegnare sulla mappa. Nessuna stazione selezionata → null.
 * Se il routing non è disponibile (kill switch, rete, sessione scaduta) resta null: la mappa non disegna nulla e la
 * card mantiene il badge «stima». Le risposte si ricordano per ricerca, così riselezionare non rifà la chiamata;
 * selezionare un'altra stazione annulla la richiesta in corso.
 */
export function useStopRoute(searchId: string, selectedId: number | null): StopRoute | null {
  const [route, setRoute] = useState<{ key: string; geometry: StopRoute } | null>(null);
  const cache = useRef(new Map<string, StopRoute>());

  useEffect(() => {
    if (selectedId === null) {
      setRoute(null);
      return;
    }
    const key = `${searchId}:${selectedId}`;
    const cached = cache.current.get(key);
    if (cached) {
      setRoute({ key, geometry: cached });
      return;
    }

    setRoute(null);
    const controller = new AbortController();
    fetchStationRoute(searchId, selectedId, controller.signal)
      .then((response) => {
        if (controller.signal.aborted) return;
        cache.current.set(key, response.geometry);
        setRoute({ key, geometry: response.geometry });
      })
      .catch(() => {
        // Non disponibile: nessun tracciato disegnato.
      });
    return () => controller.abort();
  }, [searchId, selectedId]);

  return route && selectedId !== null && route.key === `${searchId}:${selectedId}` ? route.geometry : null;
}

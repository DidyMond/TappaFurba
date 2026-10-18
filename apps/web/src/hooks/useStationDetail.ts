import type { StationDetailResponse } from "@tappafurba/shared";
import { useEffect, useState } from "react";
import { ApiError, fetchStationDetail } from "../lib/api";

export type StationDetailState =
  | { status: "loading" }
  | { status: "error"; error: ApiError }
  | { status: "success"; detail: StationDetailResponse };

const toApiError = (error: unknown) =>
  error instanceof ApiError ? error : new ApiError("UNKNOWN", "Si è verificato un errore imprevisto. Riprova.", 0);

/**
 * Dettaglio della stazione: una richiesta per coppia ricerca/stazione, annullata se si cambia schermata.
 * La deviazione viene verificata dal server col routing reale (o dichiarata stima): il client non ricalcola nulla.
 */
export function useStationDetail(searchId: string, stationId: number, attempt = 0): StationDetailState {
  const [state, setState] = useState<StationDetailState>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: "loading" });
    fetchStationDetail(searchId, stationId, controller.signal)
      .then((detail) => setState({ status: "success", detail }))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setState({ status: "error", error: toApiError(error) });
      });
    return () => controller.abort();
  }, [searchId, stationId, attempt]);

  return state;
}

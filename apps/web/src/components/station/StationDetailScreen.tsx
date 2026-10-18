import type { StationDetailResponse } from "@tappafurba/shared";
import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useNotice } from "../../hooks/useNotice";
import { useStationDetail } from "../../hooks/useStationDetail";
import { fuelModeLabel } from "../../lib/stationView";
import { NavigateSheet } from "../results/NavigateSheet";
import { NavigateBar } from "./NavigateBar";
import { shareDetail, shareNotice } from "./shareDetail";
import { StationDetailBody } from "./StationDetailBody";
import { StationHeader } from "./StationHeader";

/**
 * Screen 3 — Dettaglio stazione (rotta `/station/:searchId/:stationId`). Il server verifica la deviazione col routing
 * reale (o la dichiara stima); qui si mostra: intestazione, impatto sul viaggio, listino prezzi e la CTA per navigare.
 * Indietro riporta a `/results`, dove la ricerca (e i filtri) sono ancora quelli di prima. Su desktop, con i risultati in
 * memoria, «Info» apre invece il dialogo `StationDetailDialog` senza cambiare rotta: questa schermata resta per mobile e deep-link.
 */
export function StationDetailScreen() {
  const { searchId = "", stationId = "" } = useParams();
  const id = Number(stationId);
  const navigate = useNavigate();
  const [attempt, setAttempt] = useState(0);
  const state = useStationDetail(searchId, Number.isInteger(id) && id > 0 ? id : 0, attempt);
  const [menuOpen, setMenuOpen] = useState(false);
  const [notice, showNotice] = useNotice();
  useEffect(() => {
    window.scrollTo?.(0, 0);
  }, [searchId, stationId]);

  const goBack = useCallback(() => navigate("/results"), [navigate]);
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  const detail: StationDetailResponse | null = state.status === "success" ? state.detail : null;

  const share = async () => {
    if (!detail) return;
    const message = shareNotice(await shareDetail(detail));
    if (message) showNotice(message);
  };

  return (
    <div className="flex-1 bg-surface">
      <StationHeader onBack={goBack} onShare={share} actionsDisabled={detail === null} />

      <main className="max-w-md mx-auto px-margin pt-[calc(88px+env(safe-area-inset-top,0px))] pb-[calc(9rem+env(safe-area-inset-bottom,0px))] flex flex-col gap-space-lg">
        {notice && (
          <p role="status" className="self-center rounded-full bg-inverse-surface text-inverse-on-surface text-label-lg font-label-lg px-space-xl py-space-sm shadow-lg">
            {notice}
          </p>
        )}

        <StationDetailBody state={state} onRetry={() => setAttempt((n) => n + 1)} onBack={goBack} />
      </main>

      <NavigateBar stationName={detail?.station.nomeImpianto ?? "stazione"} onNavigate={() => setMenuOpen(true)} disabled={detail === null} />

      {menuOpen && detail && (
        <NavigateSheet
          station={detail.station}
          summary={{ price: detail.selected.price, modeLabel: fuelModeLabel(detail.selected.fuelType, detail.selected.isSelf), netSavings: detail.impact.netSavings }}
          onClose={closeMenu}
        />
      )}
    </div>
  );
}

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import {
  computeSheetBounds,
  nearestSnap,
  nextTapSnap,
  RESULTS_TAB_RESELECTED_EVENT,
  rubberBandHeight,
  SHEET_DRAG_SLOP_PX,
  type SheetLayout,
  type SheetSnap,
} from "../lib/sheetSnap";

interface DragState {
  pointerId: number;
  startY: number;
  startHeight: number;
  moved: boolean;
  lastHeight: number;
}

const sameLayout = (a: SheetLayout | null, b: SheetLayout | null) =>
  a === b ? true : a !== null && b !== null && a.minimized === b.minimized && a.collapsed === b.collapsed && a.expanded === b.expanded && a.mapBase === b.mapBase && a.mapTall === b.mapTall;

/**
 * Foglio trascinabile dei Risultati su mobile, con tre punti di aggancio: ridotto (solo la maniglia sopra la barra), chiuso
 * (predefinito) ed espanso (~85%). Il drag parte SOLO dalla testata (maniglia e striscia che la contiene): l'elenco sotto
 * mantiene il proprio scorrimento. Il dito muove l'altezza del foglio (ancorato al fondo dello schermo) con effetto elastico
 * ai bordi; al rilascio si aggancia al punto più vicino con una transizione in CSS.
 *
 * Un tocco senza trascinamento (o un clic, o Invio/Spazio sul pulsante) fa: ridotto → chiuso, chiuso → espanso, espanso →
 * chiuso; non riduce MAI. Con la cattura del puntatore il clic arriva alla testata e non al pulsante: per questo
 * `onToggleClick` va sulla testata (il clic generato dalla tastiera sul pulsante vi risale per bolla).
 * Un tocco sulla scheda «Risultati» già attiva della barra inferiore (evento `RESULTS_TAB_RESELECTED_EVENT`) riporta da
 * ridotto a chiuso. Lo stato non si salva: ogni nuova ricerca (`resetKey`) riparte da chiuso.
 *
 * Perché l'altezza e non una traslazione: il banner dei prezzi e il fondo dell'elenco devono restare ancorati al fondo
 * dello schermo; con `translateY` il fondo del foglio uscirebbe dallo schermo da chiuso.
 *
 * `containerRef` è la regione sotto l'header; `footerRef` il fondo del foglio, il cui padding inferiore è l'ingombro della
 * barra inferiore (da lì si ricava l'altezza del punto ridotto).
 */
export function useBottomSheet({
  containerRef,
  sheetRef,
  footerRef,
  resetKey,
}: {
  containerRef: RefObject<HTMLElement | null>;
  sheetRef: RefObject<HTMLElement | null>;
  footerRef: RefObject<HTMLElement | null>;
  resetKey: string;
}) {
  const [snap, setSnap] = useState<SheetSnap>("collapsed");
  const [layout, setLayout] = useState<SheetLayout | null>(null);
  const [dragHeight, setDragHeight] = useState<number | null>(null);
  const drag = useRef<DragState | null>(null);
  const suppressClick = useRef(false);
  // Letti dai gestori senza ricrearli a ogni render.
  const live = useRef({ snap, layout });
  live.current = { snap, layout };

  // Ogni nuova ricerca riparte da «chiuso».
  useEffect(() => {
    setSnap("collapsed");
    setDragHeight(null);
    drag.current = null;
  }, [resetKey]);

  // Misura i punti di aggancio all'avvio e quando cambiano le dimensioni (rotazione, barra del browser, schermata
  // di nuovo visibile dopo il dettaglio stazione, altezza della barra inferiore).
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const measure = () => {
      const footer = footerRef.current;
      const clearance = footer ? parseFloat(getComputedStyle(footer).paddingBottom) : 0;
      const next = computeSheetBounds(container.clientHeight, window.innerHeight, Number.isFinite(clearance) ? clearance : 0);
      setLayout((current) => (sameLayout(current, next) ? current : next));
    };
    measure();
    window.addEventListener("resize", measure);
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(container);
    if (footerRef.current) observer?.observe(footerRef.current);
    return () => {
      window.removeEventListener("resize", measure);
      observer?.disconnect();
    };
  }, [containerRef, footerRef]);

  // Tap sulla scheda «Risultati» già attiva mentre il foglio è ridotto: torna a «chiuso».
  useEffect(() => {
    const restore = () => {
      if (live.current.snap === "minimized") setSnap("collapsed");
    };
    window.addEventListener(RESULTS_TAB_RESELECTED_EVENT, restore);
    return () => window.removeEventListener(RESULTS_TAB_RESELECTED_EVENT, restore);
  }, []);

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      const { snap: current, layout: l } = live.current;
      if (!l) return;
      const measured = sheetRef.current?.getBoundingClientRect().height ?? 0;
      const startHeight = measured > 0 ? measured : l[current];
      drag.current = { pointerId: event.pointerId, startY: event.clientY, startHeight, moved: false, lastHeight: startHeight };
      // Il mouse non ha cattura implicita (il dito sì): senza questa i movimenti fuori dalla striscia (18 px) andrebbero persi.
      event.currentTarget.setPointerCapture?.(event.pointerId);
    },
    [sheetRef],
  );

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const state = drag.current;
      const l = live.current.layout;
      if (!state || !l || event.pointerId !== state.pointerId) return;
      const delta = state.startY - event.clientY; // verso l'alto = foglio più alto
      if (!state.moved) {
        if (Math.abs(delta) < SHEET_DRAG_SLOP_PX) return;
        state.moved = true;
      }
      const max = containerRef.current?.clientHeight ?? l.expanded;
      state.lastHeight = rubberBandHeight(state.startHeight + delta, l, max);
      setDragHeight(state.lastHeight);
    },
    [containerRef],
  );

  const finish = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    const state = drag.current;
    const l = live.current.layout;
    if (!state || event.pointerId !== state.pointerId) return;
    drag.current = null;
    if (!state.moved || !l) return; // un tocco: ci pensa il clic sulla testata
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture?.(event.pointerId);
    // Dopo un trascinamento col mouse arriva comunque un clic: non deve cambiare di nuovo il foglio.
    suppressClick.current = true;
    setTimeout(() => {
      suppressClick.current = false;
    }, 0);
    setSnap(nearestSnap(state.lastHeight, l));
    setDragHeight(null);
  }, []);

  /** Clic (dito, mouse o tastiera) sulla testata; dopo un trascinamento il clic residuo si ignora. */
  const onToggleClick = useCallback(() => {
    if (suppressClick.current) return;
    setSnap(nextTapSnap);
  }, []);

  const height = dragHeight ?? (layout ? layout[snap] : null);
  // La mappa si allunga fino al foglio solo quando questo scende sotto «chiuso»; altrimenti resta al 40%.
  const mapHeight = layout ? (height !== null && height < layout.collapsed ? layout.mapTall : layout.mapBase) : null;

  return {
    snap,
    /** Altezza in px da applicare al foglio, o null se il layout non è misurabile (si usa il valore di ripiego in CSS). */
    height,
    /** Altezza in px della mappa, o null se il layout non è misurabile. */
    mapHeight,
    dragging: dragHeight !== null,
    /** Il foglio è ridotto a riposo: il contenuto (elenco, banner) si nasconde, resta solo la maniglia. */
    contentHidden: snap === "minimized" && dragHeight === null,
    /** Gestori da mettere sulla testata (striscia della maniglia). */
    headerHandlers: { onPointerDown, onPointerMove, onPointerUp: finish, onPointerCancel: finish },
    onToggleClick,
  };
}

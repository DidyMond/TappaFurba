export interface MarkerPosition {
  id: number;
  /** Punto di ancoraggio in pixel (la punta del pin): il pin sta sopra e centrato su x. */
  x: number;
  y: number;
}

export interface DeclutterOptions {
  /** Ingombro del pin in pixel. */
  width: number;
  height: number;
  /** Margine minimo tra due pin. */
  gap?: number;
  /** Area visibile: i pin che ricadono del tutto fuori non contano. */
  viewport?: { width: number; height: number };
}

/**
 * Sceglie quali marker mostrare perché non si sovrappongano: si scorrono in ordine di priorità
 * (il primo ha la precedenza) e ne resta visibile uno solo per ogni gruppo di marker vicini.
 * Zoomando, i pin si allontanano e ricompaiono.
 */
export function pickVisibleMarkers(markersByPriority: readonly MarkerPosition[], options: DeclutterOptions): Set<number> {
  const gap = options.gap ?? 4;
  const halfW = options.width / 2 + gap / 2;
  const h = options.height + gap;
  const kept: MarkerPosition[] = [];

  for (const marker of markersByPriority) {
    if (options.viewport) {
      const { width, height } = options.viewport;
      if (marker.x + halfW < 0 || marker.x - halfW > width || marker.y < 0 || marker.y - h > height) continue;
    }
    const overlaps = kept.some((other) => Math.abs(other.x - marker.x) < halfW * 2 && Math.abs(other.y - marker.y) < h);
    if (!overlaps) kept.push(marker);
  }
  return new Set(kept.map((m) => m.id));
}

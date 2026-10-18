import { useSyncExternalStore } from "react";

/** Da qui in su il layout è «desktop» (breakpoint `lg` di Tailwind): Home a due colonne, Impostazioni 2×2, dettaglio in dialogo. */
export const DESKTOP_QUERY = "(min-width: 1024px)";

const matcher = (query: string): MediaQueryList | null => (typeof window !== "undefined" && typeof window.matchMedia === "function" ? window.matchMedia(query) : null);

/**
 * Segue una media query. Senza `matchMedia` (jsdom, SSR) vale false: si resta sul layout mobile. Serve dove il layout non è
 * solo CSS (un altro albero di componenti, un dialogo al posto di una rotta): le classi `lg:` bastano altrove.
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = matcher(query);
      list?.addEventListener?.("change", onChange);
      return () => list?.removeEventListener?.("change", onChange);
    },
    () => matcher(query)?.matches ?? false,
    () => false,
  );
}

export const useIsDesktop = () => useMediaQuery(DESKTOP_QUERY);

/** Full HD e oltre (breakpoint `2xl` di Tailwind): Home a 7xl con i tragitti frequenti su due colonne. */
export const WIDE_QUERY = "(min-width: 1536px)";
export const useIsWide = () => useMediaQuery(WIDE_QUERY);

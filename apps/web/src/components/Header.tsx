import { useEffect, useState } from "react";
import { BrandLogo } from "./BrandLogo";

/** Oltre questo scorrimento (px) la header diventa «glass». */
export const HEADER_SCROLL_THRESHOLD_PX = 4;

interface HeaderProps {
  /** Sulla Home la header è trasparente a scrollTop=0 e passa al glass solo quando la pagina scorre. */
  transparentAtTop?: boolean;
  /** Da `lg` in su il contenuto della header si allarga (max-w-6xl) invece di restare nella colonna mobile. */
  wide?: boolean;
}

/**
 * Header globale (vedi DESIGN.md — "Header (global pattern, identical on all
 * screens)"): brand centrato in una griglia a tre colonne (vuota | brand | vuota). Nessun avatar: nell'MVP non c'è
 * autenticazione né profilo, quindi sarebbe un controllo senza funzione.
 * Glass (surface/85 + sfocatura) quando serve a separarla dal contenuto che scorre; a riposo sulla Home è trasparente
 * (anche senza sfocatura: altrimenti il suo bordo inferiore taglierebbe l'alone della barra di ricerca).
 */
export function Header({ transparentAtTop = false, wide = false }: HeaderProps) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const update = () => setScrolled(window.scrollY > HEADER_SCROLL_THRESHOLD_PX);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);
  const glass = !transparentAtTop || scrolled;

  return (
    <header
      data-testid="app-header"
      data-glass={glass ? "true" : "false"}
      className={`fixed top-0 w-full z-30 pt-safe transition-colors duration-200 ${glass ? "bg-surface/85 backdrop-blur-xl" : "bg-transparent"}`}
    >
      <div className={`h-[72px] px-gutter grid grid-cols-[1fr_auto_1fr] items-center max-w-md mx-auto ${wide ? "lg:max-w-6xl lg:px-8" : ""}`}>
        <div aria-hidden="true" />

        <div data-testid="header-brand" className="flex items-center gap-2.5">
          <BrandLogo className="w-9 h-9 shrink-0" />
          <span className="font-headline-lg text-headline-md font-bold text-on-surface tracking-tight leading-none">TappaFurba</span>
        </div>

        <div aria-hidden="true" />
      </div>
    </header>
  );
}

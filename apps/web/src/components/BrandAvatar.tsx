import { useState } from "react";
import { brandLogoUrl } from "../lib/brandLogos";
import { brandInitials } from "../lib/stationView";

interface BrandAvatarProps {
  bandiera: string;
  /** Per le iniziali, se la bandiera è vuota. */
  gestore?: string;
  /** `card`: scheda risultato (40 px); `detail`: intestazione del dettaglio (riquadro da 56 px, logo al massimo 48 px). */
  size: "card" | "detail";
  /** Solo la scheda: la «migliore» ha le iniziali su fondo verde chiaro. */
  best?: boolean;
}

/**
 * Avatar del brand della stazione. Con il logo della bandiera (file statico in `/brands`, vedi `brandLogos.ts`): immagine
 * decorativa (`alt=""`: il nome della bandiera è già nel testo) su una tessera bianca a bordo arrotondato, `object-contain`.
 * Senza logo, o se il file non si carica: le iniziali, come prima.
 *
 * Il posto è riservato: il riquadro esterno ha sempre la stessa misura (40 o 56 px) con o senza logo e l'immagine ha
 * larghezza e altezza esplicite, quindi la pagina non si sposta mentre il file arriva. I PNG sono 50×50: nel dettaglio il
 * logo sta in una tessera da 48 px (mai a 56 px, dove sarebbe ingrandito).
 */
export function BrandAvatar({ bandiera, gestore = "", size, best = false }: BrandAvatarProps) {
  const url = brandLogoUrl(bandiera);
  const [failed, setFailed] = useState<string | null>(null);
  const showLogo = url !== null && failed !== url;
  const box = size === "card" ? "w-10 h-10" : "w-14 h-14";

  if (showLogo) {
    // Tessera: 40 px con immagine da 32 (scheda); 48 px con immagine da 40 (dettaglio).
    const tile = size === "card" ? "w-10 h-10 rounded-xl p-1" : "w-12 h-12 rounded-2xl p-1";
    const image = size === "card" ? 32 : 40;
    return (
      <div aria-hidden="true" data-testid="brand-avatar" data-brand-logo="true" className={`${box} flex items-center justify-center shrink-0`}>
        <span className={`${tile} flex items-center justify-center bg-surface-container-lowest border border-outline-variant/40 shadow-xs overflow-hidden`}>
          <img
            src={url}
            alt=""
            width={image}
            height={image}
            loading="lazy"
            decoding="async"
            draggable={false}
            onError={() => setFailed(url)}
            className="w-full h-full object-contain"
          />
        </span>
      </div>
    );
  }

  const tone =
    size === "card" && best ? "bg-primary/10 text-on-primary-fixed-variant" : "bg-secondary/10 text-on-secondary-fixed-variant";
  const text = size === "card" ? "text-label-lg font-label-lg" : "text-headline-sm font-headline-sm";
  return (
    <div aria-hidden="true" data-testid="brand-avatar" className={`${box} rounded-full flex items-center justify-center shrink-0 ${text} ${tone}`}>
      {brandInitials(bandiera, gestore)}
    </div>
  );
}

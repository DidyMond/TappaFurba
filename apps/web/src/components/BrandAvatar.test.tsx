import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { brandLogoUrl } from "../lib/brandLogos";
import { BrandAvatar } from "./BrandAvatar";

const avatar = () => screen.getByTestId("brand-avatar");

describe("BrandAvatar — scheda risultato (40 px)", () => {
  it("con logo: tessera bianca a bordo arrotondato, immagine decorativa (alt vuoto) object-contain, file locale /brands", () => {
    render(<BrandAvatar bandiera="Agip Eni" size="card" />);
    expect(avatar()).toHaveAttribute("data-brand-logo", "true");
    expect(avatar()).toHaveAttribute("aria-hidden", "true");
    const img = avatar().querySelector("img")!;
    expect(img.getAttribute("src")).toBe(brandLogoUrl("Agip Eni"));
    expect(img.getAttribute("src")).toMatch(/^\/brands\/\d+\.png$/);
    expect(img.getAttribute("alt")).toBe(""); // il nome della bandiera è già nel testo accanto
    expect(img).toHaveClass("object-contain");
    const tile = img.parentElement!;
    expect(tile).toHaveClass("bg-surface-container-lowest", "border", "rounded-xl", "w-10", "h-10");
    expect(avatar().textContent).toBe(""); // niente iniziali sotto il logo
  });

  it("senza logo (bandiera sconosciuta o segnaposto generico): le iniziali di prima, stesso riquadro da 40 px", () => {
    for (const [name, initials] of [["Pompe Bianche", "PB"], ["Bandiera Inventata", "BI"], ["Som/Omv", "SO"]] as const) {
      const { unmount } = render(<BrandAvatar bandiera={name} size="card" />);
      expect(avatar().textContent).toBe(initials);
      expect(avatar().querySelector("img")).toBeNull();
      expect(avatar()).not.toHaveAttribute("data-brand-logo");
      expect(avatar()).toHaveClass("w-10", "h-10", "rounded-full", "bg-secondary/10", "text-on-secondary-fixed-variant");
      unmount();
    }
  });

  it("la «migliore» senza logo ha le iniziali su verde chiaro (come prima)", () => {
    render(<BrandAvatar bandiera="Bandiera Inventata" size="card" best />);
    expect(avatar()).toHaveClass("bg-primary/10", "text-on-primary-fixed-variant");
  });

  it("layout stabile: stesso riquadro 40×40 con e senza logo; immagine con larghezza/altezza esplicite e caricamento pigro", () => {
    const { unmount } = render(<BrandAvatar bandiera="Agip Eni" size="card" />);
    const withLogo = avatar();
    expect(withLogo).toHaveClass("w-10", "h-10", "shrink-0");
    const img = withLogo.querySelector("img")!;
    expect([img.width, img.height]).toEqual([32, 32]); // 32 + 4 + 4 di margine interno = 40
    expect(img.getAttribute("loading")).toBe("lazy");
    expect(img.getAttribute("decoding")).toBe("async");
    unmount();
    render(<BrandAvatar bandiera="Bandiera Inventata" size="card" />);
    expect(avatar()).toHaveClass("w-10", "h-10", "shrink-0");
  });

  it("se il file non si carica si ripiega sulle iniziali (senza lasciare un'immagine rotta)", () => {
    render(<BrandAvatar bandiera="Agip Eni" size="card" />);
    fireEvent.error(avatar().querySelector("img")!);
    expect(avatar().querySelector("img")).toBeNull();
    expect(avatar().textContent).toBe("AE");
    expect(avatar()).toHaveClass("w-10", "h-10", "rounded-full");
  });
});

describe("BrandAvatar — dettaglio stazione (riquadro 56 px, logo al massimo 48 px)", () => {
  it("con logo: tessera da 48 px (mai 56: i PNG sono 50×50) con l'immagine da 40 px, dentro un riquadro da 56 px che non cambia", () => {
    render(<BrandAvatar bandiera="Q8" size="detail" />);
    expect(avatar()).toHaveClass("w-14", "h-14", "shrink-0"); // 56: lo stesso del caso con iniziali
    const img = avatar().querySelector("img")!;
    const tile = img.parentElement!;
    expect(tile).toHaveClass("w-12", "h-12", "rounded-2xl", "bg-surface-container-lowest");
    expect(img.width).toBeLessThanOrEqual(48);
    expect(img.width).toBe(40);
    expect(img.getAttribute("alt")).toBe("");
  });

  it("senza logo: iniziali nel cerchio da 56 px, come prima", () => {
    render(<BrandAvatar bandiera="Pompe Bianche" gestore="Rossi" size="detail" />);
    expect(avatar().textContent).toBe("PB");
    expect(avatar()).toHaveClass("w-14", "h-14", "rounded-full", "text-headline-sm");
  });

  it("bandiera vuota: le iniziali vengono dal gestore", () => {
    render(<BrandAvatar bandiera="" gestore="Mario Rossi" size="detail" />);
    expect(avatar().textContent).toBe("MR");
  });
});

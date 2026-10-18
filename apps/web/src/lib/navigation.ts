/**
 * Deep-link per aprire la navigazione esterna verso una stazione.
 * iOS → Apple Maps, Android → Google Maps, altrove → menu con Google Maps, Apple Maps e Waze.
 * Solo link web universali (https): funzionano anche senza l'app installata.
 */
export type Platform = "ios" | "android" | "other";

export type NavigationApp = "apple" | "google" | "waze";

export interface NavigationTarget {
  name: string;
  lat: number;
  lon: number;
}

export interface NavigationLink {
  app: NavigationApp;
  label: string;
  url: string;
}

export function detectPlatform(userAgent: string, maxTouchPoints = 0): Platform {
  if (/iPhone|iPad|iPod/i.test(userAgent)) return "ios";
  // iPadOS 13+ si presenta come Mac: lo distingue il multitouch.
  if (/Macintosh/i.test(userAgent) && maxTouchPoints > 1) return "ios";
  if (/Android/i.test(userAgent)) return "android";
  return "other";
}

const coords = (t: NavigationTarget) => `${t.lat.toFixed(6)},${t.lon.toFixed(6)}`;

const BUILDERS: Record<NavigationApp, { label: string; url: (t: NavigationTarget) => string }> = {
  apple: {
    label: "Apple Maps",
    url: (t) => `https://maps.apple.com/?daddr=${coords(t)}&dirflg=d&q=${encodeURIComponent(t.name)}`,
  },
  google: {
    label: "Google Maps",
    url: (t) => `https://www.google.com/maps/dir/?api=1&destination=${coords(t)}&travelmode=driving`,
  },
  waze: {
    label: "Waze",
    url: (t) => `https://waze.com/ul?ll=${coords(t)}&navigate=yes`,
  },
};

export function navigationLink(app: NavigationApp, target: NavigationTarget): NavigationLink {
  return { app, label: BUILDERS[app].label, url: BUILDERS[app].url(target) };
}

/** Tutte le app, per il menu di scelta. */
export function navigationLinks(target: NavigationTarget): NavigationLink[] {
  return (["google", "apple", "waze"] as const).map((app) => navigationLink(app, target));
}

/** Il link da aprire direttamente per la piattaforma, o null se serve il menu di scelta. */
export function primaryNavigationLink(platform: Platform, target: NavigationTarget): NavigationLink | null {
  if (platform === "ios") return navigationLink("apple", target);
  if (platform === "android") return navigationLink("google", target);
  return null;
}

export interface LaunchEnvironment {
  userAgent: string;
  maxTouchPoints: number;
  open: (url: string, target: string, features: string) => unknown;
}

/**
 * «Apri nel navigatore»: su iOS apre Apple Maps e su Android Google Maps direttamente (link universali https, che
 * aprono l'app se installata); altrove non apre nulla e restituisce null, così la UI mostra il menu di scelta con
 * Google Maps, Apple Maps e Waze. Restituisce il link aperto, se c'è.
 */
export function launchNavigation(target: NavigationTarget, env?: Partial<LaunchEnvironment>): NavigationLink | null {
  const userAgent = env?.userAgent ?? navigator.userAgent;
  const maxTouchPoints = env?.maxTouchPoints ?? navigator.maxTouchPoints;
  const open = env?.open ?? ((url, name, features) => window.open(url, name, features));
  const link = primaryNavigationLink(detectPlatform(userAgent, maxTouchPoints), target);
  if (link) open(link.url, "_blank", "noopener,noreferrer");
  return link;
}

export interface NavigationOptions {
  /** Tutte le app, con quella consigliata per il sistema rilevato (se c'è) in prima posizione. */
  links: NavigationLink[];
  /** App di sistema consigliata: Apple Maps su iOS, Google Maps su Android, null altrove. */
  recommended: NavigationApp | null;
}

/**
 * Le opzioni del menu «Apri nel Navigatore»: l'app predefinita del sistema rilevato va per prima ed è «consigliata»;
 * le altre seguono nell'ordine Google Maps, Apple Maps, Waze. Un tap sul consigliato equivale al lancio diretto.
 */
export function orderedNavigationLinks(target: NavigationTarget, env?: Partial<Pick<LaunchEnvironment, "userAgent" | "maxTouchPoints">>): NavigationOptions {
  const userAgent = env?.userAgent ?? navigator.userAgent;
  const maxTouchPoints = env?.maxTouchPoints ?? navigator.maxTouchPoints;
  const recommended = primaryNavigationLink(detectPlatform(userAgent, maxTouchPoints), target)?.app ?? null;
  const links = navigationLinks(target);
  if (!recommended) return { links, recommended: null };
  return { links: [...links.filter((l) => l.app === recommended), ...links.filter((l) => l.app !== recommended)], recommended };
}

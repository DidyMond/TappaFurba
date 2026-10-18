import { vi } from "vitest";

/**
 * Simula `window.matchMedia` in jsdom con la larghezza della finestra: `setViewportWidth(1280)` porta il layout desktop
 * (min-width: 1024px), `setViewportWidth(390)` il mobile. Gli ascoltatori registrati vengono avvisati del cambio.
 * Da chiamare in `afterEach` con `resetViewport()` per tornare a «nessun matchMedia» (mobile).
 */
let width = 390;
const listeners = new Set<{ query: string; fn: () => void }>();

const evaluate = (query: string): boolean => {
  const min = /\(min-width:\s*(\d+)px\)/.exec(query);
  const max = /\(max-width:\s*(\d+)px\)/.exec(query);
  return (!min || width >= Number(min[1])) && (!max || width <= Number(max[1]));
};

export function installMatchMedia(): void {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: vi.fn((query: string) => ({
      get matches() {
        return evaluate(query);
      },
      media: query,
      addEventListener: (_: string, fn: () => void) => listeners.add({ query, fn }),
      removeEventListener: (_: string, fn: () => void) => {
        for (const entry of listeners) if (entry.fn === fn) listeners.delete(entry);
      },
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
      onchange: null,
    })),
  });
}

export function setViewportWidth(next: number): void {
  if (typeof window.matchMedia !== "function" || !(window.matchMedia as { mock?: unknown }).mock) installMatchMedia();
  width = next;
  for (const { fn } of [...listeners]) fn();
}

export function resetViewport(): void {
  width = 390;
  listeners.clear();
  Reflect.deleteProperty(window, "matchMedia");
}

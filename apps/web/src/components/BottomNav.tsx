import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { RESULTS_TAB_RESELECTED_EVENT } from "../lib/sheetSnap";
import { GasStationIcon, SearchIcon, SettingsIcon } from "./icons";

interface BottomNavProps {
  /** La scheda Risultati è raggiungibile solo dopo una ricerca riuscita. */
  hasResults: boolean;
}

/** Durata dello scorrimento dell'indicatore tra le schede (ms): 200–250 con ease-out, come l'indicatore di un tab bar iOS. */
export const NAV_INDICATOR_MS = 220;

const base = "relative z-10 flex flex-col items-center gap-0.5 py-1 px-space-lg rounded-full transition-colors";
const active = "text-on-primary-fixed-variant";
const inactive = "text-on-surface-variant hover:text-on-surface";

const TABS = ["/", "/results", "/settings"] as const;
/** Identificatori per i test end-to-end (non si asserisce mai il testo delle etichette). */
const TAB_TEST_IDS = ["nav-home", "nav-results", "nav-settings"] as const;

/** Scheda attiva dal percorso: Cerca solo sulla Home, le altre per prefisso; Risultati conta solo se raggiungibile. */
function activeIndex(pathname: string, hasResults: boolean): number {
  if (pathname === "/") return 0;
  if (hasResults && (pathname === "/results" || pathname.startsWith("/results/"))) return 1;
  if (pathname === "/settings" || pathname.startsWith("/settings/")) return 2;
  return -1;
}

interface IndicatorBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Navigazione globale (DESIGN.md — Bottom Navigation): pillola flottante con icona sopra e etichetta sotto.
 * Tre schede: Cerca, Risultati (attiva dopo una ricerca) e Impostazioni. «Percorso» (Screen 4) è sospesa.
 *
 * Il riempimento della scheda attiva è un indicatore unico, posizionato in assoluto DIETRO le etichette, che scorre da una
 * scheda all'altra (transizione di `transform`, ~220 ms ease-out; nessuna sfocatura in più). Le posizioni si misurano dai
 * riferimenti alle schede e si rimisurano quando cambiano le dimensioni (font caricati, rotazione). Con
 * `prefers-reduced-motion` l'indicatore salta senza animazione. Tastiera e ARIA non cambiano: restano i link (e `aria-current`).
 */
export function BottomNav({ hasResults }: BottomNavProps) {
  const { pathname } = useLocation();
  const index = activeIndex(pathname, hasResults);
  const navRef = useRef<HTMLElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const tabs = useRef<Array<HTMLElement | null>>([]);
  const [box, setBox] = useState<IndicatorBox | null>(null);
  // La prima posizione si imposta senza animazione (l'indicatore non deve «arrivare» da 0 al caricamento).
  const [animate, setAnimate] = useState(false);

  useLayoutEffect(() => {
    const measure = () => {
      // Altezza della barra per i fogli che scendono dietro di essa (vedi --bottom-nav-clearance in index.css).
      const navHeight = navRef.current?.offsetHeight ?? 0;
      if (navHeight > 0) document.documentElement.style.setProperty("--bottom-nav-height", navHeight + "px");
      const tab = index >= 0 ? tabs.current[index] : null;
      if (!tab) return setBox(null);
      setBox((current) => {
        const next = { x: tab.offsetLeft, y: tab.offsetTop, width: tab.offsetWidth, height: tab.offsetHeight };
        return current && current.x === next.x && current.y === next.y && current.width === next.width && current.height === next.height ? current : next;
      });
    };
    measure();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }
    const observer = new ResizeObserver(measure);
    if (track.current) observer.observe(track.current);
    for (const tab of tabs.current) if (tab) observer.observe(tab);
    return () => observer.disconnect();
  }, [index, hasResults]);

  useEffect(() => {
    if (!box || animate) return;
    const frame = requestAnimationFrame(() => setAnimate(true));
    return () => cancelAnimationFrame(frame);
  }, [box, animate]);

  // Un tocco sulla scheda «Risultati» GIÀ attiva avvisa il foglio dei Risultati (se è ridotto torna a «chiuso»).
  const onResultsTabClick = () => {
    if (index === 1) window.dispatchEvent(new Event(RESULTS_TAB_RESELECTED_EVENT));
  };

  const setTab = (i: number) => (node: HTMLElement | null) => {
    tabs.current[i] = node;
  };
  const tabClass = (isActive: boolean) => `${base} ${isActive ? active : inactive}`;
  const link = (i: number, label: string, icon: ReactNode) => (
    <NavLink ref={setTab(i)} data-testid={TAB_TEST_IDS[i]} to={TABS[i]!} end={i === 0} className={({ isActive }) => tabClass(isActive)} onClick={i === 1 ? onResultsTabClick : undefined}>
      {icon}
      <span className="text-label-sm font-label-sm whitespace-nowrap">{label}</span>
    </NavLink>
  );

  return (
    <nav
      ref={navRef}
      aria-label="Navigazione principale"
      className="fixed inset-x-4 bottom-[var(--bottom-nav-offset)] z-40 mx-auto max-w-md rounded-full bg-surface/85 backdrop-blur-xl shadow-lg border border-outline-variant/30 px-space-md py-space-sm"
    >
      <div ref={track} className="relative flex items-center justify-around">
        <span
          aria-hidden="true"
          data-testid="nav-indicator"
          data-index={index}
          className={`absolute left-0 top-0 rounded-full bg-primary-fixed/30 pointer-events-none motion-reduce:transition-none ${
            animate ? "transition-[transform,width,opacity] ease-out" : "transition-none"
          } ${box ? "opacity-100" : "opacity-0"}`}
          style={{
            width: box?.width ?? 0,
            height: box?.height ?? 0,
            transform: `translate(${box?.x ?? 0}px, ${box?.y ?? 0}px)`,
            transitionDuration: animate ? `${NAV_INDICATOR_MS}ms` : undefined,
          }}
        />
        {link(0, "Cerca", <SearchIcon />)}
        {hasResults ? (
          link(1, "Risultati", <GasStationIcon />)
        ) : (
          <span aria-disabled="true" title="Fai prima una ricerca" className={`${base} text-on-surface-variant opacity-50 cursor-not-allowed`}>
            <GasStationIcon />
            <span className="text-label-sm font-label-sm whitespace-nowrap">Risultati</span>
          </span>
        )}
        {link(2, "Impostazioni", <SettingsIcon />)}
      </div>
    </nav>
  );
}

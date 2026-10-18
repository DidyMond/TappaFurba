import type { SearchFuelType } from "@tappafurba/shared";
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { FACTORY_SETTINGS, factorySettings, loadSettings, saveSettings, type Settings } from "../lib/settings";

interface SettingsContextValue {
  settings: Settings;
  /** Salva le preferenze (sostituisce le precedenti, conservando la cache dell'ultimo prezzo automatico). */
  save: (next: Settings) => void;
  /** Valori di fabbrica, compreso «Automatico» sul prezzo di riferimento. Restituisce le nuove impostazioni. */
  reset: () => Settings;
  /** Ricorda l'ultimo prezzo di riferimento automatico di un carburante (serve a pre-compilare «Manuale»). */
  rememberAutomaticReference: (fuel: SearchFuelType, value: number) => void;
}

const FALLBACK: SettingsContextValue = {
  settings: FACTORY_SETTINGS,
  save: () => {},
  reset: () => FACTORY_SETTINGS,
  rememberAutomaticReference: () => {},
};

const SettingsContext = createContext<SettingsContextValue | null>(null);

/**
 * Impostazioni dell'utente per tutta l'app: lette da localStorage all'avvio e riscritte a ogni salvataggio.
 * Il form di ricerca le usa come valori iniziali; le ricerche ne ricevono i parametri dell'algoritmo.
 */
export function SettingsProvider({ children, initial }: { children: ReactNode; initial?: Settings }) {
  const [settings, setSettings] = useState<Settings>(() => initial ?? loadSettings());
  // L'ultimo stato, per calcolare il successivo senza effetti collaterali dentro l'aggiornamento di stato.
  const latest = useRef(settings);
  latest.current = settings;

  const commit = useCallback((next: Settings) => {
    latest.current = next;
    saveSettings(next);
    setSettings(next);
  }, []);

  const save = useCallback(
    (next: Settings) => commit({ ...next, lastAutomaticReference: { ...latest.current.lastAutomaticReference } }),
    [commit],
  );

  const reset = useCallback(() => {
    const next = factorySettings(latest.current);
    commit(next);
    return next;
  }, [commit]);

  const rememberAutomaticReference = useCallback(
    (fuel: SearchFuelType, value: number) => {
      const rounded = Math.round(value * 1000) / 1000;
      const previous = latest.current.lastAutomaticReference[fuel];
      if (previous !== undefined && Math.abs(previous - rounded) < 0.0005) return;
      commit({ ...latest.current, lastAutomaticReference: { ...latest.current.lastAutomaticReference, [fuel]: rounded } });
    },
    [commit],
  );

  const value = useMemo(() => ({ settings, save, reset, rememberAutomaticReference }), [settings, save, reset, rememberAutomaticReference]);
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

/** Impostazioni correnti. Senza provider (componente isolato nei test) restituisce i valori di fabbrica. */
export function useSettings(): SettingsContextValue {
  return useContext(SettingsContext) ?? FALLBACK;
}

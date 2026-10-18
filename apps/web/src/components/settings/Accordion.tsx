import type { ReactNode } from "react";
import { ChevronDownIcon } from "../icons";

interface AccordionProps {
  /** Identificatore stabile (serve ad aria-controls e ai test). */
  id: string;
  title: string;
  icon: ReactNode;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
  /** Classi del contenitore della sezione (es. `md:col-span-2` per occupare tutta la riga della griglia). */
  className?: string;
}

/**
 * Sezione a fisarmonica (DESIGN.md — card `rounded-lg`, `shadow-sm`). Il contenuto resta montato anche da chiuso
 * (solo nascosto): i campi non perdono il valore e i controlli di validità restano attivi. `flex` solo da aperta:
 * una classe `display` batterebbe l'attributo `hidden` e la sezione chiusa resterebbe visibile.
 */
export function Accordion({ id, title, icon, open, onToggle, children, className = "" }: AccordionProps) {
  const buttonId = `acc-${id}-button`;
  const panelId = `acc-${id}-panel`;
  return (
    <section className={`rounded-lg bg-surface-container-lowest shadow-sm border border-outline-variant/30 overflow-hidden ${className}`.trim()}>
      <h2>
        <button
          id={buttonId}
          data-testid={`settings-section-${id}`}
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={onToggle}
          className="w-full flex items-center gap-space-md px-space-xl py-space-lg text-left text-headline-sm font-headline-sm text-on-surface"
        >
          <span className="text-on-primary-fixed-variant">{icon}</span>
          <span className="flex-1">{title}</span>
          <ChevronDownIcon className={`text-on-surface-variant transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
      </h2>
      <div id={panelId} role="region" aria-labelledby={buttonId} hidden={!open} className={`px-space-xl pb-space-xl flex-col gap-space-lg ${open ? "flex" : ""}`}>
        {children}
      </div>
    </section>
  );
}

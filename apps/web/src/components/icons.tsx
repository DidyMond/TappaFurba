/** Icone inline (nessun font di icone esterno): 24×24, colore ereditato da `currentColor`. */
interface IconProps {
  className?: string;
}

const base = "w-5 h-5 shrink-0";

/** Tratto unico per tutto il set: 2 su griglia 24, estremi e giunzioni arrotondati (come i punti e gli angoli del logo). */
const stroke = { fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" } as const;

/**
 * Classi di un'icona: la misura di base (20 px) si applica solo se il chiamante non ne passa una sua. Con entrambe nello
 * stesso attributo vincerebbe `w-5` (nel CSS di Tailwind sta dopo `w-3.5`/`w-4`) e la misura richiesta verrebbe ignorata.
 */
function iconClass(extra: string, own = ""): string {
  const sized = /(^|\s)(w|h|size)-/.test(extra);
  return [sized ? "shrink-0" : base, own, extra].filter(Boolean).join(" ");
}

export function SwapIcon({ className = "" }: IconProps) {
  return (
    <svg className={iconClass(className)} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8 4v16M8 4L4.5 7.5M8 4l3.5 3.5" />
      <path d="M16 20V4m0 16l3.5-3.5M16 20l-3.5-3.5" />
    </svg>
  );
}

export function LocateIcon({ className = "" }: IconProps) {
  return (
    <svg className={iconClass(className)} viewBox="0 0 24 24" {...stroke} aria-hidden="true">
      <circle cx="12" cy="12" r="3.5" />
      <circle cx="12" cy="12" r="8" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
    </svg>
  );
}

export function SpinnerIcon({ className = "" }: IconProps) {
  return (
    <svg className={iconClass(className, "animate-spin")} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 00-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function CheckIcon({ className = "" }: IconProps) {
  return (
    <svg className={iconClass(className)} viewBox="0 0 24 24" {...stroke} aria-hidden="true">
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

export function InfoIcon({ className = "" }: IconProps) {
  return (
    <svg className={iconClass(className)} viewBox="0 0 24 24" {...stroke} aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 8h.01" />
    </svg>
  );
}


export function PlusIcon({ className = "" }: IconProps) {
  return (
    <svg className={iconClass(className)} viewBox="0 0 24 24" {...stroke} aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function MinusIcon({ className = "" }: IconProps) {
  return (
    <svg className={iconClass(className)} viewBox="0 0 24 24" {...stroke} aria-hidden="true">
      <path d="M5 12h14" />
    </svg>
  );
}

export function SearchIcon({ className = "" }: IconProps) {
  return (
    <svg className={iconClass(className)} viewBox="0 0 24 24" {...stroke} aria-hidden="true">
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l4.5 4.5" />
    </svg>
  );
}

export function GasStationIcon({ className = "" }: IconProps) {
  return (
    <svg className={iconClass(className)} viewBox="0 0 24 24" {...stroke} aria-hidden="true">
      <path d="M5 21V5a2 2 0 012-2h6a2 2 0 012 2v16M3 21h14M5 10h10" />
      <path d="M15 8h2.5a1.5 1.5 0 011.5 1.5v6a1.5 1.5 0 003 0V8l-3-3" />
    </svg>
  );
}

export function NavigateIcon({ className = "" }: IconProps) {
  return (
    <svg className={iconClass(className)} viewBox="0 0 24 24" {...stroke} aria-hidden="true">
      <path d="M4 20v-6a4 4 0 014-4h11M15 5l4 5-4 5" />
    </svg>
  );
}

export function SavingsIcon({ className = "" }: IconProps) {
  return (
    <svg className={iconClass(className)} viewBox="0 0 24 24" {...stroke} aria-hidden="true">
      <path d="M3 7l7 7 4-4 7 7M21 17v-5m0 5h-5" />
    </svg>
  );
}

export function RouteIcon({ className = "" }: IconProps) {
  return (
    <svg className={iconClass(className)} viewBox="0 0 24 24" {...stroke} aria-hidden="true">
      <circle cx="6" cy="19" r="2" />
      <circle cx="18" cy="5" r="2" />
      <path d="M8 19h6a3.5 3.5 0 000-7h-4a3.5 3.5 0 010-7h6" />
    </svg>
  );
}

export function VerifiedIcon({ className = "" }: IconProps) {
  return (
    <svg className={iconClass(className)} viewBox="0 0 24 24" {...stroke} aria-hidden="true">
      <path d="M12 3l2.4 1.7 2.9-.1 1 2.7 2.4 1.7-.9 2.8.9 2.8-2.4 1.7-1 2.7-2.9-.1L12 21l-2.4-1.7-2.9.1-1-2.7L3.3 15l.9-2.8-.9-2.8 2.4-1.7 1-2.7 2.9.1z" />
      <path d="M8.5 12l2.5 2.5 4.5-5" />
    </svg>
  );
}

export function CloseIcon({ className = "" }: IconProps) {
  return (
    <svg className={iconClass(className)} viewBox="0 0 24 24" {...stroke} aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

export function ExternalIcon({ className = "" }: IconProps) {
  return (
    <svg className={iconClass(className)} viewBox="0 0 24 24" {...stroke} aria-hidden="true">
      <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h5" />
    </svg>
  );
}

export function BackIcon({ className = "" }: IconProps) {
  return (
    <svg className={iconClass(className)} viewBox="0 0 24 24" {...stroke} aria-hidden="true">
      <path d="M19 12H5m0 0l6-6m-6 6l6 6" />
    </svg>
  );
}

export function ShareIcon({ className = "" }: IconProps) {
  return (
    <svg className={iconClass(className)} viewBox="0 0 24 24" {...stroke} aria-hidden="true">
      <circle cx="18" cy="5" r="2.5" />
      <circle cx="6" cy="12" r="2.5" />
      <circle cx="18" cy="19" r="2.5" />
      <path d="M8.2 10.8l7.6-4.4M8.2 13.2l7.6 4.4" />
    </svg>
  );
}

/** Il simbolo «Condividi» di iOS (riquadro aperto con freccia in su), quello che l'utente cerca in Safari. */
export function IosShareIcon({ className = "" }: IconProps) {
  return (
    <svg className={iconClass(className)} viewBox="0 0 24 24" {...stroke} aria-hidden="true">
      <path d="M12 15V3M8 7l4-4 4 4" />
      <path d="M7 10H6a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-9a1 1 0 0 0-1-1h-1" />
    </svg>
  );
}

export function CopyIcon({ className = "" }: IconProps) {
  return (
    <svg className={iconClass(className)} viewBox="0 0 24 24" {...stroke} aria-hidden="true">
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V6a2 2 0 012-2h9" />
    </svg>
  );
}

export function PinIcon({ className = "" }: IconProps) {
  return (
    <svg className={iconClass(className)} viewBox="0 0 24 24" {...stroke} aria-hidden="true">
      <path d="M12 21s7-6.2 7-11.5A7 7 0 005 9.5C5 14.8 12 21 12 21z" />
      <circle cx="12" cy="9.5" r="2.5" />
    </svg>
  );
}

/** Ingranaggio a otto denti (prima era un cerchio con raggi, che sembrava un sole). */
export function SettingsIcon({ className = "" }: IconProps) {
  return (
    <svg className={iconClass(className)} viewBox="0 0 24 24" {...stroke} aria-hidden="true">
      <path d="M10.68 5.23L10.85 2.67L13.15 2.67L13.32 5.23A6.9 6.9 0 0 1 15.86 6.28L17.79 4.59L19.41 6.21L17.72 8.14A6.9 6.9 0 0 1 18.77 10.68L21.33 10.85L21.33 13.15L18.77 13.32A6.9 6.9 0 0 1 17.72 15.86L19.41 17.79L17.79 19.41L15.86 17.72A6.9 6.9 0 0 1 13.32 18.77L13.15 21.33L10.85 21.33L10.68 18.77A6.9 6.9 0 0 1 8.14 17.72L6.21 19.41L4.59 17.79L6.28 15.86A6.9 6.9 0 0 1 5.23 13.32L2.67 13.15L2.67 10.85L5.23 10.68A6.9 6.9 0 0 1 6.28 8.14L4.59 6.21L6.21 4.59L8.14 6.28A6.9 6.9 0 0 1 10.68 5.23z" />
      <circle cx="12" cy="12" r="2.6" />
    </svg>
  );
}

export function CarIcon({ className = "" }: IconProps) {
  return (
    <svg className={iconClass(className)} viewBox="0 0 24 24" {...stroke} aria-hidden="true">
      <path d="M6.2 11l1.4-4.1A1.5 1.5 0 019 5.8h6a1.5 1.5 0 011.4 1.1L17.8 11" />
      <path d="M5 11h14a2 2 0 012 2v3a1 1 0 01-1 1H4a1 1 0 01-1-1v-3a2 2 0 012-2z" />
      <path d="M7 17v2.2M17 17v2.2" />
      <circle cx="7.2" cy="14" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="16.8" cy="14" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function SlidersIcon({ className = "" }: IconProps) {
  return (
    <svg className={iconClass(className)} viewBox="0 0 24 24" {...stroke} aria-hidden="true">
      <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
      <circle cx="15" cy="7" r="2" />
      <circle cx="9" cy="17" r="2" />
    </svg>
  );
}

export function DatabaseIcon({ className = "" }: IconProps) {
  return (
    <svg className={iconClass(className)} viewBox="0 0 24 24" {...stroke} aria-hidden="true">
      <ellipse cx="12" cy="6" rx="7" ry="3" />
      <path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6" />
    </svg>
  );
}

export function ChevronDownIcon({ className = "" }: IconProps) {
  return (
    <svg className={iconClass(className)} viewBox="0 0 24 24" {...stroke} aria-hidden="true">
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

/** Strada con una barra: percorso senza autostrada. */
export function RoadIcon({ className = "" }: IconProps) {
  return (
    <svg className={iconClass(className)} viewBox="0 0 24 24" {...stroke} aria-hidden="true">
      <path d="M9 3L4 21M15 3l5 18M12 4v3m0 4v3m0 4v2" />
      <path d="M3 3l18 18" />
    </svg>
  );
}

/** Mappa piegata: la sezione «Tema Mappa» delle Impostazioni. */
export function MapIcon({ className = "" }: IconProps) {
  return (
    <svg className={iconClass(className)} viewBox="0 0 24 24" {...stroke} aria-hidden="true">
      <path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2-6-2z" />
      <path d="M9 4v14M15 6v14" />
    </svg>
  );
}

export function RestoreIcon({ className = "" }: IconProps) {
  return (
    <svg className={iconClass(className)} viewBox="0 0 24 24" {...stroke} aria-hidden="true">
      <path d="M4 12a8 8 0 108-8H8M8 4L5 7l3 3" />
    </svg>
  );
}

/** Tachimetro: consumo del veicolo. */
export function SpeedIcon({ className = "" }: IconProps) {
  return (
    <svg className={iconClass(className)} viewBox="0 0 24 24" {...stroke} aria-hidden="true">
      <path d="M4.5 17a8.5 8.5 0 1 1 15 0" />
      <path d="M12 14l3.5-4.5" />
      <circle cx="12" cy="14" r="1" fill="currentColor" />
    </svg>
  );
}

/** Orologio con freccia indietro: cronologia dei tragitti. */
export function HistoryIcon({ className = "" }: IconProps) {
  return (
    <svg className={iconClass(className)} viewBox="0 0 24 24" {...stroke} aria-hidden="true">
      <path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1L3.5 8.5M3.5 4v4.5H8" />
      <path d="M12 7.5V12l3 2" />
    </svg>
  );
}

export function ChevronRightIcon({ className = "" }: IconProps) {
  return (
    <svg className={iconClass(className)} viewBox="0 0 24 24" {...stroke} aria-hidden="true">
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

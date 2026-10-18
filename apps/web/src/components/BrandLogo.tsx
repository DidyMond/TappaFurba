/**
 * Mark ufficiale «Pin-goccia»: il pin di destinazione con la goccia di carburante in negativo e, sotto, i puntini
 * della rotta. Stesso disegno di `assets/logo.svg` (unica sorgente; un test confronta i tracciati), inline per riusare il
 * gradiente. Con `detail={false}` si omettono i puntini (stessa scelta del favicon, utile se si mostra a ≤ 20 px).
 */
export function BrandLogo({ className = "", detail = true }: { className?: string; detail?: boolean }) {
  return (
    <svg className={className} viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" data-testid="brand-logo">
      <defs>
        <linearGradient id="rf-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#0284C7" />
          <stop offset="100%" stopColor="#10B981" />
        </linearGradient>
      </defs>
      <rect width="200" height="200" rx="44" fill="url(#rf-grad)" />
      <path d="M100 164 C100 164 54 124 54 92 A46 46 0 1 1 146 92 C146 124 100 164 100 164 Z" fill="#FFFFFF" />
      <path d="M100 66 C100 66 82 90 82 101 A18 18 0 0 0 118 101 C118 90 100 66 100 66 Z" fill="#0F172A" />
      {detail && <path id="route-dots" d="M44 174 C66 184 98 181 118 170" fill="none" stroke="#FFFFFF" strokeWidth="9" strokeLinecap="round" strokeDasharray="1 16" />}
    </svg>
  );
}

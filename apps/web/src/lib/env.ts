/**
 * Token pubblico Mapbox per Map GL JS, da apps/web/.env (VITE_MAPBOX_PUBLIC_TOKEN). Va creato sul proprio
 * account Mapbox con restrizione per URL (http://localhost:5173/* e il dominio di produzione) e non va
 * mai committato. Se assente la mappa non compare ma l'elenco funziona.
 */
export function getMapboxToken(): string | null {
  const token = import.meta.env.VITE_MAPBOX_PUBLIC_TOKEN?.trim();
  return token ? token : null;
}

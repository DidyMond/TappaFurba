/**
 * Bounding box approssimativo dell'Italia (incluse isole), con margine.
 * Range reale osservato nel dataset MIMIT live: lat 35.499734–46.946944,
 * lon 6.709295–18.496371 — ampiamente contenuto in questi limiti.
 */
const ITALY_BOUNDS = {
  minLat: 35,
  maxLat: 47.5,
  minLon: 6.5,
  maxLon: 19,
};

export function isValidItalianCoordinate(lat: number, lon: number): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
  // Placeholder classico di un geocoding fallito a monte: mai una coordinata reale in Italia.
  if (lat === 0 && lon === 0) return false;

  return (
    lat >= ITALY_BOUNDS.minLat &&
    lat <= ITALY_BOUNDS.maxLat &&
    lon >= ITALY_BOUNDS.minLon &&
    lon <= ITALY_BOUNDS.maxLon
  );
}

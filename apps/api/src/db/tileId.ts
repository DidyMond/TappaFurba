/**
 * Espressione SQL del riquadro (della griglia dei prezzi in tempo reale, `packages/core/src/geo/tiles.ts`) che contiene
 * un punto. È la stessa della colonna generata `stations.tile_id` in `db/schema.sql`: un test di integrazione la
 * confronta con `tileForPoint` di `@tappafurba/core`, e un test unitario verifica che lo schema contenga questa espressione.
 * Passo in latitudine = 14 / 111,32; passo in longitudine per riga = 14 / (111,32 · cos(latitudine centrale della riga)).
 */
const LAT_STEP = "(14::float8 / 111.32::float8)";

/** Espressione SQL del riquadro per le colonne (o i valori) di latitudine e longitudine indicati. */
export function tileIdExpression(lat = "lat", lon = "lon"): string {
  const row = `floor(${lat} / ${LAT_STEP})`;
  const lonStep = `(14::float8 / (111.32::float8 * cos(radians((${row} + 0.5) * ${LAT_STEP}))))`;
  return `((${row})::int::text || ':' || (floor(${lon} / ${lonStep}))::int::text)`;
}

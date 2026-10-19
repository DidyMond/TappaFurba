/**
 * Calibrazione del proxy del giro di «Intorno a me» con misure vere (DB + Mapbox Directions reali): quanto la stima della
 * fase 1 (`2 × distanza in linea d'aria × PROXY_CIRCUITY_FACTOR`) si scosta dal giro reale punto → stazione → punto.
 *
 *   pnpm --filter @tappafurba/api calibrate-proxy
 *   pnpm --filter @tappafurba/api calibrate-proxy -- --per-band 2 --point "Il mio paese:extraurbano:9.1234,45.1234"
 *
 * Campiona le stazioni del DB per FASCE DI DISTANZA (0,3–2 / 2–4 / 4–7 / 7–10 km) a prescindere dal prezzo, a intervalli regolari
 * dentro ogni fascia: così non misura solo le stazioni in testa alla classifica (che sono quelle convenienti, non le tipiche).
 * Ogni giro usa le stesse opzioni della verifica in background di `searchNearby` (inversione ammessa alla stazione).
 *
 * Facoltativi: --per-band <n> (stazioni per fascia e per punto, 3), --point "etichetta:tipo:lon,lat" (si può ripetere; tipo
 * libero, di solito «urbano» o «extraurbano»). Senza --point usa alcuni luoghi pubblici noti.
 *
 * Costa una chiamata Directions per stazione misurata (punti × 4 fasce × per-band: con i valori di fabbrica ~100), FUORI dal
 * contatore mensile `api_usage`. Non scrive nulla sul DB, non salva le risposte e non stampa mai token. Non fa parte dei test.
 */
import { distanceKm, pointToWkt, PROXY_CIRCUITY_FACTOR, PROXY_DETOUR_SPEED_KMH, type Coordinate } from "@tappafurba/core";
import { db } from "../src/db";
import { env } from "../src/env";
import { MapboxRoutingProvider } from "../src/providers/routing/MapboxRoutingProvider";
import { buildCalibrationReport, DEFAULT_BANDS, evaluateWhatIf, RELEVANT_GAP, type CalibrationSample, type RatioStats } from "../src/search/proxyCalibration";
import { PostgisStationRepository } from "../src/search/PostgisStationRepository";

interface Point {
  label: string;
  area: string;
  coordinate: Coordinate;
}

const DEFAULT_POINTS: Point[] = [
  { label: "Milano, Duomo", area: "urbano", coordinate: [9.19, 45.4642] },
  { label: "Roma, Termini", area: "urbano", coordinate: [12.5016, 41.9009] },
  { label: "Napoli, Centrale", area: "urbano", coordinate: [14.2722, 40.8532] },
  { label: "Torino, Porta Nuova", area: "urbano", coordinate: [7.6784, 45.0621] },
  { label: "Bologna, Centrale", area: "urbano", coordinate: [11.3426, 44.5058] },
  { label: "Aosta", area: "extraurbano", coordinate: [7.3154, 45.7376] },
  { label: "Cuneo", area: "extraurbano", coordinate: [7.5513, 44.3845] },
  { label: "Belluno", area: "extraurbano", coordinate: [12.2167, 46.1389] },
  { label: "Matera", area: "extraurbano", coordinate: [16.6042, 40.6663] },
];

const argv = process.argv.slice(2).filter((a) => a !== "--");
const flags = new Map<string, string[]>();
for (let i = 0; i < argv.length; i++) {
  const key = argv[i]!;
  if (!key.startsWith("--")) continue;
  const value = argv[i + 1];
  flags.set(key.slice(2), [...(flags.get(key.slice(2)) ?? []), value && !value.startsWith("--") ? value : "true"]);
  if (value && !value.startsWith("--")) i++;
}
const perBand = Number(flags.get("per-band")?.[0] ?? 3);

const customPoints = (flags.get("point") ?? []).map((spec): Point => {
  const [label, area, lonLat] = spec.split(":");
  const [lon, lat] = (lonLat ?? "").split(",").map(Number);
  if (!label || !area || !Number.isFinite(lon) || !Number.isFinite(lat)) throw new Error(`--point non valido: «${spec}» (atteso etichetta:tipo:lon,lat)`);
  return { label, area, coordinate: [lon!, lat!] };
});
const points = customPoints.length > 0 ? customPoints : DEFAULT_POINTS;

if (!env.MAPBOX_SERVER_TOKEN) throw new Error("MAPBOX_SERVER_TOKEN è obbligatorio per misurare con Directions reali.");
const routing = new MapboxRoutingProvider({ token: env.MAPBOX_SERVER_TOKEN });
const repository = new PostgisStationRepository(db);

/** Stazioni scelte a intervalli regolari di distanza dentro la fascia: deterministico e indipendente dal prezzo. */
function pickEvenly<T extends { distance: number }>(inBand: T[], count: number): T[] {
  const sorted = [...inBand].sort((a, b) => a.distance - b.distance);
  if (sorted.length <= count) return sorted;
  return Array.from({ length: count }, (_, i) => sorted[Math.floor(((i + 0.5) * sorted.length) / count)]!);
}

const samples: CalibrationSample[] = [];
for (const point of points) {
  const rows = await repository.findCorridorPrices({ routeWkt: pointToWkt(point.coordinate), radiusMeters: 10_000, fuelType: "benzina", maxAgeHours: 720 });
  const stations = [...new Map(rows.map((r) => [r.stationId, { id: r.stationId, lon: r.lon, lat: r.lat }])).values()].map((s) => ({
    ...s,
    distance: distanceKm(point.coordinate, [s.lon, s.lat]),
  }));
  let measured = 0;
  for (const [from, to] of DEFAULT_BANDS) {
    for (const s of pickEvenly(stations.filter((x) => x.distance >= from && x.distance < to), perBand)) {
      const route = await routing.getRoute(
        [{ lon: point.coordinate[0], lat: point.coordinate[1] }, { lon: s.lon, lat: s.lat }, { lon: point.coordinate[0], lat: point.coordinate[1] }],
        { continueStraight: false },
      );
      if (!route) continue;
      samples.push({ area: point.area, euclidKm: s.distance, realKm: route.distanceKm, realMinutes: route.durationMinutes });
      measured++;
    }
  }
  console.log(`${point.label.padEnd(22)} ${point.area.padEnd(12)} stazioni nel raggio ${String(stations.length).padStart(3)} · misurate ${measured}`);
}
await db.destroy();

const pct = (x: number) => `${x >= 0 ? "+" : ""}${Math.round(x * 100)}%`;
const line = (label: string, s: RatioStats | null) =>
  s
    ? `${label.padEnd(16)} n=${String(s.count).padStart(3)} | giro vero / (2×linea d'aria): p25 ${s.p25.toFixed(2)} · mediana ${s.median.toFixed(2)} · p75 ${s.p75.toFixed(2)} | scarto km del proxy ${pct(s.proxyKmGap).padStart(5)} | minuti vero/proxy ${s.medianTimeRatio.toFixed(2)} (velocità reale mediana ${s.medianSpeedKmh.toFixed(0)} km/h) | giro > stima nel ${Math.round(s.shareUnderestimated * 100)}%`
    : `${label.padEnd(16)} nessun campione`;

const report = buildCalibrationReport(samples);
console.log("\n=== Calibrazione del proxy (il proxy assume 1,25) ===");
console.log(line("TOTALE", report.overall));
for (const [area, stats] of Object.entries(report.byArea)) console.log(line(area, stats));
console.log("--- per fascia di distanza in linea d'aria");
for (const band of report.byBand) console.log(line(band.label, band.stats));
if (report.overall) {
  // Confronto «cosa succederebbe con un altro fattore»: errori mediani sugli stessi campioni.
  console.log("\n--- Che errore avrebbe una stima diversa (sugli stessi campioni; costo con benzina 1,90 €/L, 15 km/L, 0,15 €/min)");
  const candidates = [
    { name: "attuale", factor: PROXY_CIRCUITY_FACTOR, speedKmh: PROXY_DETOUR_SPEED_KMH },
    { name: "solo km", factor: Number(report.overall.median.toFixed(2)), speedKmh: PROXY_DETOUR_SPEED_KMH },
    { name: "km e velocità", factor: Number(report.overall.median.toFixed(2)), speedKmh: Math.round(report.overall.medianSpeedKmh) },
  ];
  for (const c of candidates) {
    const r = evaluateWhatIf(samples, c);
    if (r)
      console.log(
        `${c.name.padEnd(14)} fattore ${c.factor.toFixed(2)} a ${String(c.speedKmh).padStart(2)} km/h | errore mediano km ${pct(r.medianKmError).padStart(5)} · minuti ${pct(r.medianMinutesError).padStart(5)} | errore mediano sul costo del giro ${r.medianCostErrorEuro.toFixed(2)} €`,
      );
  }
  const current = evaluateWhatIf(samples, candidates[0]!)!;
  const kmGap = Math.abs(current.medianKmError);
  const minutesGap = Math.abs(current.medianMinutesError);
  const parts = [`km ${pct(current.medianKmError)}`, `minuti ${pct(current.medianMinutesError)}`];
  if (kmGap > RELEVANT_GAP || minutesGap > RELEVANT_GAP) {
    console.log(
      `\nScarto rilevante (> ${RELEVANT_GAP * 100}%) nella stima attuale: ${parts.join(", ")}. Il proxy sottostima il giro. ` +
        `Valori mediani misurati: fattore ${report.overall.median.toFixed(2)}, velocità media del giro ${Math.round(report.overall.medianSpeedKmh)} km/h.`,
    );
  } else {
    console.log(`\nScarto entro ${RELEVANT_GAP * 100}% (${parts.join(", ")}): i valori attuali restano adeguati.`);
  }
}

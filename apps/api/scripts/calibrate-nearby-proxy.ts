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
 * Parametri del costo del giro nel confronto «che errore avrebbe una stima diversa» (gli stessi del risparmio netto, che usa il
 * prezzo di riferimento della zona diviso il consumo): --fuel-price <€/L, 1,90>, --consumption <km/L, 15>, --vtime <€/min, 0,15>.
 * --max-km <km, 5> aggiunge il riepilogo dei soli campioni entro quella distanza (l'uso tipico: il totale pesa allo stesso modo
 * tutte le fasce fino a 10 km); il verdetto finale si basa su quel sottoinsieme.
 *
 * Costa una chiamata Directions per stazione misurata (punti × 4 fasce × per-band: con i valori di fabbrica ~100), FUORI dal
 * contatore mensile `api_usage`. Non scrive nulla sul DB, non salva le risposte e non stampa mai token. Non fa parte dei test.
 */
import { distanceKm, pointToWkt, type Coordinate } from "@tappafurba/core";
import { db } from "../src/db";
import { env } from "../src/env";
import { MapboxRoutingProvider } from "../src/providers/routing/MapboxRoutingProvider";
import { DEFAULT_BANDS, formatCalibrationReport, type CalibrationSample } from "../src/search/proxyCalibration";
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
const numberFlag = (name: string, fallback: number) => {
  const value = Number(flags.get(name)?.[0] ?? fallback);
  if (!(value > 0)) throw new Error(`--${name} deve essere un numero positivo`);
  return value;
};
const cost = {
  fuelPricePerLiter: numberFlag("fuel-price", 1.9),
  consumptionKmPerLiter: numberFlag("consumption", 15),
  valueOfTimePerMinute: numberFlag("vtime", 0.15),
};
const maxKm = numberFlag("max-km", 5);

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

for (const line of formatCalibrationReport(samples, { maxKm, cost })) console.log(line);

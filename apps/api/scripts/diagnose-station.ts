/**
 * Diagnostica di UNA stazione in una ricerca (API + DB + Mapbox reali): perché compare, o non compare, nei risultati.
 * Ripete passo per passo la pipeline di `SearchService.search` e la confronta con l'esito del servizio vero.
 *
 *   pnpm --filter @tappafurba/api diagnose -- --station "NOME STAZIONE" --from "Via Esempio 12, Città di Prova" --to "Via Campione 8, Borgo Campione"
 *   pnpm --filter @tappafurba/api diagnose -- --id 12345 --from "…" --to "…" --max-detour 8 --fuel benzina --only-self false
 *
 * Obbligatori (nessun valore di fabbrica: né luoghi né stazioni): --from e --to (testi: si usa il primo suggerimento del
 * geocoding, come l'app) e --station <nome, ILIKE> oppure --id <idImpianto>.
 * Facoltativi: --comune <comune> (se la stazione non si trova, elenca quelle del comune), --fuel, --only-self true|false,
 * --avoid-motorway true|false, --max-detour <km>, --max-age <ore>, --liters, --consumption <km/L>, --vtime <€/min>.
 * Non aggiorna i prezzi live dal ministero: usa i prezzi che sono nel DB.
 *
 * Costa: 1 geocoding per estremo, 1 + 5…15 Directions (le stesse di una ricerca) + 1 per la verifica della stazione.
 * Non scrive nulla sul DB e non stampa mai token.
 */
import {
  computeRoutedDetour,
  createRouteProjector,
  estimateProxyDetour,
  PROXY_CIRCUITY_FACTOR,
  routeLengthKm,
  routeToWkt,
  selectStationPrice,
  simplifyRoute,
  type Coordinate,
} from "@tappafurba/core";
import type { SearchFuelType, SearchRequest } from "@tappafurba/shared";
import { sql } from "kysely";
import { db } from "../src/db";
import { env } from "../src/env";
import { MapboxGeocodingProvider } from "../src/providers/geocoding/MapboxGeocodingProvider";
import { MapboxRoutingProvider } from "../src/providers/routing/MapboxRoutingProvider";
import { PostgisStationRepository } from "../src/search/PostgisStationRepository";
import { MAX_CORRIDOR_RADIUS_KM, MIN_CORRIDOR_RADIUS_KM, SearchService } from "../src/search/SearchService";
import { SearchSessionStore } from "../src/search/SearchSessionStore";

const args = new Map<string, string>();
const argv = process.argv.slice(2).filter((a) => a !== "--");
for (let i = 0; i < argv.length; i++) {
  const key = argv[i]!;
  if (!key.startsWith("--")) continue;
  const next = argv[i + 1];
  if (next === undefined || next.startsWith("--")) args.set(key.slice(2), "true");
  else {
    args.set(key.slice(2), next);
    i++;
  }
}
const arg = (name: string, fallback: string) => args.get(name) ?? fallback;
const bool = (name: string, fallback: boolean) => (args.has(name) ? args.get(name) === "true" : fallback);

const USAGE = [
  "Uso: pnpm --filter @tappafurba/api diagnose -- --station \"NOME STAZIONE\" --from \"Via Esempio 12, Città di Prova\" --to \"Via Campione 8, Borgo Campione\"",
  "     (al posto di --station si può usare --id <idImpianto>; facoltativi: --comune, --fuel, --only-self, --avoid-motorway, --max-detour, --max-age, --liters, --consumption, --vtime)",
].join("\n");
const need = (name: string): string => {
  const value = args.get(name);
  if (!value || value === "true") {
    console.error(`Manca --${name}.\n\n${USAGE}`);
    process.exit(1);
  }
  return value;
};
if (args.has("help")) {
  console.log(USAGE);
  process.exit(0);
}
const FROM = need("from");
const TO = need("to");
const STATION = args.has("id") ? null : need("station");
const COMUNE = args.get("comune");
const FUEL = arg("fuel", "benzina") as SearchFuelType;
const ONLY_SELF = bool("only-self", false);
const AVOID_MOTORWAY = bool("avoid-motorway", false);
const MAX_DETOUR = Number(arg("max-detour", "8"));
const MAX_AGE_H = Number(arg("max-age", "72")); // default delle Impostazioni
const LITERS = Number(arg("liters", "45"));
const CONSUMPTION = Number(arg("consumption", "15"));
const V_TIME = Number(arg("vtime", "0.15")); // «Bilanciato», default delle Impostazioni

const log = (title: string, rows?: Record<string, unknown>) => {
  console.log(`\n=== ${title}`);
  if (rows) for (const [k, v] of Object.entries(rows)) console.log(`  ${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`);
};
const r = (v: number, d = 2) => Math.round(v * 10 ** d) / 10 ** d;

async function main() {
  if (!env.MAPBOX_SERVER_TOKEN) throw new Error("MAPBOX_SERVER_TOKEN mancante in apps/api/.env: la diagnostica usa Mapbox reale.");
  const geocoder = new MapboxGeocodingProvider({ token: env.MAPBOX_SERVER_TOKEN });
  const routing = new MapboxRoutingProvider({ token: env.MAPBOX_SERVER_TOKEN });
  const repository = new PostgisStationRepository(db);

  // ---- 0. la stazione
  const stationRows = args.has("id")
    ? await sql<StationRow>`SELECT * FROM stations WHERE id = ${Number(args.get("id"))}`.execute(db)
    : await sql<StationRow>`SELECT * FROM stations WHERE nome_impianto ILIKE ${"%" + STATION + "%"}`.execute(db);
  if (stationRows.rows.length === 0) {
    log("STAZIONE NON TROVATA NEL DB", { cercata: STATION ?? args.get("id") ?? "" });
    if (COMUNE) {
      const near = await sql<StationRow>`SELECT * FROM stations WHERE comune ILIKE ${COMUNE} ORDER BY id`.execute(db);
      console.log(`  stazioni a ${COMUNE} nel DB (${near.rows.length}):`);
      for (const s of near.rows) console.log(`   - ${s.id} ${s.nome_impianto} | ${s.indirizzo} | ${s.lat},${s.lon}`);
    } else {
      console.log("  (con --comune <comune> si elencano le stazioni di quel comune)");
    }
    const last = await repository.getLastIngestionAt();
    console.log(`  ultima ingestione riuscita: ${last?.toISOString() ?? "nessuna"}`);
    return;
  }
  const station = stationRows.rows[0]!;
  if (stationRows.rows.length > 1) console.log(`(più stazioni corrispondono: uso id ${station.id}; altre: ${stationRows.rows.slice(1).map((s) => s.id).join(", ")})`);
  log("0. STAZIONE", { id: station.id, nome: station.nome_impianto, indirizzo: `${station.indirizzo}, ${station.comune} (${station.provincia})`, bandiera: station.bandiera, tipo: station.tipo_impianto, lat: station.lat, lon: station.lon });

  const lastIngestion = await repository.getLastIngestionAt();
  const prices = await sql<PriceRow>`SELECT fuel_type, raw_desc_carburante, is_self, price, communicated_at, updated_at, now() AS now FROM fuel_prices WHERE station_id = ${station.id} ORDER BY fuel_type, is_self DESC`.execute(db);
  console.log("  Righe di prezzo della stazione (tutte, anche non della ricerca):");
  for (const p of prices.rows) {
    const ageH = (new Date(p.now).getTime() - new Date(p.communicated_at).getTime()) / 3_600_000;
    // `updated_at` successivo alla fine dell'ultima ingestione = riga toccata da un aggiornamento live (o da un'ingestione più recente)
    const source = lastIngestion && new Date(p.updated_at) > lastIngestion ? "LIVE (aggiornata dopo l'ultima ingestione CSV)" : "CSV giornaliero";
    console.log(`   - ${p.fuel_type} ${p.is_self ? "SELF" : "servito"} ${p.price} €/L | raw="${p.raw_desc_carburante}" | communicated_at=${new Date(p.communicated_at).toISOString()} (età ${r(ageH, 1)} h) | updated_at=${new Date(p.updated_at).toISOString()} | fonte: ${source}`);
  }
  console.log(`  Ultima ingestione CSV riuscita: ${lastIngestion?.toISOString() ?? "nessuna"}`);

  // ---- 1. richiesta: geocoding e percorso
  const [fromHit, toHit] = await Promise.all([geocoder.autocomplete(FROM), geocoder.autocomplete(TO)]);
  if (!fromHit[0] || !toHit[0]) throw new Error(`Geocoding senza risultati: da=${fromHit.length} a=${toHit.length}`);
  const request: SearchRequest = {
    origin: { lon: fromHit[0].lon, lat: fromHit[0].lat },
    destination: { lon: toHit[0].lon, lat: toHit[0].lat },
    fuelType: FUEL,
    liters: LITERS,
    maxDetourKm: MAX_DETOUR,
    consumptionKmPerLiter: CONSUMPTION,
    valueOfTimePerMinute: V_TIME,
    onlySelf: ONLY_SELF,
    maxPriceAgeHours: MAX_AGE_H,
    avoidMotorway: AVOID_MOTORWAY,
    avoidTolls: false,
    avoidFerries: false,
  };
  log("1. RICHIESTA", {
    da: `${FROM} → ${fromHit[0].label} [${fromHit[0].lon}, ${fromHit[0].lat}]`,
    a: `${TO} → ${toHit[0].label} [${toHit[0].lon}, ${toHit[0].lat}]`,
    carburante: FUEL, soloSelf: ONLY_SELF, evitaAutostrada: AVOID_MOTORWAY, deviazioneMassimaKm: MAX_DETOUR, validitaPrezziOre: MAX_AGE_H, litri: LITERS, consumoKmL: CONSUMPTION, valoreTempoEurMin: V_TIME,
  });

  const direct = await routing.getRoute([request.origin, request.destination], { avoidMotorway: AVOID_MOTORWAY });
  if (!direct) throw new Error("Nessun percorso A→B");
  const simplified = simplifyRoute(direct.geometry);
  const lengthKm = routeLengthKm(simplified);
  log("2. PERCORSO DIRETTO (Mapbox Directions)", { distanzaKm: r(direct.distanceKm, 2), durataMin: r(direct.durationMinutes, 1), puntiGeometria: direct.geometry.length, puntiSemplificati: simplified.length, lunghezzaSemplificataKm: r(lengthKm, 2) });

  // ---- 2. corridoio
  const radiusKm = Math.min(Math.max(MAX_DETOUR, MIN_CORRIDOR_RADIUS_KM), MAX_CORRIDOR_RADIUS_KM);
  const rows = await repository.findCorridorPrices({ routeWkt: routeToWkt(simplified), radiusMeters: radiusKm * 1000, fuelType: FUEL, maxAgeHours: MAX_AGE_H });
  const stationIds = new Set(rows.map((x) => x.stationId));
  const mine = rows.filter((x) => x.stationId === station.id);
  const project = createRouteProjector(simplified);
  const proj = project([station.lon, station.lat] as Coordinate);
  const geoDist = await sql<{ km: number }>`SELECT ST_Distance(s.geom, ST_GeogFromText(${routeToWkt(simplified)}), false) / 1000.0 AS km FROM stations s WHERE s.id = ${station.id}`.execute(db);
  // Quante stazioni del corridoio hanno il carburante ma sono escluse SOLO perché il prezzo è più vecchio della soglia
  const ageStats = await sql<{ with_fuel: number; fresh: number }>`
    SELECT count(DISTINCT s.id)::int AS with_fuel,
           count(DISTINCT s.id) FILTER (WHERE p.communicated_at >= now() - make_interval(hours => ${MAX_AGE_H}::int))::int AS fresh
    FROM stations s JOIN fuel_prices p ON p.station_id = s.id
    WHERE p.fuel_type = ${FUEL} AND ST_DWithin(s.geom, ST_GeogFromText(${routeToWkt(simplified)}), ${radiusKm * 1000}::float8, false)`.execute(db);
  const ages = ageStats.rows[0]!;
  log("3. QUERY DI CORRIDOIO (PostGIS ST_DWithin)", {
    raggioKm: radiusKm,
    "stazioni nel raggio con almeno un prezzo del carburante (qualunque età)": ages.with_fuel,
    "di cui con prezzo comunicato entro la soglia di validità": ages.fresh,
    "escluse SOLO per età del prezzo": ages.with_fuel - ages.fresh,
    "stazioni distinte nel corridoio (con prezzo fresco del carburante)": stationIds.size,
    "STAZIONE PRESENTE NEL CORRIDOIO?": mine.length > 0 ? "SÌ" : "NO",
    "distanza laterale proiettata (km)": r(proj.lateralDistanceKm, 3),
    "distanza PostGIS dal tracciato (km)": r(geoDist.rows[0]?.km ?? NaN, 3),
    "km lungo la rotta": r(proj.alongRouteKm, 2),
    "lunghezza rotta (km)": r(lengthKm, 2),
    "posizione lungo la rotta": `${r((proj.alongRouteKm / lengthKm) * 100, 1)} % (0 = partenza, 100 = arrivo)`,
  });
  if (mine.length === 0) {
    const reason = proj.lateralDistanceKm > radiusKm ? `fuori dal raggio (${r(proj.lateralDistanceKm, 2)} km > ${radiusKm} km)` : prices.rows.some((p) => p.fuel_type === FUEL) ? `ha prezzi ${FUEL} ma nessuno entro ${MAX_AGE_H} h` : `nessuna riga di prezzo ${FUEL}`;
    console.log(`  → ESCLUSA prima del ranking: ${reason}`);
  } else {
    // ---- 3. prezzo
    const options = mine.map((x) => ({ isSelf: x.isSelf, price: x.price, communicatedAt: x.communicatedAt }));
    const selected = selectStationPrice(options, { onlySelf: ONLY_SELF });
    log("4. RIGA DI PREZZO USATA", {
      "righe nel corridoio per la stazione": options.map((o) => `${o.isSelf ? "self" : "servito"} ${o.price} (${o.communicatedAt})`),
      scelta: selected ? `${selected.isSelf ? "SELF" : "servito"} ${selected.price} €/L, communicated_at ${selected.communicatedAt}, servitoOnly=${selected.servitoOnly}` : "NESSUNA (con «Solo Self» attivo manca il Self)",
    });
    // ---- 4. deviazione proxy
    const proxy = estimateProxyDetour(proj.lateralDistanceKm);
    log("5. DEVIAZIONE PROXY (2 × laterale × " + PROXY_CIRCUITY_FACTOR + ")", {
      "km proxy": r(proxy.km, 2),
      "minuti proxy": r(proxy.minutes, 1),
      "soglia (deviazione massima)": MAX_DETOUR,
      "supera la soglia?": proxy.km > MAX_DETOUR ? `SÌ → ESCLUSA dalla fase 1 (proxy ${r(proxy.km, 2)} km > ${MAX_DETOUR} km)` : "no, resta candidata",
      "laterale massima ammessa dal proxy (km)": r(MAX_DETOUR / (2 * PROXY_CIRCUITY_FACTOR), 2),
    });
  }

  // ---- 5. servizio vero
  const service = new SearchService({ routing, repository, budget: { status: async () => "ok" }, sessions: new SearchSessionStore() });
  const response = await service.search(request);
  const rank = (list: { station: { id: number } }[]) => list.findIndex((x) => x.station.id === station.id);
  const phase1 = rank(response.results);
  log("6. SERVIZIO REALE — FASE 1 (ranking con deviazione proxy)", {
    "candidati valutati (stazioni con prezzo utilizzabile nel corridoio)": response.candidatesEvaluated,
    "risultati restituiti": response.results.length,
    "prezzo di riferimento": `${response.referencePrice.value} €/L (${response.referencePrice.level}, campione ${response.referencePrice.sampleSize})`,
    "POSIZIONE NEL RANKING": phase1 >= 0 ? `#${phase1 + 1} di ${response.results.length}` : "ASSENTE",
    ...(phase1 >= 0 ? { dettaglio: response.results[phase1] } : {}),
  });
  await service.waitForRefinement(response.searchId);
  const refined = service.getRefinement(response.searchId);
  const phase2 = refined ? rank(refined.results) : -1;
  log("7. SERVIZIO REALE — FASE 2 (dopo la verifica col routing reale delle prime stazioni)", {
    stato: refined?.refinement,
    "risultati": refined?.results.length,
    "POSIZIONE NEL RANKING": phase2 >= 0 ? `#${phase2 + 1} di ${refined!.results.length} (deviazione ${refined!.results[phase2]!.detourSource}: ${refined!.results[phase2]!.detourKm} km)` : "ASSENTE",
  });

  // ---- 6. verifica indipendente col routing reale (anche se la fase 1 l'ha scartata)
  const via = await routing.getRoute([request.origin, { lon: station.lon, lat: station.lat }, request.destination], { avoidMotorway: AVOID_MOTORWAY });
  if (via) {
    const detour = computeRoutedDetour({ distanceKm: direct.distanceKm, durationMinutes: direct.durationMinutes }, { distanceKm: via.distanceKm, durationMinutes: via.durationMinutes }, proj.lateralDistanceKm);
    const proxy = estimateProxyDetour(proj.lateralDistanceKm);
    log("8. VERIFICA INDIPENDENTE: A → stazione → B (Directions, 1 chiamata)", {
      "percorso via stazione": `${r(via.distanceKm, 2)} km, ${r(via.durationMinutes, 1)} min (diretto ${r(direct.distanceKm, 2)} km, ${r(direct.durationMinutes, 1)} min)`,
      "deviazione verificata": `${r(detour.km, 2)} km, ${r(detour.minutes, 1)} min`,
      "deviazione proxy": `${r(proxy.km, 2)} km, ${r(proxy.minutes, 1)} min`,
      "proxy sovrastima di": `${r(proxy.km - detour.km, 2)} km (×${r(proxy.km / Math.max(detour.km, 0.01), 2)})`,
      "la deviazione verificata rispetta la soglia?": detour.km <= MAX_DETOUR ? `SÌ (${r(detour.km, 2)} ≤ ${MAX_DETOUR})` : `NO (${r(detour.km, 2)} > ${MAX_DETOUR})`,
    });
  } else {
    log("8. VERIFICA INDIPENDENTE", { esito: "nessun percorso passando dalla stazione" });
  }

  log("RIEPILOGO", {
    "in corridoio": mine.length > 0 ? "sì" : "no",
    "in ranking fase 1": phase1 >= 0 ? `sì (#${phase1 + 1})` : "no",
    "in ranking dopo la verifica": phase2 >= 0 ? `sì (#${phase2 + 1})` : "no",
  });
}

interface StationRow {
  id: number;
  nome_impianto: string;
  indirizzo: string;
  comune: string;
  provincia: string;
  bandiera: string;
  tipo_impianto: string;
  lat: number;
  lon: number;
}
interface PriceRow {
  fuel_type: string;
  raw_desc_carburante: string;
  is_self: boolean;
  price: number;
  communicated_at: Date;
  updated_at: Date;
  now: Date;
}

main()
  .catch((error) => {
    console.error("Diagnostica fallita:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => db.destroy());

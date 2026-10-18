import type { GeocodeSuggestion, LonLat } from "@tappafurba/shared";
import type { AutocompleteOptions, GeocodingProvider } from "./GeocodingProvider";

interface FixturePlace {
  name: string;
  region: string;
  lon: number;
  lat: number;
}

/** Luoghi noti, con coordinate reali: sufficienti per test e sviluppo senza chiavi. */
export const FIXTURE_PLACES: readonly FixturePlace[] = [
  { name: "Milano Centrale", region: "Milano, Lombardia, Italia", lon: 9.204, lat: 45.4864 },
  { name: "Piazza del Duomo, Milano", region: "Milano, Lombardia, Italia", lon: 9.19, lat: 45.4642 },
  { name: "Bologna Centrale", region: "Bologna, Emilia-Romagna, Italia", lon: 11.3426, lat: 44.5058 },
  { name: "Bologna Fiera", region: "Bologna, Emilia-Romagna, Italia", lon: 11.3775, lat: 44.5165 },
  { name: "Roma Termini", region: "Roma, Lazio, Italia", lon: 12.5016, lat: 41.9009 },
  { name: "Firenze Santa Maria Novella", region: "Firenze, Toscana, Italia", lon: 11.2476, lat: 43.7765 },
  { name: "Napoli Centrale", region: "Napoli, Campania, Italia", lon: 14.2722, lat: 40.8532 },
  { name: "Torino Porta Nuova", region: "Torino, Piemonte, Italia", lon: 7.6784, lat: 45.0621 },
  { name: "Genova Brignole", region: "Genova, Liguria, Italia", lon: 8.9484, lat: 44.4078 },
  { name: "Venezia Santa Lucia", region: "Venezia, Veneto, Italia", lon: 12.3208, lat: 45.4413 },
  { name: "Verona Porta Nuova", region: "Verona, Veneto, Italia", lon: 10.9825, lat: 45.4288 },
];

const REVERSE_MAX_DISTANCE_KM = 5;

function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

function haversineKm(a: LonLat, b: LonLat): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371.0088 * Math.asin(Math.sqrt(h));
}

function toSuggestion(place: FixturePlace): GeocodeSuggestion {
  return {
    id: `fixture:${normalize(place.name).replace(/\s+/g, "-")}`,
    name: place.name,
    label: `${place.name}, ${place.region}`,
    lon: place.lon,
    lat: place.lat,
  };
}

export class FixtureGeocodingProvider implements GeocodingProvider {
  async autocomplete(query: string, options: AutocompleteOptions = {}): Promise<GeocodeSuggestion[]> {
    // Anche un'etichetta completa («Milano Centrale, Milano, Lombardia, Italia») deve ritrovare il luogo: le virgole non contano.
    const tokens = normalize(query).replace(/[,;.]/g, " ").split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return [];

    const matches = FIXTURE_PLACES.filter((place) => {
      const haystack = normalize(`${place.name} ${place.region}`);
      return tokens.every((token) => haystack.includes(token));
    });

    const { proximity } = options;
    if (proximity) {
      matches.sort((a, b) => haversineKm(proximity, a) - haversineKm(proximity, b));
    }

    return matches.slice(0, options.limit ?? 5).map(toSuggestion);
  }

  async reverse(point: LonLat): Promise<string | null> {
    let best: { place: FixturePlace; distanceKm: number } | null = null;
    for (const place of FIXTURE_PLACES) {
      const distanceKm = haversineKm(point, place);
      if (distanceKm <= REVERSE_MAX_DISTANCE_KM && (!best || distanceKm < best.distanceKm)) {
        best = { place, distanceKm };
      }
    }
    return best ? `${best.place.name}, ${best.place.region}` : null;
  }
}

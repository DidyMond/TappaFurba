import { NEARBY_RADIUS_KM, type NearbyRequest, type SearchRequest } from "@tappafurba/shared";
import { z } from "zod";

const lonLat = z.object({
  lon: z.number().min(-180).max(180),
  lat: z.number().min(-90).max(90),
});

/** Parametri comuni a «In viaggio» e «Intorno a me». Default = valori (V_time 0.15 €/min, 72 h, 45 L, 15 km/L, Self). */
const searchOptionsShape = {
  fuelType: z.enum(["benzina", "diesel", "gpl", "metano"]),
  liters: z.number().min(1).max(200).default(45),
  consumptionKmPerLiter: z.number().min(3).max(40).default(15),
  valueOfTimePerMinute: z.number().min(0).max(1).default(0.15),
  onlySelf: z.boolean().default(true),
  maxPriceAgeHours: z.number().int().min(1).max(720).default(72),
  avoidMotorway: z.boolean().default(false),
  avoidTolls: z.boolean().default(false),
  avoidFerries: z.boolean().default(false),
  referencePriceOverride: z.number().min(0.5).max(4).optional(),
};

/** Raggio di «Intorno a me» (km): i limiti stanno in `@tappafurba/shared`, gli stessi dello slider del frontend. */
export const MIN_NEARBY_RADIUS_KM = NEARBY_RADIUS_KM.min;
export const MAX_NEARBY_RADIUS_KM = NEARBY_RADIUS_KM.max;
export const DEFAULT_NEARBY_RADIUS_KM = NEARBY_RADIUS_KM.default;

export const searchRequestSchema = z
  .object({
    origin: lonLat,
    destination: lonLat,
    maxDetourKm: z.number().min(1).max(10).default(5),
    ...searchOptionsShape,
  })
  .refine((value) => value.origin.lon !== value.destination.lon || value.origin.lat !== value.destination.lat, {
    message: "Origine e destinazione coincidono",
    path: ["destination"],
  });

export const nearbyRequestSchema = z.object({
  origin: lonLat,
  radiusKm: z.number().min(MIN_NEARBY_RADIUS_KM).max(MAX_NEARBY_RADIUS_KM).default(DEFAULT_NEARBY_RADIUS_KM),
  ...searchOptionsShape,
});

// Verifica a compile-time che gli schemi restino allineati al contratto condiviso (in entrambe le direzioni).
type Parsed = z.infer<typeof searchRequestSchema>;
type ParsedNearby = z.infer<typeof nearbyRequestSchema>;
type Assert<T extends true> = T;
export type _SchemaMatchesContract = Assert<
  Parsed extends SearchRequest ? (SearchRequest extends Parsed ? true : false) : false
>;
export type _NearbySchemaMatchesContract = Assert<
  ParsedNearby extends NearbyRequest ? (NearbyRequest extends ParsedNearby ? true : false) : false
>;

export const searchIdParamsSchema = z.object({ id: z.string().uuid() });

export const stationRouteParamsSchema = z.object({
  id: z.string().uuid(),
  stationId: z.coerce.number().int().positive(),
});

export const autocompleteQuerySchema = z.object({
  q: z.string().trim().min(3, "Servono almeno 3 caratteri").max(120),
  lon: z.coerce.number().min(-180).max(180).optional(),
  lat: z.coerce.number().min(-90).max(90).optional(),
});

export const reverseQuerySchema = z.object({
  lon: z.coerce.number().min(-180).max(180),
  lat: z.coerce.number().min(-90).max(90),
});

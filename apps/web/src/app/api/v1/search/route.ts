import { z } from "zod";
import { DietaryTag, StockPolicy } from "@startup/contracts";
import { RestaurantRepository, getDbPool, sqlDistanceMeters } from "@startup/database";
import { apiSuccess } from "@/server/api-response";
import { enforceRateLimit } from "@/server/rate-limit";
import { parseQuery, route } from "@/server/route";

const QuerySchema = z.object({
  q: z.string().trim().max(80).default(""),
  pureVeg: z.enum(["true", "false"]).optional(),
  latitude: z.coerce.number().min(-90).max(90).optional(),
  longitude: z.coerce.number().min(-180).max(180).optional(),
});

/** Escapes LIKE metacharacters so user input is matched literally. */
function likePattern(q: string): string {
  return `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

export const GET = route(async (req, _ctx, requestId) => {
  await enforceRateLimit(req, "search");
  const { q, pureVeg, latitude, longitude } = parseQuery(req, QuerySchema);
  if (q.length < 2) return apiSuccess({ restaurants: [], dishes: [] }, 200, { requestId });

  const pool = getDbPool();
  const pattern = likePattern(q);
  const veg = pureVeg === "true";
  const hasLocation = latitude !== undefined && longitude !== undefined;
  const loc = hasLocation ? { latitude: latitude!, longitude: longitude! } : undefined;
  // When the caller has a location, only show what can be delivered there
  const deliverable = hasLocation ? `AND ${sqlDistanceMeters("$3", "$4")} <= r.max_delivery_radius_meters` : "";
  const params = hasLocation ? [pattern, veg, latitude, longitude] : [pattern, veg];

  const [restaurantRows, dishRows] = await Promise.all([
    pool.query(
      `SELECT r.id FROM restaurants r
        WHERE r.is_active AND (NOT $2 OR r.pure_veg)
          AND (r.name ILIKE $1 OR EXISTS (SELECT 1 FROM unnest(r.cuisines) c WHERE c ILIKE $1))
          ${deliverable}
        ORDER BY (r.name ILIKE $1) DESC, r.rating DESC
        LIMIT 10`,
      params
    ),
    pool.query(
      `SELECT mi.id, mi.name, mi.description, mi.price_paise, mi.dietary_tag, mi.stock_policy, mi.is_available,
              mi.image_url, mi.is_bestseller, mi.restaurant_id
         FROM menu_items mi JOIN restaurants r ON r.id = mi.restaurant_id
        WHERE r.is_active AND mi.name ILIKE $1
          AND (NOT $2 OR mi.dietary_tag IN ('VEG', 'VEGAN'))
          ${deliverable}
        ORDER BY mi.is_available DESC, mi.is_bestseller DESC, r.rating DESC
        LIMIT 20`,
      params
    ),
  ]);

  const restaurantIds = new Set<string>([
    ...restaurantRows.rows.map((r) => r.id as string),
    ...dishRows.rows.map((d) => d.restaurant_id as string),
  ]);
  const summaries = await RestaurantRepository.findSummariesByIds([...restaurantIds], loc);
  const byId = new Map(summaries.map((s) => [s.id, s]));

  return apiSuccess(
    {
      restaurants: restaurantRows.rows.map((r) => byId.get(r.id)).filter(Boolean),
      dishes: dishRows.rows
        .filter((d) => byId.has(d.restaurant_id))
        .map((d) => ({
          dish: {
            id: d.id,
            name: d.name,
            description: d.description ?? undefined,
            pricePaise: d.price_paise,
            dietaryTag: d.dietary_tag as DietaryTag,
            stockPolicy: d.stock_policy as StockPolicy,
            isAvailable: d.is_available,
            imageUrl: d.image_url ?? undefined,
            isBestseller: d.is_bestseller,
            variants: [],
            modifierGroups: [],
          },
          restaurant: byId.get(d.restaurant_id)!,
        })),
    },
    200,
    { requestId }
  );
});

import { z } from "zod";
import { MapboxAdapter } from "@startup/integrations";
import { apiSuccess } from "@/server/api-response";
import { enforceRateLimit } from "@/server/rate-limit";
import { parseQuery, route } from "@/server/route";

const QuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  latitude: z.coerce.number().min(-90).max(90).optional(),
  longitude: z.coerce.number().min(-180).max(180).optional(),
});

/** Address search & reverse geocoding through the server token (never exposed to browsers). */
export const GET = route(async (req, _ctx, requestId) => {
  await enforceRateLimit(req, "search");
  const { q, latitude, longitude } = parseQuery(req, QuerySchema);
  const mapbox = new MapboxAdapter();
  const point = latitude !== undefined && longitude !== undefined ? { latitude, longitude } : undefined;

  if (q) return apiSuccess({ results: await mapbox.searchPlaces(q, point), enabled: !mapbox.isMock }, 200, { requestId });
  if (point) {
    const hit = await mapbox.reverseGeocode(point);
    return apiSuccess({ results: hit ? [hit] : [], enabled: !mapbox.isMock }, 200, { requestId });
  }
  return apiSuccess({ results: [], enabled: !mapbox.isMock }, 200, { requestId });
});

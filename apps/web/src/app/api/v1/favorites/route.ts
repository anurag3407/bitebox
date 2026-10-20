import { z } from "zod";
import { FavoriteRepository, RestaurantRepository } from "@startup/database";
import { apiSuccess } from "@/server/api-response";
import { requireAuth } from "@/server/auth-guard";
import { parseQuery, route } from "@/server/route";

const QuerySchema = z.object({
  latitude: z.coerce.number().min(-90).max(90).optional(),
  longitude: z.coerce.number().min(-180).max(180).optional(),
});

export const GET = route(async (req, _ctx, requestId) => {
  const { user } = await requireAuth(req);
  const { latitude, longitude } = parseQuery(req, QuerySchema);
  const ids = await FavoriteRepository.listIds(user.id);
  const location = latitude !== undefined && longitude !== undefined ? { latitude, longitude } : undefined;
  const restaurants = await RestaurantRepository.findSummariesByIds([...ids], location);
  return apiSuccess(restaurants.map((r) => ({ ...r, isFavorite: true })), 200, { requestId });
});

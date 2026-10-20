import { RestaurantListRequestSchema } from "@startup/contracts";
import { FavoriteRepository, RestaurantRepository } from "@startup/database";
import { apiSuccess } from "@/server/api-response";
import { getAuthContext } from "@/server/auth-guard";
import { enforceRateLimit } from "@/server/rate-limit";
import { parseQuery, route } from "@/server/route";

export const GET = route(async (req, _ctx, requestId) => {
  await enforceRateLimit(req, "discovery");
  const filters = parseQuery(req, RestaurantListRequestSchema);
  // Signed-in callers get their favourites flagged; anonymous browsing still works
  const auth = await getAuthContext(req).catch(() => null);
  const favoriteIds = auth ? await FavoriteRepository.listIds(auth.user.id) : undefined;

  const result = await RestaurantRepository.listSummaries({ ...filters, favoriteIds });
  return apiSuccess(result, 200, { requestId });
});

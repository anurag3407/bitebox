import { FavoriteRepository } from "@startup/database";
import { apiSuccess } from "@/server/api-response";
import { requireAuth } from "@/server/auth-guard";
import { assertUuid, route } from "@/server/route";

export const PUT = route<{ restaurantId: string }>(async (req, { params }, requestId) => {
  const { user } = await requireAuth(req);
  const restaurantId = assertUuid((await params).restaurantId, "restaurant");
  await FavoriteRepository.add(user.id, restaurantId);
  return apiSuccess({ restaurantId, isFavorite: true }, 200, { requestId });
});

export const DELETE = route<{ restaurantId: string }>(async (req, { params }, requestId) => {
  const { user } = await requireAuth(req);
  const restaurantId = assertUuid((await params).restaurantId, "restaurant");
  await FavoriteRepository.remove(user.id, restaurantId);
  return apiSuccess({ restaurantId, isFavorite: false }, 200, { requestId });
});

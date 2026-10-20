import { MerchantItemAvailabilityRequestSchema, UserRole } from "@startup/contracts";
import { DomainError } from "@startup/core";
import { RestaurantRepository } from "@startup/database";
import { apiSuccess } from "@/server/api-response";
import { requireAuth, requireRestaurantAccess } from "@/server/auth-guard";
import { CacheKeys, invalidate } from "@/server/cache";
import { assertUuid, parseBody, route } from "@/server/route";

/** Mark a dish sold out / back in stock. */
export const PATCH = route<{ restaurantId: string; itemId: string }>(async (req, { params }, requestId) => {
  const auth = await requireAuth(req, [UserRole.MERCHANT_STAFF, UserRole.ADMIN]);
  const p = await params;
  const restaurantId = assertUuid(p.restaurantId, "restaurant");
  const itemId = assertUuid(p.itemId, "item");
  await requireRestaurantAccess(auth, restaurantId);
  const { isAvailable } = await parseBody(req, MerchantItemAvailabilityRequestSchema);

  const updated = await RestaurantRepository.setItemAvailability(restaurantId, itemId, isAvailable);
  if (!updated) throw new DomainError("NOT_FOUND", "Menu item not found");
  await invalidate(CacheKeys.menu(updated.slug));
  return apiSuccess({ itemId, isAvailable }, 200, { requestId });
});

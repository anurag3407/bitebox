import { MerchantRestaurantStatusRequestSchema, UserRole } from "@startup/contracts";
import { DomainError } from "@startup/core";
import { RestaurantRepository } from "@startup/database";
import { apiSuccess } from "@/server/api-response";
import { requireAuth, requireRestaurantAccess } from "@/server/auth-guard";
import { CacheKeys, invalidate } from "@/server/cache";
import { assertUuid, parseBody, route } from "@/server/route";

/** Pause / resume taking orders (e.g. kitchen overloaded, gas cylinder out). */
export const PATCH = route<{ restaurantId: string }>(async (req, { params }, requestId) => {
  const auth = await requireAuth(req, [UserRole.MERCHANT_STAFF, UserRole.ADMIN]);
  const restaurantId = assertUuid((await params).restaurantId, "restaurant");
  await requireRestaurantAccess(auth, restaurantId);
  const { isAcceptingOrders } = await parseBody(req, MerchantRestaurantStatusRequestSchema);

  const updated = await RestaurantRepository.setAcceptingOrders(restaurantId, isAcceptingOrders);
  if (!updated) throw new DomainError("NOT_FOUND", "Restaurant not found");
  await invalidate(CacheKeys.menu(updated.slug));
  return apiSuccess({ restaurantId, isAcceptingOrders: updated.isAcceptingOrders }, 200, { requestId });
});

import { UserRole } from "@startup/contracts";
import { OrderExperienceRepository, OrderRepository, RestaurantRepository } from "@startup/database";
import { apiError, apiSuccess } from "@/server/api-response";
import { requireAuth } from "@/server/auth-guard";
import { assertUuid, route } from "@/server/route";

export const GET = route<{ orderId: string }>(async (req, { params }, requestId) => {
  const auth = await requireAuth(req);
  const orderId = assertUuid((await params).orderId, "order");
  const access = await OrderRepository.findAccessContext(orderId);
  if (!access) return apiError("NOT_FOUND", "Order not found", 404, undefined, { requestId });
  const allowed =
    access.customerId === auth.user.id ||
    auth.role === UserRole.ADMIN ||
    access.riderUserIds.includes(auth.user.id) ||
    (auth.role === UserRole.MERCHANT_STAFF &&
      (await RestaurantRepository.getMembership(auth.user.id, access.restaurantId)) !== null);
  if (!allowed) return apiError("NOT_FOUND", "Order not found", 404, undefined, { requestId });
  return apiSuccess(await OrderExperienceRepository.getProof(orderId), 200, { requestId });
});

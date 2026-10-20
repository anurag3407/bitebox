import { CreateOrderRatingRequestSchema } from "@startup/contracts";
import { OrderRepository, RatingRepository, RestaurantRepository } from "@startup/database";
import { apiSuccess } from "@/server/api-response";
import { requireAuth } from "@/server/auth-guard";
import { enforceRateLimit } from "@/server/rate-limit";
import { assertUuid, parseBody, route } from "@/server/route";

export const POST = route<{ orderId: string }>(async (req, { params }, requestId) => {
  const auth = await requireAuth(req);
  await enforceRateLimit(req, "mutation", auth.user.id);
  const orderId = assertUuid((await params).orderId, "order");
  const body = await parseBody(req, CreateOrderRatingRequestSchema);

  await RatingRepository.rateOrder({ orderId, customerId: auth.user.id, ...body });
  const access = await OrderRepository.findAccessContext(orderId);
  if (access) await RestaurantRepository.refreshRatingAggregate(access.restaurantId);

  return apiSuccess({ success: true }, 201, { requestId });
});

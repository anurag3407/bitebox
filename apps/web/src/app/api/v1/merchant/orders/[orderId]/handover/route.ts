import { PickupHandoverSchema } from "@startup/contracts";
import { OrderRepository } from "@startup/database";
import { apiSuccess } from "@/server/api-response";
import { authorizeMerchantOrderAction } from "@/server/merchant-order";
import { parseBody, route } from "@/server/route";

/** Staff enter the pickup code and close the order when the customer collects it. */
export const POST = route<{ orderId: string }>(async (req, { params }, requestId) => {
  const { auth, orderId } = await authorizeMerchantOrderAction(req, params);
  const { pickupCode } = await parseBody(req, PickupHandoverSchema);
  const result = await OrderRepository.completePickup({ orderId, actorId: auth.user.id, pickupCode });
  return apiSuccess({ success: true, ...result }, 200, { requestId });
});

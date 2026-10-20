import { FulfillmentState } from "@startup/contracts";
import { OrderRepository } from "@startup/database";
import { apiSuccess } from "@/server/api-response";
import { authorizeMerchantOrderAction } from "@/server/merchant-order";
import { route } from "@/server/route";

export const POST = route<{ orderId: string }>(async (req, { params }, requestId) => {
  const { auth, orderId } = await authorizeMerchantOrderAction(req, params);
  await OrderRepository.updateFulfillmentState({
    orderId,
    fromState: FulfillmentState.ACCEPTED,
    toState: FulfillmentState.PREPARING,
    actorType: "MERCHANT",
    actorId: auth.user.id,
    reason: "Kitchen started preparing food",
  });
  return apiSuccess({ success: true, fulfillmentState: FulfillmentState.PREPARING }, 200, { requestId });
});

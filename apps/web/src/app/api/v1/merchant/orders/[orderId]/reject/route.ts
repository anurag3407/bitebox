import { FulfillmentState, MerchantRejectOrderRequestSchema } from "@startup/contracts";
import { OrderRepository } from "@startup/database";
import { apiSuccess } from "@/server/api-response";
import { authorizeMerchantOrderAction } from "@/server/merchant-order";
import { parseBody, route } from "@/server/route";

/**
 * Restaurant declines a new order, or cancels one it accepted (item ran out).
 * The customer is always refunded in full.
 */
export const POST = route<{ orderId: string }>(async (req, { params }, requestId) => {
  const { auth, orderId } = await authorizeMerchantOrderAction(req, params);
  const { reason } = await parseBody(req, MerchantRejectOrderRequestSchema);
  const result = await OrderRepository.cancel({
    orderId,
    actor: "MERCHANT",
    actorId: auth.user.id,
    reason: `Rejected by restaurant: ${reason}`,
    expectedStates: [
      FulfillmentState.AWAITING_MERCHANT,
      FulfillmentState.ACCEPTED,
      FulfillmentState.PREPARING,
      FulfillmentState.READY_FOR_PICKUP,
    ],
  });
  return apiSuccess({ success: true, fulfillmentState: result.fulfillmentState, refundedPaise: result.refundedPaise }, 200, {
    requestId,
  });
});

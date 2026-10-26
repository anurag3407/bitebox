import { FulfillmentState } from "@startup/contracts";
import { JobKind, JobRepository, OrderRepository } from "@startup/database";
import { apiSuccess } from "@/server/api-response";
import { authorizeMerchantOrderAction } from "@/server/merchant-order";
import { route } from "@/server/route";

export const POST = route<{ orderId: string }>(async (req, { params }, requestId) => {
  const { auth, orderId } = await authorizeMerchantOrderAction(req, params);
  await OrderRepository.updateFulfillmentState({
    orderId,
    fromState: [FulfillmentState.ACCEPTED, FulfillmentState.PREPARING],
    toState: FulfillmentState.READY_FOR_PICKUP,
    actorType: "MERCHANT",
    actorId: auth.user.id,
    reason: "Kitchen marked food ready for pickup",
  });
  // If dispatch was scheduled for later (long prep), start looking for a rider now.
  // Pickup orders never need one.
  const order = await OrderRepository.findById(orderId);
  if (order?.orderMode !== "PICKUP") {
    await JobRepository.enqueue(JobKind.DISPATCH_ORDER, { orderId, attempt: 0 }, { dedupeKey: `dispatch:${orderId}:ready` });
  }
  return apiSuccess({ success: true, fulfillmentState: FulfillmentState.READY_FOR_PICKUP }, 200, { requestId });
});

import { MerchantAcceptOrderRequestSchema, FulfillmentState } from "@startup/contracts";
import { DomainError } from "@startup/core";
import { OrderRepository } from "@startup/database";
import { MapboxAdapter } from "@startup/integrations";
import { apiSuccess } from "@/server/api-response";
import { authorizeMerchantOrderAction } from "@/server/merchant-order";
import { orderGeo } from "@/server/order-geo";
import { parseBody, route } from "@/server/route";

export const POST = route<{ orderId: string }>(async (req, { params }, requestId) => {
  const { auth, orderId } = await authorizeMerchantOrderAction(req, params);
  const { preparationTimeMinutes } = await parseBody(req, MerchantAcceptOrderRequestSchema);

  const order = await OrderRepository.findById(orderId);
  if (!order) throw new DomainError("NOT_FOUND", "Order not found");
  const { restaurantLocation } = await orderGeo(order);
  const lastMile = await new MapboxAdapter().calculateRoute(restaurantLocation, order.deliveryAddress);

  await OrderRepository.acceptByMerchant({
    orderId,
    prepTimeMinutes: preparationTimeMinutes,
    actorId: auth.user.id,
    lastMileMinutes: Math.ceil(lastMile.durationSeconds / 60),
  });

  return apiSuccess({ success: true, fulfillmentState: FulfillmentState.ACCEPTED }, 200, { requestId });
});

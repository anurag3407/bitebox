import { ShareRepository, OrderRepository, getDbPool } from "@startup/database";
import { apiError, apiSuccess } from "@/server/api-response";
import { enforceRateLimit } from "@/server/rate-limit";
import { route } from "@/server/route";

export const GET = route<{ token: string }>(async (req, { params }, requestId) => {
  await enforceRateLimit(req, "discovery");
  const { token } = await params;
  const orderId = await ShareRepository.resolveOrderId(token);
  if (!orderId) return apiError("NOT_FOUND", "This tracking link has expired or was revoked.", 404, undefined, { requestId });

  const order = await OrderRepository.findById(orderId);
  if (!order) return apiError("NOT_FOUND", "Order not found", 404, undefined, { requestId });

  const [events, trip] = await Promise.all([
    OrderRepository.listEvents(orderId),
    getDbPool().query(
      `SELECT rd.name, rd.current_latitude, rd.current_longitude, da.status
         FROM delivery_assignments da JOIN riders rd ON rd.id = da.rider_id
        WHERE da.order_id = $1 ORDER BY da.assigned_at DESC LIMIT 1`,
      [orderId]
    ),
  ]);
  const rider = trip.rows[0];
  const isTerminal = ["DELIVERED", "CANCELLED", "DELIVERY_FAILED"].includes(order.fulfillmentState);

  return apiSuccess(
    {
      orderNumber: order.orderNumber,
      restaurantName: order.restaurant.name,
      orderMode: order.orderMode,
      fulfillmentState: order.fulfillmentState,
      etaMinutes: order.currentEtaMinutes,
      promisedDeliveryAt: order.promisedDeliveryAt,
      rider:
        rider && !isTerminal
          ? {
              firstName: String(rider.name).split(" ")[0],
              location:
                rider.current_latitude !== null && rider.current_longitude !== null
                  ? { latitude: rider.current_latitude, longitude: rider.current_longitude }
                  : undefined,
            }
          : undefined,
      timeline: events.map((e) => ({ state: e.targetState, at: e.createdAt, actor: e.actorType })),
      isTerminal,
      updatedAt: new Date().toISOString(),
    },
    200,
    { requestId }
  );
});

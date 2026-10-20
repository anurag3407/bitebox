import { FulfillmentState } from "@startup/contracts";
import { ServiceabilityPolicy } from "@startup/core";
import { OrderRepository, RestaurantRepository, RiderRepository, getDbPool } from "@startup/database";
import { getRedis } from "@startup/integrations";
import { OrderViewer, shapeOrderForViewer } from "./order-access";

const STALE_LOCATION_MS = 60_000;

const ACTIVE_TRIP_SQL = `
  SELECT da.id, da.status, da.rider_id, da.assigned_at
    FROM delivery_assignments da
   WHERE da.order_id = $1 AND da.status IN ('ASSIGNED', 'AT_PICKUP', 'PICKED_UP', 'AT_DROPOFF', 'COMPLETED')
   ORDER BY da.assigned_at DESC LIMIT 1`;

export async function buildTrackingSnapshot(orderId: string, viewer: OrderViewer) {
  const order = await OrderRepository.findById(orderId);
  if (!order) return null;

  const [tripRes, events, restaurant] = await Promise.all([
    getDbPool().query(ACTIVE_TRIP_SQL, [orderId]),
    OrderRepository.listEvents(orderId),
    RestaurantRepository.findById(order.restaurant.id),
  ]);
  const trip = tripRes.rows[0] as { id: string; status: string; rider_id: string } | undefined;

  let rider: {
    name: string;
    phone?: string;
    vehicleType?: string;
    location?: { latitude: number; longitude: number };
    headingDegrees?: number;
    lastLocationUpdatedAt?: string;
    isStale: boolean;
    tripStatus: string;
  } | null = null;

  let etaMinutes = order.currentEtaMinutes;

  if (trip) {
    const riderRow = await RiderRepository.findById(trip.rider_id);
    if (riderRow) {
      const live = trip.status !== "COMPLETED" ? await getRedis().getRiderLocation(riderRow.id) : null;
      const location =
        live ??
        (riderRow.currentLatitude !== null && riderRow.currentLongitude !== null
          ? { latitude: riderRow.currentLatitude, longitude: riderRow.currentLongitude }
          : undefined);
      const updatedAt = live?.updatedAt ?? riderRow.lastPingAt?.toISOString();
      rider = {
        name: riderRow.name,
        // Customers reach the rider through the app; the merchant does not get the number
        phone: viewer === "CUSTOMER" || viewer === "ADMIN" ? riderRow.phone : undefined,
        vehicleType: riderRow.vehicleType,
        location,
        headingDegrees: live?.headingDegrees ?? riderRow.headingDegrees ?? undefined,
        lastLocationUpdatedAt: updatedAt,
        isStale: !updatedAt || Date.now() - new Date(updatedAt).getTime() > STALE_LOCATION_MS,
        tripStatus: trip.status,
      };

      // Once the food is on its way, ETA follows the rider rather than the original promise
      if (location && order.fulfillmentState === FulfillmentState.OUT_FOR_DELIVERY) {
        const meters = ServiceabilityPolicy.calculateDistanceMeters(location, order.deliveryAddress);
        etaMinutes = Math.max(1, Math.ceil((meters * 1.3) / (20_000 / 60)) + 2);
      }
    }
  }

  return {
    order: shapeOrderForViewer(order, viewer),
    restaurantLocation: restaurant ? { latitude: restaurant.latitude, longitude: restaurant.longitude } : undefined,
    rider,
    etaMinutes,
    timeline: events.map((e) => ({ state: e.targetState, at: e.createdAt, reason: e.reason, actor: e.actorType })),
    isTerminal:
      order.fulfillmentState === FulfillmentState.DELIVERED ||
      order.fulfillmentState === FulfillmentState.CANCELLED ||
      order.fulfillmentState === FulfillmentState.DELIVERY_FAILED,
  };
}

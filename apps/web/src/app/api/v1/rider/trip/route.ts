import { OrderRepository, RiderRepository } from "@startup/database";
import { apiSuccess } from "@/server/api-response";
import { requireAuth, requireRiderProfile } from "@/server/auth-guard";
import { shapeOrderForViewer } from "@/server/order-access";
import { orderGeo } from "@/server/order-geo";
import { route } from "@/server/route";

export const GET = route(async (req, _ctx, requestId) => {
  const auth = await requireAuth(req);
  const rider = await requireRiderProfile(auth);
  const profile = {
    id: rider.id,
    name: rider.name,
    isOnline: rider.isOnline,
    lastPingAt: rider.lastPingAt?.toISOString(),
  };

  const activeTrip = await RiderRepository.getActiveTripForRider(rider.id);
  if (activeTrip) {
    const order = await OrderRepository.findById(activeTrip.orderId);
    return apiSuccess(
      {
        rider: profile,
        hasActiveTrip: true,
        assignment: {
          id: activeTrip.id,
          status: activeTrip.status,
          assignedAt: activeTrip.assignedAt.toISOString(),
          otpFailedAttempts: activeTrip.otpFailedAttempts,
          arrivedDropoffAt: activeTrip.arrivedDropoffAt?.toISOString(),
        },
        order: order ? shapeOrderForViewer(order, "RIDER") : null,
        pickupLocation: order ? (await orderGeo(order)).restaurantLocation : null,
      },
      200,
      { requestId }
    );
  }

  const pendingOffer = await RiderRepository.getPendingOfferForRider(rider.id);
  let offerOrder = null;
  let pickupLocation = null;
  if (pendingOffer) {
    const order = await OrderRepository.findById(pendingOffer.orderId);
    if (order) {
      // Before accepting, a rider sees the job, not the customer's identity
      const shaped = shapeOrderForViewer(order, "RIDER");
      offerOrder = { ...shaped, deliveryAddress: { ...shaped.deliveryAddress, contactPhone: undefined, building: "" } };
      pickupLocation = (await orderGeo(order)).restaurantLocation;
    }
  }

  return apiSuccess({ rider: profile, hasActiveTrip: false, pendingOffer, offerOrder, pickupLocation }, 200, { requestId });
});

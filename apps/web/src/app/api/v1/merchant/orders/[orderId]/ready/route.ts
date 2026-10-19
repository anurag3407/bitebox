import { NextRequest } from "next/server";
import { FulfillmentState } from "@startup/contracts";
import { OrderRepository, RiderRepository, deliveryOffers, getDb } from "@startup/database";
import { apiError, apiSuccess } from "@/server/api-response";
import { getAuthenticatedActor } from "@/server/auth-guard";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  try {
    const actor = await getAuthenticatedActor(req);
    if (!actor || (actor.role !== "MERCHANT_STAFF" && actor.role !== "ADMIN")) {
      return apiError("FORBIDDEN", "Merchant staff or admin access required", 403);
    }

    const { orderId } = await params;
    const order = await OrderRepository.findById(orderId);
    if (!order) {
      return apiError("NOT_FOUND", "Order not found", 404);
    }

    const fromState = order.fulfillmentState === FulfillmentState.PREPARING
      ? FulfillmentState.PREPARING
      : FulfillmentState.ACCEPTED;

    await OrderRepository.updateFulfillmentState({
      orderId,
      fromState,
      toState: FulfillmentState.READY_FOR_PICKUP,
      actorType: "MERCHANT",
      reason: "Kitchen marked food ready for pickup",
    });

    // Auto-dispatch: offer ready order to an available online rider
    const onlineRiders = await RiderRepository.listOnlineRiders();
    if (onlineRiders.length > 0) {
      const db = getDb();
      for (const rider of onlineRiders) {
        const activeTrip = await RiderRepository.getActiveTripForRider(rider.id);
        if (!activeTrip) {
          await db
            .insert(deliveryOffers)
            .values({
              orderId,
              riderId: rider.id,
              status: "OFFERED",
              expiresAt: new Date(Date.now() + 120 * 1000), // 2 minutes
            })
            .onConflictDoNothing();
          break; // Single-order dispatch offer
        }
      }
    }

    return apiSuccess({ success: true, fulfillmentState: FulfillmentState.READY_FOR_PICKUP });
  } catch (err: any) {
    return apiError("INTERNAL_ERROR", err.message || "Failed to mark ready", 500);
  }
}

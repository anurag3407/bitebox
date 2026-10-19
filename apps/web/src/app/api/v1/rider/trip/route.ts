import { NextRequest } from "next/server";
import { UserRole } from "@startup/contracts";
import { OrderRepository, RiderRepository, SEED_IDS, deliveryOffers, getDb } from "@startup/database";
import { apiError, apiSuccess } from "@/server/api-response";
import { getAuthenticatedActor, getOrCreateDbUser } from "@/server/auth-guard";
import { desc, eq } from "drizzle-orm";

export async function GET(req: NextRequest) {
  try {
    const actor = await getAuthenticatedActor(req);
    if (!actor) {
      return apiError("UNAUTHORIZED", "Authentication required", 401);
    }
    if (actor.role !== UserRole.RIDER && actor.role !== UserRole.ADMIN) {
      return apiError("FORBIDDEN", "Forbidden: Rider role required", 403);
    }

    const user = await getOrCreateDbUser(actor);
    let rider = await RiderRepository.findByUserId(user.id);
    if (!rider && actor.role === UserRole.ADMIN) {
      rider = await RiderRepository.findById(SEED_IDS.riderId);
    }
    if (!rider) {
      return apiError("NOT_FOUND", "Rider profile not found", 404);
    }
    const riderId = rider.id;

    // 1. Check active assigned trip
    const activeTrip = await RiderRepository.getActiveTripForRider(riderId);
    if (activeTrip) {
      const order = await OrderRepository.findById(activeTrip.orderId);
      // Strip deliveryOtp: rider must NOT see customer's delivery OTP code!
      const sanitizedOrder = order ? (({ deliveryOtp, ...o }) => o)(order) : null;
      return apiSuccess({
        hasActiveTrip: true,
        assignment: activeTrip,
        order: sanitizedOrder,
      });
    }

    // 2. Check pending offers
    const db = getDb();
    const offers = await db
      .select()
      .from(deliveryOffers)
      .where(eq(deliveryOffers.riderId, riderId))
      .orderBy(desc(deliveryOffers.createdAt))
      .limit(1);

    const pendingOffer = offers[0] && offers[0].status === "OFFERED" ? offers[0] : null;

    let offerOrder = null;
    if (pendingOffer) {
      const rawOrder = await OrderRepository.findById(pendingOffer.orderId);
      // Strip deliveryOtp from offer preview
      offerOrder = rawOrder ? (({ deliveryOtp, ...o }) => o)(rawOrder) : null;
    }

    return apiSuccess({
      hasActiveTrip: false,
      pendingOffer,
      offerOrder,
    });
  } catch (err: any) {
    return apiError("INTERNAL_ERROR", err.message || "Failed to fetch rider trip", 500);
  }
}

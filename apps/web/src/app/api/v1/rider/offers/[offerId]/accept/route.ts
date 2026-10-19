import { NextRequest } from "next/server";
import { UserRole } from "@startup/contracts";
import { RiderRepository, SEED_IDS, deliveryOffers, getDb } from "@startup/database";
import { eq } from "drizzle-orm";
import { apiError, apiSuccess } from "@/server/api-response";
import { getAuthenticatedActor, getOrCreateDbUser } from "@/server/auth-guard";

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ offerId: string }> }
) {
  try {
    const { offerId } = await context.params;
    if (!offerId) {
      return apiError("VALIDATION_ERROR", "offerId parameter is required", 400);
    }

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
      return apiError("NOT_FOUND", "Rider profile not found for authenticated user", 404);
    }

    // 1. Look up the offer
    const db = getDb();
    const [offer] = await db
      .select()
      .from(deliveryOffers)
      .where(eq(deliveryOffers.id, offerId))
      .limit(1);

    if (!offer) {
      return apiError("NOT_FOUND", "Delivery offer not found", 404);
    }

    if (offer.riderId !== rider.id && actor.role !== UserRole.ADMIN) {
      return apiError("FORBIDDEN", "This offer was not dispatched to your rider account", 403);
    }

    // 2. Atomically claim offer with row locks
    const result = await RiderRepository.acceptOfferAtomic({
      offerId,
      orderId: offer.orderId,
      riderId: offer.riderId,
    });

    return apiSuccess(result, 200);
  } catch (err: any) {
    const message = err.message || "Failed to accept offer";
    if (
      message.includes("expired") ||
      message.includes("no longer available") ||
      message.includes("already")
    ) {
      return apiError("CONFLICT", message, 409);
    }
    return apiError("INTERNAL_ERROR", message, 500);
  }
}

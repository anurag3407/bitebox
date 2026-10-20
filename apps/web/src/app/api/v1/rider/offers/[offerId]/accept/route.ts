import { DomainError } from "@startup/core";
import { RiderRepository } from "@startup/database";
import { apiSuccess } from "@/server/api-response";
import { requireAuth, requireRiderProfile } from "@/server/auth-guard";
import { enforceRateLimit } from "@/server/rate-limit";
import { assertUuid, route } from "@/server/route";

export const POST = route<{ offerId: string }>(async (req, { params }, requestId) => {
  const auth = await requireAuth(req);
  const rider = await requireRiderProfile(auth);
  await enforceRateLimit(req, "mutation", rider.id);
  const offerId = assertUuid((await params).offerId, "offer");

  const offer = await RiderRepository.findOffer(offerId);
  if (!offer || offer.riderId !== rider.id) throw new DomainError("NOT_FOUND", "Delivery offer not found");

  const result = await RiderRepository.acceptOfferAtomic({ offerId, orderId: offer.orderId, riderId: rider.id });
  return apiSuccess(result, 200, { requestId });
});

import { RiderRejectOfferRequestSchema } from "@startup/contracts";
import { DomainError } from "@startup/core";
import { RiderRepository } from "@startup/database";
import { apiSuccess } from "@/server/api-response";
import { requireAuth, requireRiderProfile } from "@/server/auth-guard";
import { assertUuid, parseBody, route } from "@/server/route";

export const POST = route<{ offerId: string }>(async (req, { params }, requestId) => {
  const auth = await requireAuth(req);
  const rider = await requireRiderProfile(auth);
  const offerId = assertUuid((await params).offerId, "offer");
  const { reason } = await parseBody(req, RiderRejectOfferRequestSchema);

  const offer = await RiderRepository.findOffer(offerId);
  if (!offer || offer.riderId !== rider.id) throw new DomainError("NOT_FOUND", "Delivery offer not found");

  await RiderRepository.rejectOffer({ offerId, riderId: rider.id, reason });
  return apiSuccess({ success: true }, 200, { requestId });
});

import { ReviewRiderVerificationSchema, UserRole } from "@startup/contracts";
import { RiderVerificationRepository } from "@startup/database";
import { apiSuccess } from "@/server/api-response";
import { requireAuth } from "@/server/auth-guard";
import { assertUuid, parseBody, route } from "@/server/route";

export const POST = route<{ riderId: string }>(async (req, { params }, requestId) => {
  const { user } = await requireAuth(req, [UserRole.ADMIN]);
  const riderId = assertUuid((await params).riderId, "rider");
  const { decision, note } = await parseBody(req, ReviewRiderVerificationSchema);
  const profile = await RiderVerificationRepository.review(riderId, user.id, decision, note);
  return apiSuccess(profile, 200, { requestId });
});

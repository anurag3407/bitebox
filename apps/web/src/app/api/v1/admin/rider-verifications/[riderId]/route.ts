import { UserRole } from "@startup/contracts";
import { RiderVerificationRepository } from "@startup/database";
import { apiSuccess } from "@/server/api-response";
import { requireAuth } from "@/server/auth-guard";
import { assertUuid, route } from "@/server/route";

export const GET = route<{ riderId: string }>(async (req, { params }, requestId) => {
  await requireAuth(req, [UserRole.ADMIN]);
  const riderId = assertUuid((await params).riderId, "rider");
  return apiSuccess(await RiderVerificationRepository.getProfile(riderId), 200, { requestId });
});

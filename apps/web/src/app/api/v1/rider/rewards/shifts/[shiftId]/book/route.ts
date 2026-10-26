import { RiderRewardsRepository } from "@startup/database";
import { apiSuccess } from "@/server/api-response";
import { requireAuth, requireRiderProfile } from "@/server/auth-guard";
import { assertUuid, route } from "@/server/route";

export const POST = route<{ shiftId: string }>(async (req, { params }, requestId) => {
  const rider = await requireRiderProfile(await requireAuth(req));
  const shiftId = assertUuid((await params).shiftId, "shift");
  const booking = await RiderRewardsRepository.bookShift(rider.id, shiftId);
  return apiSuccess(booking, 201, { requestId });
});

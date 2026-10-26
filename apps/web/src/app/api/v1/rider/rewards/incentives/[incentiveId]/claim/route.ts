import { RiderRewardsRepository } from "@startup/database";
import { apiSuccess } from "@/server/api-response";
import { requireAuth, requireRiderProfile } from "@/server/auth-guard";
import { assertUuid, route } from "@/server/route";

export const POST = route<{ incentiveId: string }>(async (req, { params }, requestId) => {
  const rider = await requireRiderProfile(await requireAuth(req));
  const incentiveId = assertUuid((await params).incentiveId, "incentive");
  const claim = await RiderRewardsRepository.claimIncentive(rider.id, incentiveId);
  return apiSuccess(claim, 201, { requestId });
});

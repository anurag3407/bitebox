import { PayoutRepository } from "@startup/database";
import { apiSuccess } from "@/server/api-response";
import { requireAuth, requireRiderProfile } from "@/server/auth-guard";
import { route } from "@/server/route";

export const GET = route(async (req, _ctx, requestId) => {
  const rider = await requireRiderProfile(await requireAuth(req));
  const [summary, account] = await Promise.all([
    PayoutRepository.earningsSummary("RIDER", rider.id),
    PayoutRepository.getAccount("RIDER", rider.id),
  ]);
  return apiSuccess({ ...summary, account }, 200, { requestId });
});

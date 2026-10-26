import { ApplyReferralCodeSchema } from "@startup/contracts";
import { ReferralRepository } from "@startup/database";
import { apiSuccess } from "@/server/api-response";
import { requireAuth } from "@/server/auth-guard";
import { enforceRateLimit } from "@/server/rate-limit";
import { parseBody, route } from "@/server/route";

export const POST = route(async (req, _ctx, requestId) => {
  const { user } = await requireAuth(req);
  await enforceRateLimit(req, "mutation", user.id);
  const { code } = await parseBody(req, ApplyReferralCodeSchema);
  const referral = await ReferralRepository.applyCode(user.id, code);
  return apiSuccess(referral, 201, { requestId });
});

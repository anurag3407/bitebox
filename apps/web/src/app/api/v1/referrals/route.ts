import { ReferralRepository } from "@startup/database";
import { apiSuccess } from "@/server/api-response";
import { requireAuth } from "@/server/auth-guard";
import { route } from "@/server/route";

export const GET = route(async (req, _ctx, requestId) => {
  const { user } = await requireAuth(req);
  const origin = new URL(req.url).origin;
  return apiSuccess(await ReferralRepository.getSummary(user.id, origin), 200, { requestId });
});

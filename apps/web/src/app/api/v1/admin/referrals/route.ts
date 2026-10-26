import { UserRole } from "@startup/contracts";
import { ReferralRepository } from "@startup/database";
import { apiSuccess } from "@/server/api-response";
import { requireAuth } from "@/server/auth-guard";
import { route } from "@/server/route";

export const GET = route(async (req, _ctx, requestId) => {
  await requireAuth(req, [UserRole.ADMIN]);
  return apiSuccess(await ReferralRepository.listForAdmin(), 200, { requestId });
});

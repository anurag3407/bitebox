import { WalletRepository } from "@startup/database";
import { apiSuccess } from "@/server/api-response";
import { requireAuth } from "@/server/auth-guard";
import { route } from "@/server/route";

export const GET = route(async (req, _ctx, requestId) => {
  const { user } = await requireAuth(req);
  return apiSuccess(await WalletRepository.getSummary(user.id), 200, { requestId });
});

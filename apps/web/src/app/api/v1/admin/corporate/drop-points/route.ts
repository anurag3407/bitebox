import { UserRole } from "@startup/contracts";
import { BatchRepository } from "@startup/database";
import { apiSuccess } from "@/server/api-response";
import { requireAuth } from "@/server/auth-guard";
import { route } from "@/server/route";

export const GET = route(async (req, _ctx, requestId) => {
  await requireAuth(req, [UserRole.ADMIN]);
  const dropPoints = await BatchRepository.listAllDropPoints();
  return apiSuccess({ dropPoints }, 200, { requestId });
});

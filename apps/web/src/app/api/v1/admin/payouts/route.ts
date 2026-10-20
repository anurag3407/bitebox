import { UserRole, z } from "@startup/contracts";
import { PayoutRepository } from "@startup/database";
import { apiSuccess } from "@/server/api-response";
import { requireAuth } from "@/server/auth-guard";
import { parseQuery, route } from "@/server/route";

const Query = z.object({ status: z.enum(["PENDING", "MANUAL", "PROCESSING", "PAID", "FAILED"]).optional() });

export const GET = route(async (req, _ctx, requestId) => {
  await requireAuth(req, [UserRole.ADMIN]);
  const { status } = parseQuery(req, Query);
  return apiSuccess(await PayoutRepository.listForAdmin(status), 200, { requestId });
});

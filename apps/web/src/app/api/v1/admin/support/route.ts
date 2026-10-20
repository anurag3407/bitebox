import { UserRole, z } from "@startup/contracts";
import { SupportRepository } from "@startup/database";
import { apiSuccess } from "@/server/api-response";
import { requireAuth } from "@/server/auth-guard";
import { parseQuery, route } from "@/server/route";

const Query = z.object({ status: z.enum(["OPEN", "AWAITING_CUSTOMER", "RESOLVED"]).optional() });

export const GET = route(async (req, _ctx, requestId) => {
  await requireAuth(req, [UserRole.ADMIN]);
  const { status } = parseQuery(req, Query);
  return apiSuccess(await SupportRepository.listQueue(status), 200, { requestId });
});

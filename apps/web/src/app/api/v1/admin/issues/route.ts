import { z } from "zod";
import { UserRole } from "@startup/contracts";
import { OrderExperienceRepository } from "@startup/database";
import { apiSuccess } from "@/server/api-response";
import { requireAuth } from "@/server/auth-guard";
import { parseQuery, route } from "@/server/route";

const QuerySchema = z.object({ status: z.enum(["OPEN", "UNDER_REVIEW", "RESOLVED", "REJECTED"]).optional() });

export const GET = route(async (req, _ctx, requestId) => {
  await requireAuth(req, [UserRole.ADMIN]);
  const { status } = parseQuery(req, QuerySchema);
  return apiSuccess(await OrderExperienceRepository.listQueue(status), 200, { requestId });
});

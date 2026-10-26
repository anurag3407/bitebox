import { z } from "zod";
import { UserRole } from "@startup/contracts";
import { RiderVerificationRepository } from "@startup/database";
import { apiSuccess } from "@/server/api-response";
import { requireAuth } from "@/server/auth-guard";
import { parseQuery, route } from "@/server/route";

const QuerySchema = z.object({
  status: z.enum(["PENDING", "IN_REVIEW", "VERIFIED", "REJECTED", "SUSPENDED"]).optional(),
});

export const GET = route(async (req, _ctx, requestId) => {
  await requireAuth(req, [UserRole.ADMIN]);
  const { status } = parseQuery(req, QuerySchema);
  return apiSuccess(await RiderVerificationRepository.listForAdmin(status), 200, { requestId });
});

import { UserRole, z } from "@startup/contracts";
import { PartnerRepository } from "@startup/database";
import { apiSuccess } from "@/server/api-response";
import { requireAuth } from "@/server/auth-guard";
import { parseQuery, route } from "@/server/route";

const Query = z.object({ status: z.enum(["SUBMITTED", "APPROVED", "REJECTED"]).default("SUBMITTED") });

export const GET = route(async (req, _ctx, requestId) => {
  await requireAuth(req, [UserRole.ADMIN]);
  const { status } = parseQuery(req, Query);
  return apiSuccess(await PartnerRepository.listForAdmin(status), 200, { requestId });
});

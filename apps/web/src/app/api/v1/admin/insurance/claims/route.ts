import { z } from "zod";
import { UserRole } from "@startup/contracts";
import { RiderInsuranceRepository } from "@startup/database";
import { apiSuccess } from "@/server/api-response";
import { requireAuth } from "@/server/auth-guard";
import { parseQuery, route } from "@/server/route";

const Query = z.object({ status: z.enum(["PENDING", "APPROVED", "REJECTED"]).optional() });

export const GET = route(async (req, _ctx, requestId) => {
  await requireAuth(req, [UserRole.ADMIN]);
  const { status } = parseQuery(req, Query);
  const claims = await RiderInsuranceRepository.listClaims(status);
  return apiSuccess({ claims }, 200, { requestId });
});

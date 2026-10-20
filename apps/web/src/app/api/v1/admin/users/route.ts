import { UserRole, z } from "@startup/contracts";
import { AdminUserRepository } from "@startup/database";
import { apiSuccess } from "@/server/api-response";
import { requireAuth } from "@/server/auth-guard";
import { parseQuery, route } from "@/server/route";

const Query = z.object({ q: z.string().trim().max(80).default("") });

export const GET = route(async (req, _ctx, requestId) => {
  await requireAuth(req, [UserRole.ADMIN]);
  const { q } = parseQuery(req, Query);
  return apiSuccess(await AdminUserRepository.search(q), 200, { requestId });
});

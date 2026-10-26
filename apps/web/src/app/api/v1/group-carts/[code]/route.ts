import { GroupCartRepository } from "@startup/database";
import { apiSuccess } from "@/server/api-response";
import { requireAuth } from "@/server/auth-guard";
import { route } from "@/server/route";

export const GET = route<{ code: string }>(async (req, { params }, requestId) => {
  const auth = await requireAuth(req);
  const groupCart = await GroupCartRepository.get((await params).code, auth.user.id);
  return apiSuccess({ groupCart }, 200, { requestId });
});

import { CompleteGroupCartRequestSchema } from "@startup/contracts";
import { GroupCartRepository } from "@startup/database";
import { apiSuccess } from "@/server/api-response";
import { requireAuth } from "@/server/auth-guard";
import { parseBody, route } from "@/server/route";

export const POST = route<{ code: string }>(async (req, { params }, requestId) => {
  const auth = await requireAuth(req);
  const body = await parseBody(req, CompleteGroupCartRequestSchema);
  const groupCart = await GroupCartRepository.complete({
    code: (await params).code,
    hostId: auth.user.id,
    orderId: body.orderId,
  });
  return apiSuccess({ groupCart }, 200, { requestId });
});

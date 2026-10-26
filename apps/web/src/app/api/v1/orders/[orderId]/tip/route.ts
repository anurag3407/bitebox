import { TipOrderSchema } from "@startup/contracts";
import { TipRepository } from "@startup/database";
import { apiSuccess } from "@/server/api-response";
import { requireAuth } from "@/server/auth-guard";
import { enforceRateLimit } from "@/server/rate-limit";
import { assertUuid, parseBody, route } from "@/server/route";

export const POST = route<{ orderId: string }>(async (req, { params }, requestId) => {
  const { user } = await requireAuth(req);
  await enforceRateLimit(req, "mutation", user.id);
  const orderId = assertUuid((await params).orderId, "order");
  const { amountPaise } = await parseBody(req, TipOrderSchema);
  const tip = await TipRepository.addTip({ orderId, customerId: user.id, amountPaise });
  return apiSuccess(tip, 201, { requestId });
});

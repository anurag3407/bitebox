import { AdminCancelOrderRequestSchema, UserRole } from "@startup/contracts";
import { OrderRepository } from "@startup/database";
import { apiSuccess } from "@/server/api-response";
import { requireAuth } from "@/server/auth-guard";
import { logger } from "@/server/logger";
import { assertUuid, parseBody, route } from "@/server/route";

export const POST = route<{ orderId: string }>(async (req, { params }, requestId) => {
  const auth = await requireAuth(req, [UserRole.ADMIN]);
  const orderId = assertUuid((await params).orderId, "order");
  const { reason, refundAmountPaise } = await parseBody(req, AdminCancelOrderRequestSchema);

  const result = await OrderRepository.cancel({
    orderId,
    actor: "ADMIN",
    actorId: auth.user.id,
    reason,
    refundAmountPaise,
  });
  logger.info("admin cancelled order", { requestId, orderId, adminId: auth.user.id, ...result });
  return apiSuccess({ success: true, ...result }, 200, { requestId });
});

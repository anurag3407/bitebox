import { RefundRequestSchema, UserRole } from "@startup/contracts";
import { DomainError } from "@startup/core";
import { OrderRepository, RefundRepository, withTransaction } from "@startup/database";
import { apiSuccess } from "@/server/api-response";
import { requireAuth } from "@/server/auth-guard";
import { logger } from "@/server/logger";
import { assertUuid, parseBody, route } from "@/server/route";

/** Goodwill / partial refund on any captured order (e.g. missing item). */
export const POST = route<{ orderId: string }>(async (req, { params }, requestId) => {
  const auth = await requireAuth(req, [UserRole.ADMIN]);
  const orderId = assertUuid((await params).orderId, "order");
  const { amountPaise, reason } = await parseBody(req, RefundRequestSchema);

  const refund = await withTransaction(async (client) => {
    await OrderRepository.lockForUpdate(client, orderId);
    return RefundRepository.issueWithClient(client, {
      orderId,
      amountPaise,
      reason,
      initiatedBy: `ADMIN:${auth.user.id}`,
    });
  });
  if (!refund) throw new DomainError("STATE_CONFLICT", "This order has no captured payment left to refund.");

  logger.info("admin refund issued", { requestId, orderId, adminId: auth.user.id, amountPaise, refundId: refund.refundId });
  return apiSuccess(
    {
      success: true,
      refundId: refund.refundId,
      amountPaise: refund.amountPaise,
      remainingRefundablePaise: refund.remainingRefundablePaise,
      status: "APPROVED",
    },
    200,
    { requestId }
  );
});

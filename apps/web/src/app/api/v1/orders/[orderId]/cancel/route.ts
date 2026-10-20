import { CustomerCancelOrderRequestSchema, UserRole } from "@startup/contracts";
import { DomainError } from "@startup/core";
import { OrderRepository } from "@startup/database";
import { apiSuccess } from "@/server/api-response";
import { requireAuth } from "@/server/auth-guard";
import { enforceRateLimit } from "@/server/rate-limit";
import { assertUuid, parseBody, route } from "@/server/route";

/**
 * Customer self-cancellation. Free (full refund) until the restaurant accepts;
 * afterwards the policy refuses and the customer is pointed to support.
 * Admins use /admin/orders/:id/cancel, which supports discretionary refunds.
 */
export const POST = route<{ orderId: string }>(async (req, { params }, requestId) => {
  const auth = await requireAuth(req);
  await enforceRateLimit(req, "mutation", auth.user.id);
  const orderId = assertUuid((await params).orderId, "order");
  const { reason } = await parseBody(req, CustomerCancelOrderRequestSchema);

  const access = await OrderRepository.findAccessContext(orderId);
  const isAdmin = auth.role === UserRole.ADMIN;
  if (!access || (access.customerId !== auth.user.id && !isAdmin)) {
    throw new DomainError("NOT_FOUND", "Order not found");
  }

  const result = await OrderRepository.cancel({
    orderId,
    actor: isAdmin ? "ADMIN" : "CUSTOMER",
    actorId: auth.user.id,
    reason: reason?.trim() || (isAdmin ? "Cancelled by support" : "Cancelled by customer"),
  });

  return apiSuccess(
    { success: true, orderId, fulfillmentState: result.fulfillmentState, refundedPaise: result.refundedPaise },
    200,
    { requestId }
  );
});

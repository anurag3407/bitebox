import { UserRole } from "@startup/contracts";
import { DomainError } from "@startup/core";
import { OrderRepository, RefundRepository } from "@startup/database";
import { apiSuccess } from "@/server/api-response";
import { requireAuth } from "@/server/auth-guard";
import { assertUuid, route } from "@/server/route";

export const GET = route<{ orderId: string }>(async (req, { params }, requestId) => {
  await requireAuth(req, [UserRole.ADMIN]);
  const orderId = assertUuid((await params).orderId, "order");
  const [order, events, refunds] = await Promise.all([
    OrderRepository.findById(orderId),
    OrderRepository.listEvents(orderId),
    RefundRepository.listForOrder(orderId),
  ]);
  if (!order) throw new DomainError("NOT_FOUND", "Order not found");
  return apiSuccess({ order, events, refunds }, 200, { requestId });
});

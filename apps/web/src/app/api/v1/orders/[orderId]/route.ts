import { OrderRepository } from "@startup/database";
import { DomainError } from "@startup/core";
import { apiSuccess } from "@/server/api-response";
import { requireAuth } from "@/server/auth-guard";
import { resolveOrderViewer, shapeOrderForViewer } from "@/server/order-access";
import { assertUuid, route } from "@/server/route";

export const GET = route<{ orderId: string }>(async (req, { params }, requestId) => {
  const auth = await requireAuth(req);
  const orderId = assertUuid((await params).orderId, "order");
  const viewer = await resolveOrderViewer(auth, orderId);
  const order = await OrderRepository.findById(orderId);
  if (!order) throw new DomainError("NOT_FOUND", "Order not found");
  return apiSuccess(shapeOrderForViewer(order, viewer), 200, { requestId });
});

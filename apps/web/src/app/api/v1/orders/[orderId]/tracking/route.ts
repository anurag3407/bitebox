import { DomainError } from "@startup/core";
import { apiSuccess } from "@/server/api-response";
import { requireAuth } from "@/server/auth-guard";
import { resolveOrderViewer } from "@/server/order-access";
import { assertUuid, route } from "@/server/route";
import { buildTrackingSnapshot } from "@/server/tracking";

export const GET = route<{ orderId: string }>(async (req, { params }, requestId) => {
  const auth = await requireAuth(req);
  const orderId = assertUuid((await params).orderId, "order");
  const viewer = await resolveOrderViewer(auth, orderId);
  const snapshot = await buildTrackingSnapshot(orderId, viewer);
  if (!snapshot) throw new DomainError("NOT_FOUND", "Order not found");
  return apiSuccess(snapshot, 200, { requestId });
});

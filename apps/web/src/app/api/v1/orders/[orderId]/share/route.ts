import { UserRole } from "@startup/contracts";
import { OrderRepository, ShareRepository } from "@startup/database";
import { apiError, apiSuccess } from "@/server/api-response";
import { requireAuth } from "@/server/auth-guard";
import { enforceRateLimit } from "@/server/rate-limit";
import { assertUuid, route } from "@/server/route";

export const POST = route<{ orderId: string }>(async (req, { params }, requestId) => {
  const auth = await requireAuth(req);
  await enforceRateLimit(req, "mutation", auth.user.id);
  const orderId = assertUuid((await params).orderId, "order");
  const access = await OrderRepository.findAccessContext(orderId);
  if (!access || (access.customerId !== auth.user.id && auth.role !== UserRole.ADMIN)) {
    return apiError("NOT_FOUND", "Order not found", 404, undefined, { requestId });
  }
  const link = await ShareRepository.createOrderLink({ orderId, customerId: access.customerId, hours: 24 });
  const origin = new URL(req.url).origin;
  return apiSuccess({ ...link, url: `${origin}/track/${link.token}` }, 201, { requestId });
});

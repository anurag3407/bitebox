import { OrderIssueRequestSchema, UserRole } from "@startup/contracts";
import { OrderExperienceRepository, OrderRepository } from "@startup/database";
import { apiSuccess } from "@/server/api-response";
import { requireAuth } from "@/server/auth-guard";
import { enforceRateLimit } from "@/server/rate-limit";
import { assertUuid, parseBody, route } from "@/server/route";
import { apiError } from "@/server/api-response";

export const GET = route<{ orderId: string }>(async (req, { params }, requestId) => {
  const auth = await requireAuth(req);
  const orderId = assertUuid((await params).orderId, "order");
  const access = await OrderRepository.findAccessContext(orderId);
  if (!access || (access.customerId !== auth.user.id && auth.role !== UserRole.ADMIN)) {
    return apiError("NOT_FOUND", "Order not found", 404, undefined, { requestId });
  }
  return apiSuccess(await OrderExperienceRepository.listForOrder(orderId), 200, { requestId });
});

export const POST = route<{ orderId: string }>(async (req, { params }, requestId) => {
  const auth = await requireAuth(req);
  await enforceRateLimit(req, "support", auth.user.id);
  const orderId = assertUuid((await params).orderId, "order");
  const body = await parseBody(req, OrderIssueRequestSchema);
  const issue = await OrderExperienceRepository.createIssue(auth.user.id, orderId, body);
  return apiSuccess(issue, 201, { requestId });
});

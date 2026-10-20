import { ManualAssignRiderRequestSchema, UserRole } from "@startup/contracts";
import { RiderRepository } from "@startup/database";
import { apiSuccess } from "@/server/api-response";
import { requireAuth } from "@/server/auth-guard";
import { assertUuid, parseBody, route } from "@/server/route";

export const POST = route<{ orderId: string }>(async (req, { params }, requestId) => {
  const auth = await requireAuth(req, [UserRole.ADMIN]);
  const orderId = assertUuid((await params).orderId, "order");
  const { riderId, reason } = await parseBody(req, ManualAssignRiderRequestSchema);
  const result = await RiderRepository.assignManually({ orderId, riderId, adminId: auth.user.id, reason });
  return apiSuccess({ success: true, ...result }, 200, { requestId });
});

import { UserRole } from "@startup/contracts";
import { PayoutRepository } from "@startup/database";
import { apiSuccess } from "@/server/api-response";
import { requireAuth } from "@/server/auth-guard";
import { assertUuid, route } from "@/server/route";

export const POST = route<{ payoutId: string }>(async (req, { params }, requestId) => {
  const auth = await requireAuth(req, [UserRole.ADMIN]);
  await PayoutRepository.switchToManual(assertUuid((await params).payoutId, "payout"), auth.user.id);
  return apiSuccess({ success: true }, 200, { requestId });
});

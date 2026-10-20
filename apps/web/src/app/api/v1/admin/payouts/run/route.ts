import { UserRole } from "@startup/contracts";
import { AuditRepository, PayoutRepository, getDbPool } from "@startup/database";
import { RazorpayXAdapter } from "@startup/integrations";
import { apiSuccess } from "@/server/api-response";
import { requireAuth } from "@/server/auth-guard";
import { route } from "@/server/route";

/** Off-cycle settlement of everything delivered up to now (the weekly run happens automatically). */
export const POST = route(async (req, _ctx, requestId) => {
  const auth = await requireAuth(req, [UserRole.ADMIN]);
  const created = await PayoutRepository.runSettlement(new Date(), { automaticTransfers: new RazorpayXAdapter().isEnabled });
  await AuditRepository.logWithClient(getDbPool(), {
    adminUserId: auth.user.id,
    action: "SETTLEMENT_RUN",
    targetType: "payouts",
    targetId: "manual",
    details: { created: created.length },
  });
  return apiSuccess({ created: created.length }, 200, { requestId });
});

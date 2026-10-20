import { MarkPayoutPaidSchema, UserRole } from "@startup/contracts";
import { DomainError } from "@startup/core";
import { PayoutRepository } from "@startup/database";
import { apiSuccess } from "@/server/api-response";
import { requireAuth } from "@/server/auth-guard";
import { assertUuid, parseBody, route } from "@/server/route";

/** Records a manual bank transfer (NEFT/IMPS) by its UTR. */
export const POST = route<{ payoutId: string }>(async (req, { params }, requestId) => {
  const auth = await requireAuth(req, [UserRole.ADMIN]);
  const payoutId = assertUuid((await params).payoutId, "payout");
  const { utr } = await parseBody(req, MarkPayoutPaidSchema);
  const payout = await PayoutRepository.findById(payoutId);
  if (!payout) throw new DomainError("NOT_FOUND", "Payout not found");
  if (payout.status !== "MANUAL") throw new DomainError("STATE_CONFLICT", "Only manual payouts can be marked paid by hand");
  await PayoutRepository.markPaid(payoutId, { utr, adminId: auth.user.id });
  return apiSuccess({ success: true }, 200, { requestId });
});

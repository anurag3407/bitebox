import { z } from "zod";
import { UserRole } from "@startup/contracts";
import { AuditRepository, RiderInsuranceRepository } from "@startup/database";
import { apiSuccess } from "@/server/api-response";
import { requireAuth } from "@/server/auth-guard";
import { assertUuid, parseBody, route } from "@/server/route";

const Review = z.object({
  status: z.enum(["APPROVED", "REJECTED"]),
  approvedPaise: z.number().int().positive().optional(),
  note: z.string().trim().max(1000).optional(),
});

export const POST = route<{ claimId: string }>(async (req, { params }, requestId) => {
  const auth = await requireAuth(req, [UserRole.ADMIN]);
  const claimId = assertUuid((await params).claimId, "claim");
  const body = await parseBody(req, Review);
  const claim = await RiderInsuranceRepository.reviewClaim({
    claimId,
    adminId: auth.user.id,
    status: body.status,
    approvedPaise: body.approvedPaise,
    note: body.note,
  });
  await AuditRepository.log({
    adminUserId: auth.user.id,
    action: `INSURANCE_CLAIM_${body.status}`,
    targetType: "rider_insurance_claim",
    targetId: claimId,
    details: { approvedPaise: claim.approvedPaise, riderId: claim.riderId },
  });
  return apiSuccess({ claim }, 200, { requestId });
});

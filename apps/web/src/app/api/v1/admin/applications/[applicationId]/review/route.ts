import { ReviewApplicationSchema, UserRole } from "@startup/contracts";
import { PartnerRepository } from "@startup/database";
import { apiSuccess } from "@/server/api-response";
import { requireAuth } from "@/server/auth-guard";
import { assertUuid, parseBody, route } from "@/server/route";

export const POST = route<{ applicationId: string }>(async (req, { params }, requestId) => {
  const auth = await requireAuth(req, [UserRole.ADMIN]);
  const applicationId = assertUuid((await params).applicationId, "application");
  const { decision, note } = await parseBody(req, ReviewApplicationSchema);
  const result =
    decision === "APPROVE"
      ? await PartnerRepository.approve(applicationId, auth.user.id, note)
      : await PartnerRepository.reject(applicationId, auth.user.id, note);
  return apiSuccess(result, 200, { requestId });
});

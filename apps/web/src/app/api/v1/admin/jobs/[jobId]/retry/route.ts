import { UserRole } from "@startup/contracts";
import { DomainError } from "@startup/core";
import { AuditRepository, JobRepository } from "@startup/database";
import { apiSuccess } from "@/server/api-response";
import { requireAuth } from "@/server/auth-guard";
import { assertUuid, route } from "@/server/route";

export const POST = route<{ jobId: string }>(async (req, { params }, requestId) => {
  const auth = await requireAuth(req, [UserRole.ADMIN]);
  const jobId = assertUuid((await params).jobId, "job");
  const retried = await JobRepository.retryFailed(jobId);
  if (!retried) throw new DomainError("STATE_CONFLICT", "Only failed jobs can be retried");
  await AuditRepository.log({
    adminUserId: auth.user.id,
    action: "JOB_RETRY",
    targetType: "job",
    targetId: jobId,
  });
  return apiSuccess({ retried: true, jobId }, 200, { requestId });
});

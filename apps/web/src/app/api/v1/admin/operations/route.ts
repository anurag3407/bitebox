import { UserRole } from "@startup/contracts";
import { AuditRepository, BatchRepository, JobRepository } from "@startup/database";
import { apiSuccess } from "@/server/api-response";
import { requireAuth } from "@/server/auth-guard";
import { route } from "@/server/route";

export const GET = route(async (req, _ctx, requestId) => {
  await requireAuth(req, [UserRole.ADMIN]);
  const [stats, jobs, audits, clusters] = await Promise.all([
    JobRepository.stats(),
    JobRepository.listRecent(undefined, 60),
    AuditRepository.listRecent(60),
    BatchRepository.listClusters(),
  ]);
  return apiSuccess(
    {
      stats,
      jobs,
      failedJobs: jobs.filter((j) => j.status === "FAILED"),
      audits,
      clusters,
    },
    200,
    { requestId }
  );
});

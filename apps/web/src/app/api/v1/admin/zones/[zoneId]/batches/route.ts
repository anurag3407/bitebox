import { UserRole } from "@startup/contracts";
import { BatchRepository } from "@startup/database";
import { apiSuccess } from "@/server/api-response";
import { requireAuth } from "@/server/auth-guard";
import { assertUuid, route } from "@/server/route";

export const GET = route<{ zoneId: string }>(async (req, { params }, requestId) => {
  await requireAuth(req, [UserRole.ADMIN]);
  const zoneId = assertUuid((await params).zoneId, "zone");
  const [candidates, batches] = await Promise.all([
    BatchRepository.listBatchCandidates(zoneId),
    BatchRepository.listBatches(zoneId),
  ]);
  return apiSuccess({ candidates, batches }, 200, { requestId });
});

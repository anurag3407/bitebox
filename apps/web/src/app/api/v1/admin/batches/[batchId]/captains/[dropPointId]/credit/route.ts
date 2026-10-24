import { UserRole } from "@startup/contracts";
import { BatchRepository } from "@startup/database";
import { apiSuccess } from "@/server/api-response";
import { requireAuth } from "@/server/auth-guard";
import { assertUuid, route } from "@/server/route";

export const POST = route<{ batchId: string; dropPointId: string }>(async (req, { params }, requestId) => {
  await requireAuth(req, [UserRole.ADMIN]);
  const { batchId: rawBatchId, dropPointId: rawDropPointId } = await params;
  const batchId = assertUuid(rawBatchId, "batch");
  const dropPointId = assertUuid(rawDropPointId, "drop point");
  const result = await BatchRepository.creditCaptainHandover({ batchId, dropPointId });
  return apiSuccess({ batchId, dropPointId, ...result }, 200, { requestId });
});

import { z } from "zod";
import { UserRole } from "@startup/contracts";
import { AuditRepository, BatchRepository } from "@startup/database";
import { apiSuccess } from "@/server/api-response";
import { requireAuth } from "@/server/auth-guard";
import { assertUuid, parseBody, route } from "@/server/route";

const AssignRider = z.object({ riderId: z.string().uuid().nullable() });

export const PATCH = route<{ zoneId: string; batchId: string }>(async (req, { params }, requestId) => {
  const auth = await requireAuth(req, [UserRole.ADMIN]);
  const zoneId = assertUuid((await params).zoneId, "zone");
  const batchId = assertUuid((await params).batchId, "batch");
  const body = await parseBody(req, AssignRider);
  const batch = await BatchRepository.assignBatchRider({
    batchId,
    clusterId: zoneId,
    riderId: body.riderId,
  });
  await AuditRepository.log({
    adminUserId: auth.user.id,
    action: body.riderId ? "BATCH_RIDER_ASSIGNED" : "BATCH_RIDER_UNASSIGNED",
    targetType: "dispatch_batch",
    targetId: batchId,
    details: { zoneId, riderId: body.riderId },
  });
  return apiSuccess({ batchId, riderId: batch.rider_id }, 200, { requestId });
});

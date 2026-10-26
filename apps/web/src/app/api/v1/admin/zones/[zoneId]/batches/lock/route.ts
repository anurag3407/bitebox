import { z } from "zod";
import { UserRole } from "@startup/contracts";
import { DomainError } from "@startup/core";
import { AuditRepository, BatchRepository } from "@startup/database";
import { apiSuccess } from "@/server/api-response";
import { requireAuth } from "@/server/auth-guard";
import { assertUuid, parseBody, route } from "@/server/route";

const LockBatch = z.object({
  slotWindow: z.string().trim().min(5).max(40),
  slotStart: z.string().datetime(),
  slotEnd: z.string().datetime(),
  riderId: z.string().uuid().optional(),
});

export const POST = route<{ zoneId: string }>(async (req, { params }, requestId) => {
  const auth = await requireAuth(req, [UserRole.ADMIN]);
  const zoneId = assertUuid((await params).zoneId, "zone");
  const body = await parseBody(req, LockBatch);
  const start = new Date(body.slotStart);
  const end = new Date(body.slotEnd);
  if (end.getTime() <= start.getTime()) throw new DomainError("VALIDATION_ERROR", "Batch window must end after it starts");
  const result = await BatchRepository.lockBatch({
    clusterId: zoneId,
    slotWindow: body.slotWindow,
    slotStart: start,
    slotEnd: end,
    riderId: body.riderId ?? null,
  });
  if (!result) throw new DomainError("STATE_CONFLICT", "No paid, unbatched orders for this slot");
  await AuditRepository.log({
    adminUserId: auth.user.id,
    action: "BATCH_LOCKED",
    targetType: "dispatch_batch",
    targetId: result.batch.id,
    details: { zoneId, slotWindow: body.slotWindow, orders: result.orders },
  });
  return apiSuccess(
    {
      batchId: result.batch.id,
      status: result.batch.status,
      totalDrops: result.batch.total_drops,
      orders: result.orders,
      manifest: result.manifest,
    },
    201,
    { requestId }
  );
});

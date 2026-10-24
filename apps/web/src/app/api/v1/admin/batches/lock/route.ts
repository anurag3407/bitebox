import { z } from "zod";
import { UserRole } from "@startup/contracts";
import { BatchRepository } from "@startup/database";
import { apiSuccess } from "@/server/api-response";
import { requireAuth } from "@/server/auth-guard";
import { parseBody, route } from "@/server/route";

const LockBatch = z.object({
  clusterId: z.string().uuid(),
  slotWindow: z.string().min(3),
  slotStart: z.string().datetime(),
  slotEnd: z.string().datetime(),
  riderId: z.string().uuid().nullable().optional(),
  riderTrunkCostPaise: z.number().int().nonnegative().optional(),
});

export const POST = route(async (req, _ctx, requestId) => {
  await requireAuth(req, [UserRole.ADMIN]);
  const body = await parseBody(req, LockBatch);
  const result = await BatchRepository.lockBatch({
    clusterId: body.clusterId,
    slotWindow: body.slotWindow,
    slotStart: new Date(body.slotStart),
    slotEnd: new Date(body.slotEnd),
    riderId: body.riderId,
    riderTrunkCostPaise: body.riderTrunkCostPaise,
  });
  return apiSuccess(result, result ? 201 : 200, { requestId });
});

import { z } from "zod";
import { UserRole } from "@startup/contracts";
import { BatchRepository } from "@startup/database";
import { apiSuccess } from "@/server/api-response";
import { requireAuth } from "@/server/auth-guard";
import { parseBody, route } from "@/server/route";

const CreateCluster = z.object({
  cityId: z.string().uuid(),
  name: z.string().trim().min(2).max(120),
  polygonGeojson: z.array(z.object({ latitude: z.number(), longitude: z.number() })).min(3),
  minProfitableDrops: z.number().int().min(1).max(50).optional(),
});

export const POST = route(async (req, _ctx, requestId) => {
  await requireAuth(req, [UserRole.ADMIN]);
  const body = await parseBody(req, CreateCluster);
  const cluster = await BatchRepository.createCluster(body);
  return apiSuccess({ cluster }, 201, { requestId });
});

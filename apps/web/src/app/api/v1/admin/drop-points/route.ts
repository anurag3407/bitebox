import { z } from "zod";
import { UserRole } from "@startup/contracts";
import { BatchRepository } from "@startup/database";
import { apiSuccess } from "@/server/api-response";
import { requireAuth } from "@/server/auth-guard";
import { parseBody, parseQuery, route } from "@/server/route";

const Query = z.object({ clusterId: z.string().uuid() });
const CreateDropPoint = z.object({
  clusterId: z.string().uuid(),
  name: z.string().trim().min(2).max(120),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  microCaptainId: z.string().uuid().nullable().optional(),
  captainFeePerBagPaise: z.number().int().nonnegative().optional(),
});

export const GET = route(async (req, _ctx, requestId) => {
  await requireAuth(req, [UserRole.ADMIN, UserRole.MERCHANT_STAFF]);
  const { clusterId } = parseQuery(req, Query);
  const dropPoints = await BatchRepository.listDropPoints(clusterId);
  return apiSuccess({ dropPoints }, 200, { requestId });
});

export const POST = route(async (req, _ctx, requestId) => {
  await requireAuth(req, [UserRole.ADMIN]);
  const body = await parseBody(req, CreateDropPoint);
  const dropPoint = await BatchRepository.createDropPoint(body);
  return apiSuccess({ dropPoint }, 201, { requestId });
});

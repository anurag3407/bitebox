import { z } from "zod";
import { AddonRepository } from "@startup/database";
import { apiSuccess } from "@/server/api-response";
import { requireAuth } from "@/server/auth-guard";
import { parseQuery, route } from "@/server/route";

const Query = z.object({ parentOrderId: z.string().uuid() });

export const GET = route(async (req, _ctx, requestId) => {
  await requireAuth(req);
  const { parentOrderId } = parseQuery(req, Query);
  const skus = await AddonRepository.listUpsell(parentOrderId);
  return apiSuccess({ parentOrderId, skus }, 200, { requestId });
});

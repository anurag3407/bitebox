import { z } from "zod";
import { DiningEventRepository } from "@startup/database";
import { apiSuccess } from "@/server/api-response";
import { parseQuery, route } from "@/server/route";

const Query = z.object({ limit: z.coerce.number().int().min(1).max(50).default(20) });

export const GET = route(async (req, _ctx, requestId) => {
  const { limit } = parseQuery(req, Query);
  const events = await DiningEventRepository.listUpcoming(limit);
  return apiSuccess({ events }, 200, { requestId });
});

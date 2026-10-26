import { z } from "zod";
import { PersonalizationRepository } from "@startup/database";
import { apiSuccess } from "@/server/api-response";
import { requireAuth } from "@/server/auth-guard";
import { parseQuery, route } from "@/server/route";

const Query = z.object({
  latitude: z.coerce.number().min(-90).max(90).optional(),
  longitude: z.coerce.number().min(-180).max(180).optional(),
  limit: z.coerce.number().int().min(1).max(12).optional(),
});

export const GET = route(async (req, _ctx, requestId) => {
  const auth = await requireAuth(req);
  const query = parseQuery(req, Query);
  const feed = await PersonalizationRepository.feed({
    userId: auth.user.id,
    latitude: query.latitude,
    longitude: query.longitude,
    limit: query.limit,
  });
  return apiSuccess(feed, 200, { requestId });
});

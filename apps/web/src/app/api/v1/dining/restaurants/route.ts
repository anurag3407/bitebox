import { z } from "zod";
import { DiningRepository } from "@startup/database";
import { apiSuccess } from "@/server/api-response";
import { route, parseQuery } from "@/server/route";

const QuerySchema = z.object({
  latitude: z.coerce.number().min(-90).max(90).optional(),
  longitude: z.coerce.number().min(-180).max(180).optional(),
  cuisine: z.string().trim().max(40).optional(),
});

export const GET = route(async (req, _ctx, requestId) => {
  const { latitude, longitude, cuisine } = parseQuery(req, QuerySchema);
  const origin = latitude !== undefined && longitude !== undefined ? { latitude, longitude } : undefined;
  return apiSuccess(await DiningRepository.listRestaurants(origin, cuisine), 200, { requestId });
});

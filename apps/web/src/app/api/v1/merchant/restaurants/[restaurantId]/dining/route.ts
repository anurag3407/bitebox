import { z } from "zod";
import { DiningRepository } from "@startup/database";
import { apiSuccess } from "@/server/api-response";
import { StaffPermission } from "@/server/auth-guard";
import { authorizeRestaurant } from "@/server/merchant-catalog";
import { parseQuery, route } from "@/server/route";

const QuerySchema = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() });

export const GET = route<{ restaurantId: string }>(async (req, { params }, requestId) => {
  const { restaurantId } = await authorizeRestaurant(req, params, StaffPermission.OPERATE);
  const { date } = parseQuery(req, QuerySchema);
  return apiSuccess(await DiningRepository.listForRestaurant(restaurantId, date), 200, { requestId });
});

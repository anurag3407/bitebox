import { z } from "zod";
import { DiningRepository } from "@startup/database";
import { apiSuccess } from "@/server/api-response";
import { assertUuid, parseQuery, route } from "@/server/route";

const QuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

function todayIst(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
}

export const GET = route<{ restaurantId: string }>(async (req, { params }, requestId) => {
  const restaurantId = assertUuid((await params).restaurantId, "restaurant");
  const { date } = parseQuery(req, QuerySchema);
  return apiSuccess(await DiningRepository.getAvailability(restaurantId, date ?? todayIst()), 200, { requestId });
});

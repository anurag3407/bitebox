import { MealPassRepository } from "@startup/database";
import { apiSuccess } from "@/server/api-response";
import { requireAuth } from "@/server/auth-guard";
import { route } from "@/server/route";

export const GET = route(async (req, _ctx, requestId) => {
  const auth = await requireAuth(req);
  const deliveries = await MealPassRepository.listDeliveries(auth.user.id);
  return apiSuccess({ deliveries }, 200, { requestId });
});

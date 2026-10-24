import { MealPassRepository } from "@startup/database";
import { apiSuccess } from "@/server/api-response";
import { requireAuth } from "@/server/auth-guard";
import { assertUuid, route } from "@/server/route";

export const POST = route<{ deliveryId: string }>(async (req, { params }, requestId) => {
  const auth = await requireAuth(req);
  const deliveryId = assertUuid((await params).deliveryId, "delivery");
  const result = await MealPassRepository.skipDelivery({ deliveryId, userId: auth.user.id });
  return apiSuccess({ ...result, deliveryId }, 200, { requestId });
});

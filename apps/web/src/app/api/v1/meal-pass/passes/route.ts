import { z } from "zod";
import { MealPassRepository } from "@startup/database";
import { apiSuccess } from "@/server/api-response";
import { requireAuth } from "@/server/auth-guard";
import { parseBody, route } from "@/server/route";

const PurchasePass = z.object({
  planId: z.string().uuid(),
  dropPointId: z.string().uuid().optional(),
});

export const GET = route(async (req, _ctx, requestId) => {
  const auth = await requireAuth(req);
  const passes = await MealPassRepository.listPasses(auth.user.id);
  return apiSuccess({ passes }, 200, { requestId });
});

export const POST = route(async (req, _ctx, requestId) => {
  const auth = await requireAuth(req);
  const body = await parseBody(req, PurchasePass);
  const result = await MealPassRepository.purchasePass({
    userId: auth.user.id,
    planId: body.planId,
    dropPointId: body.dropPointId,
  });
  return apiSuccess(
    {
      pass: result.pass,
      plan: { id: result.plan.id, name: result.plan.name, totalMeals: result.plan.total_meals },
    },
    201,
    { requestId }
  );
});

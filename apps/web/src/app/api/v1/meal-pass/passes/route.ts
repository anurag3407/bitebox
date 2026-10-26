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
  return apiSuccess(
    {
      passes: passes.map((p) => ({
        id: p.id,
        planId: p.plan_id,
        planName: p.plan_name,
        skuType: p.sku_type,
        slotWindow: p.slot_window,
        kitchenId: p.kitchen_restaurant_id,
        kitchenName: p.kitchen_name,
        totalMeals: p.total_meals,
        mealsRemaining: p.meals_remaining,
        status: p.status,
        autoScheduleDays: p.auto_schedule_days,
        purchasedAt: p.purchased_at,
        expiresAt: p.expires_at,
      })),
    },
    200,
    { requestId }
  );
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
      pass: {
        id: result.pass.id,
        planId: result.pass.plan_id,
        mealsRemaining: result.pass.meals_remaining,
        status: result.pass.status,
        expiresAt: result.pass.expires_at,
      },
      plan: { id: result.plan.id, name: result.plan.name, totalMeals: result.plan.total_meals },
      scheduledDeliveries: result.scheduledDeliveries,
      paymentMethod: "WALLET",
    },
    201,
    { requestId }
  );
});

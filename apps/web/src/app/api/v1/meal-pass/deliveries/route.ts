import { MealPassRepository } from "@startup/database";
import { apiSuccess } from "@/server/api-response";
import { requireAuth } from "@/server/auth-guard";
import { route } from "@/server/route";

export const GET = route(async (req, _ctx, requestId) => {
  const auth = await requireAuth(req);
  const deliveries = await MealPassRepository.listDeliveries(auth.user.id);
  return apiSuccess(
    {
      deliveries: deliveries.map((d) => ({
        id: d.id,
        passId: d.pass_id,
        planName: d.plan_name,
        skuType: d.sku_type,
        kitchenName: d.kitchen_name,
        deliveryDate: String(d.delivery_date_text ?? d.delivery_date).slice(0, 10),
        slotWindow: d.slot_window,
        status: d.status,
        source: d.source,
        skipAt: d.skip_at,
        surplusListingId: d.surplus_listing_id,
      })),
    },
    200,
    { requestId }
  );
});

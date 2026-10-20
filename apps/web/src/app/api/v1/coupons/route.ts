import { z } from "zod";
import { CouponRepository } from "@startup/database";
import { apiSuccess } from "@/server/api-response";
import { parseQuery, route } from "@/server/route";

const QuerySchema = z.object({ restaurantId: z.string().uuid().optional() });

/** Offers shown on the cart page ("Available coupons"). */
export const GET = route(async (req, _ctx, requestId) => {
  const { restaurantId } = parseQuery(req, QuerySchema);
  const coupons = await CouponRepository.listActive(restaurantId);
  return apiSuccess(
    coupons.map((c) => ({
      code: c.code,
      description: c.description ?? undefined,
      type: c.type,
      minOrderPaise: c.minOrderPaise,
      maxDiscountPaise: c.maxDiscountPaise ?? undefined,
      firstOrderOnly: c.firstOrderOnly,
    })),
    200,
    { requestId }
  );
});

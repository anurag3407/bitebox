import { MerchantCouponInputSchema } from "@startup/contracts";
import { CouponRepository } from "@startup/database";
import { apiSuccess } from "@/server/api-response";
import { StaffPermission } from "@/server/auth-guard";
import { authorizeRestaurant } from "@/server/merchant-catalog";
import { enforceRateLimit } from "@/server/rate-limit";
import { parseBody, route } from "@/server/route";

export const GET = route<{ restaurantId: string }>(async (req, { params }, requestId) => {
  const { restaurantId } = await authorizeRestaurant(req, params, StaffPermission.MANAGE_OUTLET);
  return apiSuccess(await CouponRepository.listForRestaurant(restaurantId), 200, { requestId });
});

export const POST = route<{ restaurantId: string }>(async (req, { params }, requestId) => {
  const { auth, restaurantId } = await authorizeRestaurant(req, params, StaffPermission.MANAGE_OUTLET);
  await enforceRateLimit(req, "mutation", auth.user.id);
  const input = await parseBody(req, MerchantCouponInputSchema);
  const coupon = await CouponRepository.createForRestaurant(restaurantId, input);
  return apiSuccess(coupon, 201, { requestId });
});

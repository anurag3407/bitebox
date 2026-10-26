import { MerchantCouponStatusSchema } from "@startup/contracts";
import { CouponRepository } from "@startup/database";
import { apiSuccess } from "@/server/api-response";
import { StaffPermission } from "@/server/auth-guard";
import { authorizeRestaurant } from "@/server/merchant-catalog";
import { assertUuid, parseBody, route } from "@/server/route";

export const PATCH = route<{ restaurantId: string; couponId: string }>(async (req, { params }, requestId) => {
  const resolved = await params;
  const { restaurantId } = await authorizeRestaurant(req, params, StaffPermission.MANAGE_OUTLET);
  const couponId = assertUuid(resolved.couponId, "coupon");
  const { isActive } = await parseBody(req, MerchantCouponStatusSchema);
  return apiSuccess(await CouponRepository.setRestaurantCouponActive(restaurantId, couponId, isActive), 200, { requestId });
});

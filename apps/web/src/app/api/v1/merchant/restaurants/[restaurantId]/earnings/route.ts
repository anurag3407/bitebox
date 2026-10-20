import { PayoutRepository } from "@startup/database";
import { apiSuccess } from "@/server/api-response";
import { StaffPermission } from "@/server/auth-guard";
import { authorizeRestaurant, merchantIdOf } from "@/server/merchant-catalog";
import { route } from "@/server/route";

export const GET = route<{ restaurantId: string }>(async (req, { params }, requestId) => {
  const { restaurantId } = await authorizeRestaurant(req, params, StaffPermission.OWNER_ONLY);
  const merchantId = await merchantIdOf(restaurantId);
  const [summary, account] = await Promise.all([
    PayoutRepository.earningsSummary("MERCHANT", merchantId),
    PayoutRepository.getAccount("MERCHANT", merchantId),
  ]);
  return apiSuccess({ ...summary, account }, 200, { requestId });
});

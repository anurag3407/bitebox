import { UserRole } from "@startup/contracts";
import { RestaurantRepository } from "@startup/database";
import { apiSuccess } from "@/server/api-response";
import { requireAuth } from "@/server/auth-guard";
import { route } from "@/server/route";

export const GET = route(async (req, _ctx, requestId) => {
  const auth = await requireAuth(req, [UserRole.MERCHANT_STAFF]);
  return apiSuccess(await RestaurantRepository.listForMerchantUser(auth.user.id), 200, { requestId });
});

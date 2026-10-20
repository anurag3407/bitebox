import { PayoutAccountSchema } from "@startup/contracts";
import { getDataEncryptionKey } from "@startup/config";
import { PayoutRepository } from "@startup/database";
import { apiSuccess } from "@/server/api-response";
import { StaffPermission } from "@/server/auth-guard";
import { authorizeRestaurant, merchantIdOf } from "@/server/merchant-catalog";
import { parseBody, route } from "@/server/route";

export const PUT = route<{ restaurantId: string }>(async (req, { params }, requestId) => {
  const { restaurantId } = await authorizeRestaurant(req, params, StaffPermission.OWNER_ONLY);
  const body = await parseBody(req, PayoutAccountSchema);
  const result = await PayoutRepository.saveAccount("MERCHANT", await merchantIdOf(restaurantId), body, getDataEncryptionKey());
  return apiSuccess(result, 200, { requestId });
});

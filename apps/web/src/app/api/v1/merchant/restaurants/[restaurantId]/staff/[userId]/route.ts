import { AdminUserRepository } from "@startup/database";
import { apiSuccess } from "@/server/api-response";
import { StaffPermission } from "@/server/auth-guard";
import { authorizeRestaurant } from "@/server/merchant-catalog";
import { assertUuid, route } from "@/server/route";

export const DELETE = route<{ restaurantId: string; userId: string }>(async (req, { params }, requestId) => {
  const { restaurantId } = await authorizeRestaurant(req, params, StaffPermission.OWNER_ONLY);
  await AdminUserRepository.removeStaff(restaurantId, assertUuid((await params).userId, "user"));
  return apiSuccess({ success: true }, 200, { requestId });
});

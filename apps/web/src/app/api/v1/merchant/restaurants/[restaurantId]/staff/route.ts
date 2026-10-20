import { AddStaffSchema } from "@startup/contracts";
import { AdminUserRepository } from "@startup/database";
import { apiSuccess } from "@/server/api-response";
import { StaffPermission } from "@/server/auth-guard";
import { authorizeRestaurant } from "@/server/merchant-catalog";
import { parseBody, route } from "@/server/route";

export const GET = route<{ restaurantId: string }>(async (req, { params }, requestId) => {
  const { restaurantId } = await authorizeRestaurant(req, params, StaffPermission.MANAGE_OUTLET);
  return apiSuccess(await AdminUserRepository.listStaff(restaurantId), 200, { requestId });
});

export const POST = route<{ restaurantId: string }>(async (req, { params }, requestId) => {
  const { auth, restaurantId } = await authorizeRestaurant(req, params, StaffPermission.OWNER_ONLY);
  const body = await parseBody(req, AddStaffSchema);
  await AdminUserRepository.addStaff({ restaurantId, email: body.email, staffRole: body.staffRole, addedBy: auth.user.id });
  return apiSuccess({ success: true }, 201, { requestId });
});

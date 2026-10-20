import { RestaurantSettingsSchema } from "@startup/contracts";
import { MenuEditorRepository } from "@startup/database";
import { apiSuccess } from "@/server/api-response";
import { StaffPermission } from "@/server/auth-guard";
import { authorizeRestaurant, refreshPublicMenu } from "@/server/merchant-catalog";
import { parseBody, route } from "@/server/route";

export const PATCH = route<{ restaurantId: string }>(async (req, { params }, requestId) => {
  const { restaurantId } = await authorizeRestaurant(req, params, StaffPermission.MANAGE_OUTLET);
  const body = await parseBody(req, RestaurantSettingsSchema);
  const { slug } = await MenuEditorRepository.updateSettings(restaurantId, body);
  await refreshPublicMenu(slug);
  return apiSuccess({ success: true }, 200, { requestId });
});

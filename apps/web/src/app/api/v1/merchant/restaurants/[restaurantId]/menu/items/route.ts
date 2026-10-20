import { MenuItemInputSchema } from "@startup/contracts";
import { MenuEditorRepository } from "@startup/database";
import { apiSuccess } from "@/server/api-response";
import { StaffPermission } from "@/server/auth-guard";
import { authorizeRestaurant, refreshPublicMenu } from "@/server/merchant-catalog";
import { parseBody, route } from "@/server/route";

export const POST = route<{ restaurantId: string }>(async (req, { params }, requestId) => {
  const { restaurantId } = await authorizeRestaurant(req, params, StaffPermission.EDIT_MENU);
  const body = await parseBody(req, MenuItemInputSchema);
  const { id, slug } = await MenuEditorRepository.saveItem(restaurantId, null, body);
  await refreshPublicMenu(slug);
  return apiSuccess({ id }, 201, { requestId });
});

import { MenuItemInputSchema } from "@startup/contracts";
import { MenuEditorRepository } from "@startup/database";
import { apiSuccess } from "@/server/api-response";
import { StaffPermission } from "@/server/auth-guard";
import { authorizeRestaurant, refreshPublicMenu } from "@/server/merchant-catalog";
import { assertUuid, parseBody, route } from "@/server/route";

type P = { restaurantId: string; itemId: string };

export const PUT = route<P>(async (req, { params }, requestId) => {
  const { restaurantId } = await authorizeRestaurant(req, params, StaffPermission.EDIT_MENU);
  const itemId = assertUuid((await params).itemId, "dish");
  const body = await parseBody(req, MenuItemInputSchema);
  const { slug } = await MenuEditorRepository.saveItem(restaurantId, itemId, body);
  await refreshPublicMenu(slug);
  return apiSuccess({ id: itemId }, 200, { requestId });
});

export const DELETE = route<P>(async (req, { params }, requestId) => {
  const { restaurantId } = await authorizeRestaurant(req, params, StaffPermission.EDIT_MENU);
  const { slug } = await MenuEditorRepository.archiveItem(restaurantId, assertUuid((await params).itemId, "dish"));
  await refreshPublicMenu(slug);
  return apiSuccess({ success: true }, 200, { requestId });
});

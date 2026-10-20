import { MenuCategoryInputSchema } from "@startup/contracts";
import { MenuEditorRepository } from "@startup/database";
import { apiSuccess } from "@/server/api-response";
import { StaffPermission } from "@/server/auth-guard";
import { authorizeRestaurant, refreshPublicMenu } from "@/server/merchant-catalog";
import { assertUuid, parseBody, route } from "@/server/route";

type P = { restaurantId: string; categoryId: string };

export const PATCH = route<P>(async (req, { params }, requestId) => {
  const { restaurantId } = await authorizeRestaurant(req, params, StaffPermission.EDIT_MENU);
  const categoryId = assertUuid((await params).categoryId, "category");
  const body = await parseBody(req, MenuCategoryInputSchema.partial());
  const { slug } = await MenuEditorRepository.updateCategory(restaurantId, categoryId, body);
  await refreshPublicMenu(slug);
  return apiSuccess({ success: true }, 200, { requestId });
});

export const DELETE = route<P>(async (req, { params }, requestId) => {
  const { restaurantId } = await authorizeRestaurant(req, params, StaffPermission.EDIT_MENU);
  const { slug } = await MenuEditorRepository.archiveCategory(restaurantId, assertUuid((await params).categoryId, "category"));
  await refreshPublicMenu(slug);
  return apiSuccess({ success: true }, 200, { requestId });
});

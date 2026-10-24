import { AttributionRepository } from "@startup/database";
import { apiSuccess } from "@/server/api-response";
import { StaffPermission } from "@/server/auth-guard";
import { authorizeRestaurant } from "@/server/merchant-catalog";
import { route } from "@/server/route";

export const GET = route<{ restaurantId: string }>(async (req, { params }, requestId) => {
  const { restaurantId } = await authorizeRestaurant(req, params, StaffPermission.MANAGE_OUTLET);
  const link = await AttributionRepository.buildSignedLink({
    baseUrl: new URL(req.url).origin,
    restaurantId,
  });
  return apiSuccess({ restaurantId, ...link }, 200, { requestId });
});

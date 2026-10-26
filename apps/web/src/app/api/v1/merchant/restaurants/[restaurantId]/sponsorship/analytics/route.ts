import { SponsorshipRepository } from "@startup/database";
import { apiSuccess } from "@/server/api-response";
import { StaffPermission } from "@/server/auth-guard";
import { authorizeRestaurant } from "@/server/merchant-catalog";
import { route } from "@/server/route";

export const dynamic = "force-dynamic";

export const GET = route<{ restaurantId: string }>(async (req, { params }, requestId) => {
  const { restaurantId } = await authorizeRestaurant(req, params, StaffPermission.MANAGE_OUTLET);
  const analytics = await SponsorshipRepository.analytics(restaurantId);
  return apiSuccess(analytics, 200, { requestId });
});

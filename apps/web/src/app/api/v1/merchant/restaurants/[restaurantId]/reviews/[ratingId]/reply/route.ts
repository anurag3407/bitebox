import { ReplyToReviewSchema } from "@startup/contracts";
import { RatingRepository } from "@startup/database";
import { apiSuccess } from "@/server/api-response";
import { StaffPermission } from "@/server/auth-guard";
import { authorizeRestaurant } from "@/server/merchant-catalog";
import { assertUuid, parseBody, route } from "@/server/route";

export const POST = route<{ restaurantId: string; ratingId: string }>(async (req, { params }, requestId) => {
  const resolved = await params;
  const { restaurantId } = await authorizeRestaurant(req, params, StaffPermission.OPERATE);
  const ratingId = assertUuid(resolved.ratingId, "review");
  const { reply } = await parseBody(req, ReplyToReviewSchema);
  await RatingRepository.reply(restaurantId, ratingId, reply);
  return apiSuccess({ success: true }, 200, { requestId });
});

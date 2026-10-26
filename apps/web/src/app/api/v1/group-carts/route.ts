import { CreateGroupCartRequestSchema } from "@startup/contracts";
import { GroupCartRepository } from "@startup/database";
import { apiSuccess } from "@/server/api-response";
import { requireAuth } from "@/server/auth-guard";
import { enforceRateLimit } from "@/server/rate-limit";
import { parseBody, route } from "@/server/route";

export const POST = route(async (req, _ctx, requestId) => {
  const auth = await requireAuth(req);
  await enforceRateLimit(req, "mutation", auth.user.id);
  const body = await parseBody(req, CreateGroupCartRequestSchema);
  const groupCart = await GroupCartRepository.create({ hostUserId: auth.user.id, restaurantId: body.restaurantId });
  return apiSuccess({ groupCart }, 201, { requestId });
});

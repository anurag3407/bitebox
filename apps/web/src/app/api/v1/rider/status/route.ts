import { RiderStatusRequestSchema } from "@startup/contracts";
import { RiderRepository } from "@startup/database";
import { apiSuccess } from "@/server/api-response";
import { requireAuth, requireRiderProfile } from "@/server/auth-guard";
import { parseBody, route } from "@/server/route";

export const POST = route(async (req, _ctx, requestId) => {
  const auth = await requireAuth(req);
  const rider = await requireRiderProfile(auth);
  const { isOnline } = await parseBody(req, RiderStatusRequestSchema);
  await RiderRepository.setOnlineStatus(rider.id, isOnline);
  return apiSuccess({ riderId: rider.id, isOnline }, 200, { requestId });
});

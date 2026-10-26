import { DiningEventRepository } from "@startup/database";
import { apiSuccess } from "@/server/api-response";
import { requireAuth } from "@/server/auth-guard";
import { route } from "@/server/route";

export const GET = route(async (req, _ctx, requestId) => {
  const auth = await requireAuth(req);
  const bookings = await DiningEventRepository.listBookings(auth.user.id);
  return apiSuccess({ bookings }, 200, { requestId });
});

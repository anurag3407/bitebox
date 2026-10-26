import { DiningEventRepository } from "@startup/database";
import { apiSuccess } from "@/server/api-response";
import { requireAuth } from "@/server/auth-guard";
import { assertUuid, route } from "@/server/route";

export const POST = route<{ bookingId: string }>(async (req, { params }, requestId) => {
  const auth = await requireAuth(req);
  const booking = await DiningEventRepository.cancel({
    bookingId: assertUuid((await params).bookingId, "booking"),
    userId: auth.user.id,
  });
  return apiSuccess({ booking }, 200, { requestId });
});

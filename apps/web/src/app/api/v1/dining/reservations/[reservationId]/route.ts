import { DiningRepository } from "@startup/database";
import { apiSuccess } from "@/server/api-response";
import { requireAuth } from "@/server/auth-guard";
import { assertUuid, route } from "@/server/route";

export const DELETE = route<{ reservationId: string }>(async (req, { params }, requestId) => {
  const { user } = await requireAuth(req);
  const reservationId = assertUuid((await params).reservationId, "reservation");
  return apiSuccess(await DiningRepository.cancel(user.id, reservationId), 200, { requestId });
});

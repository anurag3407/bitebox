import { BookDiningEventRequestSchema } from "@startup/contracts";
import { DiningEventRepository } from "@startup/database";
import { apiSuccess } from "@/server/api-response";
import { requireAuth } from "@/server/auth-guard";
import { enforceRateLimit } from "@/server/rate-limit";
import { assertUuid, parseBody, route } from "@/server/route";

export const POST = route<{ eventId: string }>(async (req, { params }, requestId) => {
  const auth = await requireAuth(req);
  await enforceRateLimit(req, "checkout", auth.user.id);
  const body = await parseBody(req, BookDiningEventRequestSchema);
  const booking = await DiningEventRepository.book({
    eventId: assertUuid((await params).eventId, "event"),
    userId: auth.user.id,
    quantity: body.quantity,
  });
  return apiSuccess({ booking }, 201, { requestId });
});

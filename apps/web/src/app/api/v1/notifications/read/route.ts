import { z } from "zod";
import { NotificationRepository } from "@startup/database";
import { apiSuccess } from "@/server/api-response";
import { requireAuth } from "@/server/auth-guard";
import { parseBody, route } from "@/server/route";

const ReadSchema = z.object({
  ids: z.array(z.string().uuid()).max(100).optional(),
});

export const POST = route(async (req, _ctx, requestId) => {
  const { user } = await requireAuth(req);
  const { ids } = await parseBody(req, ReadSchema);
  const updated = await NotificationRepository.markRead(user.id, ids);
  return apiSuccess({ updated }, 200, { requestId });
});

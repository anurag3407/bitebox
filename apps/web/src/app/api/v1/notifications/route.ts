import { z } from "zod";
import { NotificationRepository } from "@startup/database";
import { apiSuccess } from "@/server/api-response";
import { requireAuth } from "@/server/auth-guard";
import { parseQuery, route } from "@/server/route";

const QuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(30),
  before: z.string().datetime({ offset: true }).optional(),
});

export const GET = route(async (req, _ctx, requestId) => {
  const { user } = await requireAuth(req);
  const { limit, before } = parseQuery(req, QuerySchema);
  return apiSuccess(await NotificationRepository.listForUser(user.id, { limit, before }), 200, { requestId });
});

import { NotificationPreferencesSchema } from "@startup/contracts";
import { PreferencesRepository } from "@startup/database";
import { apiSuccess } from "@/server/api-response";
import { requireAuth } from "@/server/auth-guard";
import { parseBody, route } from "@/server/route";

export const GET = route(async (req, _ctx, requestId) => {
  const { user } = await requireAuth(req);
  return apiSuccess(await PreferencesRepository.getNotifications(user.id), 200, { requestId });
});

export const PATCH = route(async (req, _ctx, requestId) => {
  const { user } = await requireAuth(req);
  const body = await parseBody(req, NotificationPreferencesSchema);
  return apiSuccess(await PreferencesRepository.updateNotifications(user.id, body), 200, { requestId });
});

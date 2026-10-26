import { PreferencesRepository } from "@startup/database";
import { apiSuccess } from "@/server/api-response";
import { requireAuth } from "@/server/auth-guard";
import { assertUuid, route } from "@/server/route";

export const DELETE = route<{ contactId: string }>(async (req, { params }, requestId) => {
  const { user } = await requireAuth(req);
  const contactId = assertUuid((await params).contactId, "contact");
  await PreferencesRepository.removeContact(user.id, contactId);
  return apiSuccess({ deleted: true }, 200, { requestId });
});

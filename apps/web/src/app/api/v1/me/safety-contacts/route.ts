import { SafetyContactSchema } from "@startup/contracts";
import { PreferencesRepository } from "@startup/database";
import { apiSuccess } from "@/server/api-response";
import { requireAuth } from "@/server/auth-guard";
import { parseBody, route } from "@/server/route";

export const GET = route(async (req, _ctx, requestId) => {
  const { user } = await requireAuth(req);
  return apiSuccess(await PreferencesRepository.listContacts(user.id), 200, { requestId });
});

export const POST = route(async (req, _ctx, requestId) => {
  const { user } = await requireAuth(req);
  const body = await parseBody(req, SafetyContactSchema);
  return apiSuccess(await PreferencesRepository.addContact(user.id, body), 201, { requestId });
});

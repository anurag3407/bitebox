import { PayoutAccountSchema } from "@startup/contracts";
import { getDataEncryptionKey } from "@startup/config";
import { PayoutRepository } from "@startup/database";
import { apiSuccess } from "@/server/api-response";
import { requireAuth, requireRiderProfile } from "@/server/auth-guard";
import { parseBody, route } from "@/server/route";

export const PUT = route(async (req, _ctx, requestId) => {
  const rider = await requireRiderProfile(await requireAuth(req));
  const body = await parseBody(req, PayoutAccountSchema);
  return apiSuccess(await PayoutRepository.saveAccount("RIDER", rider.id, body, getDataEncryptionKey()), 200, { requestId });
});

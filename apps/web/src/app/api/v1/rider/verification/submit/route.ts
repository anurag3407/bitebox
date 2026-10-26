import { SubmitRiderVerificationSchema } from "@startup/contracts";
import { RiderVerificationRepository } from "@startup/database";
import { apiSuccess } from "@/server/api-response";
import { requireAuth, requireRiderProfile } from "@/server/auth-guard";
import { enforceRateLimit } from "@/server/rate-limit";
import { parseBody, route } from "@/server/route";

export const POST = route(async (req, _ctx, requestId) => {
  const auth = await requireAuth(req);
  const rider = await requireRiderProfile(auth);
  await enforceRateLimit(req, "mutation", auth.user.id);
  const { aadhaarLast4 } = await parseBody(req, SubmitRiderVerificationSchema);
  const profile = await RiderVerificationRepository.submit(rider.id, aadhaarLast4);
  return apiSuccess(profile, 200, { requestId });
});

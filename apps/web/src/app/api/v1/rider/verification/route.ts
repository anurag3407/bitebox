import { RiderDocumentUploadSchema } from "@startup/contracts";
import { RiderVerificationRepository } from "@startup/database";
import { apiSuccess } from "@/server/api-response";
import { requireAuth, requireRiderProfile } from "@/server/auth-guard";
import { enforceRateLimit } from "@/server/rate-limit";
import { parseBody, route } from "@/server/route";

export const GET = route(async (req, _ctx, requestId) => {
  const auth = await requireAuth(req);
  const rider = await requireRiderProfile(auth);
  return apiSuccess(await RiderVerificationRepository.getProfile(rider.id), 200, { requestId });
});

export const POST = route(async (req, _ctx, requestId) => {
  const auth = await requireAuth(req);
  const rider = await requireRiderProfile(auth);
  await enforceRateLimit(req, "upload", auth.user.id);
  const { docType, fileUrl } = await parseBody(req, RiderDocumentUploadSchema);
  const profile = await RiderVerificationRepository.upsertDocument(rider.id, docType, fileUrl);
  return apiSuccess(profile, 201, { requestId });
});

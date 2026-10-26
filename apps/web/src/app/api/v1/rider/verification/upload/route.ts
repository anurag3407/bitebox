import { DomainError } from "@startup/core";
import { MAX_IMAGE_BYTES } from "@startup/integrations";
import { apiSuccess } from "@/server/api-response";
import { requireAuth, requireRiderProfile } from "@/server/auth-guard";
import { enforceRateLimit } from "@/server/rate-limit";
import { route } from "@/server/route";
import { storeImage } from "@/server/uploads";

/** Uploads a KYC image; object storage when configured, DB-backed URL otherwise. */
export const POST = route(async (req, _ctx, requestId) => {
  const auth = await requireAuth(req);
  const rider = await requireRiderProfile(auth);
  await enforceRateLimit(req, "upload", auth.user.id);
  const length = Number(req.headers.get("content-length") ?? 0);
  if (length > MAX_IMAGE_BYTES) throw new DomainError("VALIDATION_ERROR", "Images must be 2 MB or smaller");
  const bytes = new Uint8Array(await req.arrayBuffer());
  if (bytes.byteLength === 0) throw new DomainError("VALIDATION_ERROR", "Choose an image to upload");
  const stored = await storeImage(req, auth.user.id, bytes);
  return apiSuccess(stored, 201, { requestId });
});

import { DomainError } from "@startup/core";
import { MAX_IMAGE_BYTES } from "@startup/integrations";
import { apiSuccess } from "@/server/api-response";
import { requireAuth } from "@/server/auth-guard";
import { enforceRateLimit } from "@/server/rate-limit";
import { route } from "@/server/route";
import { storeImage } from "@/server/uploads";

/**
 * Authenticated image upload for customer problem photos and other light surfaces.
 * Object storage is used when configured; otherwise a bounded DB-backed URL keeps
 * local demos fully functional.
 */
export const POST = route(async (req, _ctx, requestId) => {
  const auth = await requireAuth(req);
  await enforceRateLimit(req, "upload", auth.user.id);
  const length = Number(req.headers.get("content-length") ?? 0);
  if (length > MAX_IMAGE_BYTES) throw new DomainError("VALIDATION_ERROR", "Images must be 2 MB or smaller");
  const bytes = new Uint8Array(await req.arrayBuffer());
  if (bytes.byteLength === 0) throw new DomainError("VALIDATION_ERROR", "Choose an image to upload");
  const stored = await storeImage(req, auth.user.id, bytes);
  return apiSuccess(stored, 201, { requestId });
});

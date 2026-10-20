import { DomainError } from "@startup/core";
import { MAX_IMAGE_BYTES, StorageAdapter } from "@startup/integrations";
import { apiSuccess } from "@/server/api-response";
import { StaffPermission } from "@/server/auth-guard";
import { authorizeRestaurant } from "@/server/merchant-catalog";
import { enforceRateLimit } from "@/server/rate-limit";
import { route } from "@/server/route";

/** Uploads a dish/cover photo (raw image body, ≤2 MB, JPEG/PNG/WebP verified by signature). */
export const POST = route<{ restaurantId: string }>(async (req, { params }, requestId) => {
  const { auth, restaurantId } = await authorizeRestaurant(req, params, StaffPermission.EDIT_MENU);
  await enforceRateLimit(req, "upload", auth.user.id);
  const storage = new StorageAdapter();
  if (!storage.isEnabled) throw new DomainError("VALIDATION_ERROR", "Photo uploads are not configured. Paste an image URL instead.");
  const length = Number(req.headers.get("content-length") ?? 0);
  if (length > MAX_IMAGE_BYTES) throw new DomainError("VALIDATION_ERROR", "Images must be 2 MB or smaller");
  const bytes = new Uint8Array(await req.arrayBuffer());
  try {
    return apiSuccess({ url: await storage.uploadImage(restaurantId, bytes) }, 201, { requestId });
  } catch (err) {
    throw new DomainError("VALIDATION_ERROR", (err as Error).message);
  }
});

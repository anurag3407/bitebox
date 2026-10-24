import { SurplusRepository } from "@startup/database";
import { apiSuccess } from "@/server/api-response";
import { requireAuth } from "@/server/auth-guard";
import { assertUuid, route } from "@/server/route";

export const POST = route<{ listingId: string }>(async (req, { params }, requestId) => {
  const auth = await requireAuth(req);
  const listingId = assertUuid((await params).listingId, "surplus listing");
  const result = await SurplusRepository.reserveListing({ listingId, userId: auth.user.id });
  return apiSuccess({ listingId, ...result }, 200, { requestId });
});

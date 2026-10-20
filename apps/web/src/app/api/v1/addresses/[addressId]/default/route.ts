import { AddressRepository } from "@startup/database";
import { apiSuccess } from "@/server/api-response";
import { requireAuth } from "@/server/auth-guard";
import { assertUuid, route } from "@/server/route";

export const POST = route<{ addressId: string }>(async (req, { params }, requestId) => {
  const { user } = await requireAuth(req);
  const addressId = assertUuid((await params).addressId, "address");
  await AddressRepository.setDefault(user.id, addressId);
  return apiSuccess({ success: true }, 200, { requestId });
});

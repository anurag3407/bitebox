import { CreateAddressRequestSchema } from "@startup/contracts";
import { AddressRepository } from "@startup/database";
import { apiSuccess } from "@/server/api-response";
import { requireAuth } from "@/server/auth-guard";
import { assertUuid, parseBody, route } from "@/server/route";

export const PATCH = route<{ addressId: string }>(async (req, { params }, requestId) => {
  const { user } = await requireAuth(req);
  const addressId = assertUuid((await params).addressId, "address");
  const body = await parseBody(req, CreateAddressRequestSchema);
  return apiSuccess(await AddressRepository.update(user.id, addressId, body), 200, { requestId });
});

export const DELETE = route<{ addressId: string }>(async (req, { params }, requestId) => {
  const { user } = await requireAuth(req);
  const addressId = assertUuid((await params).addressId, "address");
  await AddressRepository.delete(user.id, addressId);
  return apiSuccess({ success: true }, 200, { requestId });
});

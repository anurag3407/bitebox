import { CreateAddressRequestSchema } from "@startup/contracts";
import { AddressRepository } from "@startup/database";
import { apiSuccess } from "@/server/api-response";
import { requireAuth } from "@/server/auth-guard";
import { enforceRateLimit } from "@/server/rate-limit";
import { parseBody, route } from "@/server/route";

export const GET = route(async (req, _ctx, requestId) => {
  const { user } = await requireAuth(req);
  return apiSuccess(await AddressRepository.listByUser(user.id), 200, { requestId });
});

export const POST = route(async (req, _ctx, requestId) => {
  const { user } = await requireAuth(req);
  await enforceRateLimit(req, "mutation", user.id);
  const body = await parseBody(req, CreateAddressRequestSchema);
  return apiSuccess(await AddressRepository.create(user.id, body), 201, { requestId });
});

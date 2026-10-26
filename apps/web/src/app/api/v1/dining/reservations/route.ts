import { DiningReservationRequestSchema } from "@startup/contracts";
import { DiningRepository } from "@startup/database";
import { apiSuccess } from "@/server/api-response";
import { requireAuth } from "@/server/auth-guard";
import { enforceRateLimit } from "@/server/rate-limit";
import { parseBody, route } from "@/server/route";

export const GET = route(async (req, _ctx, requestId) => {
  const { user } = await requireAuth(req);
  return apiSuccess(await DiningRepository.listForCustomer(user.id), 200, { requestId });
});

export const POST = route(async (req, _ctx, requestId) => {
  const { user } = await requireAuth(req);
  await enforceRateLimit(req, "mutation", user.id);
  const body = await parseBody(req, DiningReservationRequestSchema);
  return apiSuccess(await DiningRepository.createReservation(user.id, body), 201, { requestId });
});

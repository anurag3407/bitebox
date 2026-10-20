import { MerchantApplicationSchema, RiderApplicationSchema, z } from "@startup/contracts";
import { PartnerRepository } from "@startup/database";
import { apiSuccess } from "@/server/api-response";
import { requireAuth } from "@/server/auth-guard";
import { enforceRateLimit } from "@/server/rate-limit";
import { parseBody, route } from "@/server/route";

const ApplicationSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("MERCHANT"), details: MerchantApplicationSchema }),
  z.object({ type: z.literal("RIDER"), details: RiderApplicationSchema }),
]);

export const GET = route(async (req, _ctx, requestId) => {
  const { user } = await requireAuth(req);
  return apiSuccess(await PartnerRepository.listForUser(user.id), 200, { requestId });
});

export const POST = route(async (req, _ctx, requestId) => {
  const { user } = await requireAuth(req);
  await enforceRateLimit(req, "partnerApplication", user.id);
  const body = await parseBody(req, ApplicationSchema);
  return apiSuccess(await PartnerRepository.submit(user.id, body.type, body.details), 201, { requestId });
});

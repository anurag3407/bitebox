import { DeliveryProofSchema } from "@startup/contracts";
import { OrderExperienceRepository } from "@startup/database";
import { apiSuccess } from "@/server/api-response";
import { requireAuth, requireRiderProfile } from "@/server/auth-guard";
import { enforceRateLimit } from "@/server/rate-limit";
import { parseBody, parseQuery, route } from "@/server/route";
import { z } from "zod";

const QuerySchema = z.object({ orderId: z.string().uuid() });

export const POST = route(async (req, _ctx, requestId) => {
  const auth = await requireAuth(req);
  const rider = await requireRiderProfile(auth);
  await enforceRateLimit(req, "upload", auth.user.id);
  const { orderId } = parseQuery(req, QuerySchema);
  const body = await parseBody(req, DeliveryProofSchema);
  const proof = await OrderExperienceRepository.saveProof({ orderId, riderId: rider.id, ...body });
  return apiSuccess(proof, 201, { requestId });
});

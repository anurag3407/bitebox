import { z } from "zod";
import { PushSubscriptionRequestSchema } from "@startup/contracts";
import { PushSubscriptionRepository } from "@startup/database";
import { apiSuccess } from "@/server/api-response";
import { requireAuth } from "@/server/auth-guard";
import { enforceRateLimit } from "@/server/rate-limit";
import { parseBody, route } from "@/server/route";

export const POST = route(async (req, _ctx, requestId) => {
  const { user } = await requireAuth(req);
  await enforceRateLimit(req, "mutation", user.id);
  const subscription = await parseBody(req, PushSubscriptionRequestSchema);
  await PushSubscriptionRepository.upsert(user.id, subscription, req.headers.get("user-agent") ?? undefined);
  return apiSuccess({ subscribed: true }, 201, { requestId });
});

export const DELETE = route(async (req, _ctx, requestId) => {
  const { user } = await requireAuth(req);
  const { endpoint } = await parseBody(req, z.object({ endpoint: z.string().url() }));
  await PushSubscriptionRepository.remove(user.id, endpoint);
  return apiSuccess({ subscribed: false }, 200, { requestId });
});

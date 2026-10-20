import { z } from "zod";
import { FulfillmentState, UserRole } from "@startup/contracts";
import { OrderRepository } from "@startup/database";
import { apiSuccess } from "@/server/api-response";
import { requireAuth } from "@/server/auth-guard";
import { parseQuery, route } from "@/server/route";

const QuerySchema = z.object({
  state: z.nativeEnum(FulfillmentState).optional(),
  stuck: z.enum(["true", "false"]).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export const GET = route(async (req, _ctx, requestId) => {
  await requireAuth(req, [UserRole.ADMIN]);
  const q = parseQuery(req, QuerySchema);
  const orders = await OrderRepository.listForAdmin({
    states: q.state ? [q.state] : undefined,
    stuckOnly: q.stuck === "true",
    limit: q.limit,
  });
  return apiSuccess(orders, 200, { requestId });
});

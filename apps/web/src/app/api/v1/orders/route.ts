import { z } from "zod";
import { OrderRepository } from "@startup/database";
import { apiSuccess } from "@/server/api-response";
import { requireAuth } from "@/server/auth-guard";
import { parseQuery, route } from "@/server/route";

const QuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  // Cursor: createdAt of the last order on the previous page
  before: z.string().datetime().optional(),
});

export const GET = route(async (req, _ctx, requestId) => {
  const auth = await requireAuth(req);
  const { limit, before } = parseQuery(req, QuerySchema);
  const orders = await OrderRepository.listByCustomer(auth.user.id, {
    limit,
    before: before ? new Date(before) : undefined,
  });
  const last = orders[orders.length - 1];
  return apiSuccess(orders, 200, {
    requestId,
    headers: orders.length === limit && last ? { "x-next-cursor": last.createdAt } : {},
  });
});

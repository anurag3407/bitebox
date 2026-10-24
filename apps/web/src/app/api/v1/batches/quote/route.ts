import { z } from "zod";
import { BatchRepository } from "@startup/database";
import { apiSuccess } from "@/server/api-response";
import { requireAuth } from "@/server/auth-guard";
import { parseQuery, route } from "@/server/route";

const Query = z.object({
  dropPointId: z.string().uuid(),
  slotWindow: z.string().min(3),
  express: z.enum(["true", "false"]).optional(),
});

export const GET = route(async (req, _ctx, requestId) => {
  await requireAuth(req);
  const query = parseQuery(req, Query);
  const quote = await BatchRepository.quoteSlot({
    dropPointId: query.dropPointId,
    slotWindow: query.slotWindow,
    isExpressPointToPoint: query.express === "true",
  });
  return apiSuccess(quote, 200, { requestId });
});

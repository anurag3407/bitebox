import { z } from "zod";
import { GiftCardRepository } from "@startup/database";
import { apiSuccess } from "@/server/api-response";
import { requireAuth } from "@/server/auth-guard";
import { parseBody, route } from "@/server/route";

const Redeem = z.object({ code: z.string().trim().min(4).max(20) });

export const POST = route(async (req, _ctx, requestId) => {
  const auth = await requireAuth(req);
  const body = await parseBody(req, Redeem);
  const result = await GiftCardRepository.redeem({ userId: auth.user.id, code: body.code });
  return apiSuccess(result, 200, { requestId });
});

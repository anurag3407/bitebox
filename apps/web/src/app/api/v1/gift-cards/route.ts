import { z } from "zod";
import { GiftCardRepository } from "@startup/database";
import { apiSuccess } from "@/server/api-response";
import { requireAuth } from "@/server/auth-guard";
import { parseBody, route } from "@/server/route";

const Purchase = z.object({
  amountPaise: z.number().int().min(10000).max(1000000),
  recipientName: z.string().trim().min(2).max(80),
  recipientContact: z.string().trim().max(120).optional(),
  message: z.string().trim().max(200).optional(),
});

export const GET = route(async (req, _ctx, requestId) => {
  const auth = await requireAuth(req);
  const cards = await GiftCardRepository.listForUser(auth.user.id);
  return apiSuccess({ cards }, 200, { requestId });
});

export const POST = route(async (req, _ctx, requestId) => {
  const auth = await requireAuth(req);
  const body = await parseBody(req, Purchase);
  const card = await GiftCardRepository.purchase({ purchaserId: auth.user.id, ...body });
  return apiSuccess({ card }, 201, { requestId });
});

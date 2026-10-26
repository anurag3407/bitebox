import { z } from "zod";
import { SplitBillRepository } from "@startup/database";
import { apiSuccess } from "@/server/api-response";
import { requireAuth } from "@/server/auth-guard";
import { assertUuid, parseBody, route } from "@/server/route";

const Create = z.object({ parts: z.number().int().min(2).max(10) });

export const GET = route<{ orderId: string }>(async (req, { params }, requestId) => {
  const auth = await requireAuth(req);
  const orderId = assertUuid((await params).orderId, "order");
  const split = await SplitBillRepository.forOrder(orderId, auth.user.id);
  return apiSuccess({ split }, 200, { requestId });
});

export const POST = route<{ orderId: string }>(async (req, { params }, requestId) => {
  const auth = await requireAuth(req);
  const orderId = assertUuid((await params).orderId, "order");
  const body = await parseBody(req, Create);
  const split = await SplitBillRepository.create({ orderId, hostId: auth.user.id, parts: body.parts });
  return apiSuccess({ split }, 201, { requestId });
});

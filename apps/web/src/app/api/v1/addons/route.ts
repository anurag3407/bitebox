import { z } from "zod";
import { AddonRepository } from "@startup/database";
import { apiSuccess } from "@/server/api-response";
import { requireAuth } from "@/server/auth-guard";
import { parseBody, route } from "@/server/route";

const AppendAddon = z.object({
  parentOrderId: z.string().uuid(),
  addonSkuId: z.string().uuid(),
  quantity: z.number().int().min(1).max(5).optional(),
});

export const POST = route(async (req, _ctx, requestId) => {
  const auth = await requireAuth(req);
  const body = await parseBody(req, AppendAddon);
  const result = await AddonRepository.appendOneTapAddon({
    parentOrderId: body.parentOrderId,
    addonSkuId: body.addonSkuId,
    customerId: auth.user.id,
    quantity: body.quantity,
  });
  return apiSuccess(
    {
      orderId: result.order.id,
      orderNumber: result.order.order_number,
      parentOrderId: body.parentOrderId,
      bagLabel: result.bagLabel,
      payablePaise: result.price.payablePaise,
      grossMarginPaise: result.price.grossMarginPaise,
    },
    201,
    { requestId }
  );
});

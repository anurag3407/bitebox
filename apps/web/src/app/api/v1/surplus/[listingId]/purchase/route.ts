import { z } from "zod";
import { SurplusRepository } from "@startup/database";
import { apiSuccess } from "@/server/api-response";
import { requireAuth } from "@/server/auth-guard";
import { assertUuid, parseBody, route } from "@/server/route";

const Purchase = z.object({ addressId: z.string().uuid().optional() });

export const POST = route<{ listingId: string }>(async (req, { params }, requestId) => {
  const auth = await requireAuth(req);
  const listingId = assertUuid((await params).listingId, "surplus listing");
  const body = await parseBody(req, Purchase);
  const result = await SurplusRepository.purchaseListing({
    listingId,
    userId: auth.user.id,
    addressId: body.addressId,
  });
  return apiSuccess(
    {
      orderId: result.order.id,
      orderNumber: result.order.order_number,
      payablePaise: result.order.payable_paise,
      listingId: result.listingId,
      restoredPassCredit: result.restoredPassCredit,
      simulatedPayment: true,
    },
    201,
    { requestId }
  );
});

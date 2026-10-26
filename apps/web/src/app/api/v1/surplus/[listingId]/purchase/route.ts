import { z } from "zod";
import { DomainError } from "@startup/core";
import { SurplusRepository, WalletRepository } from "@startup/database";
import { apiSuccess } from "@/server/api-response";
import { requireAuth } from "@/server/auth-guard";
import { assertUuid, parseBody, route } from "@/server/route";

const Purchase = z.object({ addressId: z.string().uuid().optional() });

export const POST = route<{ listingId: string }>(async (req, { params }, requestId) => {
  const auth = await requireAuth(req);
  const listingId = assertUuid((await params).listingId, "surplus listing");
  const body = await parseBody(req, Purchase);
  // Give a clear "not enough credits" error before touching stock
  const wallet = await WalletRepository.getOrCreate(auth.user.id);
  const listing = (await SurplusRepository.listActive()).find((l) => l.id === listingId);
  if (!listing) throw new DomainError("NOT_FOUND", "This rescue bag is no longer available");
  if (wallet.balancePaise < listing.sale_price_paise) {
    throw new DomainError("PAYMENT_FAILED", "Not enough BiteBox Credits for this rescue bag.", {
      details: { balancePaise: wallet.balancePaise, requiredPaise: listing.sale_price_paise },
    });
  }
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
      paymentMethod: "WALLET",
    },
    201,
    { requestId }
  );
});

import { VerifyMembershipPaymentSchema } from "@startup/contracts";
import { DomainError } from "@startup/core";
import { LoyaltyRepository } from "@startup/database";
import { ProviderUnavailableError, RazorpayAdapter } from "@startup/integrations";
import { apiSuccess } from "@/server/api-response";
import { requireAuth } from "@/server/auth-guard";
import { enforceRateLimit } from "@/server/rate-limit";
import { parseBody, route } from "@/server/route";

export const POST = route(async (req, _ctx, requestId) => {
  const { user } = await requireAuth(req);
  await enforceRateLimit(req, "paymentVerify", user.id);
  const body = await parseBody(req, VerifyMembershipPaymentSchema);
  const purchase = await LoyaltyRepository.findPurchase(body.purchaseId);
  if (!purchase || purchase.user_id !== user.id) throw new DomainError("NOT_FOUND", "Membership purchase not found");
  if (purchase.razorpay_order_id !== body.razorpayOrderId) {
    throw new DomainError("VALIDATION_ERROR", "Payment does not belong to this purchase");
  }

  const razorpay = new RazorpayAdapter();
  const valid = razorpay.verifyPaymentSignature({
    orderId: purchase.razorpay_order_id as string,
    paymentId: body.razorpayPaymentId,
    signature: body.razorpaySignature,
  });
  if (!valid) throw new DomainError("PAYMENT_FAILED", "We could not verify this payment.");

  if (!razorpay.isMock) {
    try {
      let payment = await razorpay.fetchPayment(body.razorpayPaymentId);
      if (payment.orderId !== purchase.razorpay_order_id) {
        throw new DomainError("VALIDATION_ERROR", "Payment does not belong to this purchase");
      }
      if (payment.status === "authorized") {
        payment = await razorpay.capturePayment(body.razorpayPaymentId, payment.amountPaise, payment.currency);
      }
      if (payment.status !== "captured" || payment.amountPaise !== purchase.amount_paise) {
        throw new DomainError("PAYMENT_FAILED", "Payment has not completed for the right amount.");
      }
    } catch (err) {
      if (err instanceof ProviderUnavailableError) {
        return apiSuccess({ success: true, status: "CONFIRMING" }, 202, { requestId });
      }
      throw err;
    }
  }

  const result = await LoyaltyRepository.completePurchase({
    purchaseId: purchase.id,
    userId: user.id,
    providerPaymentId: body.razorpayPaymentId,
  });
  const membership = await LoyaltyRepository.getActive(user.id);
  return apiSuccess(
    { success: true, alreadyProcessed: result.alreadyProcessed, membership },
    200,
    { requestId }
  );
});

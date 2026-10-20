import { VerifyPaymentRequestSchema } from "@startup/contracts";
import { DomainError } from "@startup/core";
import { OrderRepository, getDb, paymentAttempts } from "@startup/database";
import { ProviderUnavailableError, RazorpayAdapter } from "@startup/integrations";
import { and, eq } from "drizzle-orm";
import { apiSuccess } from "@/server/api-response";
import { requireAuth } from "@/server/auth-guard";
import { enforceRateLimit } from "@/server/rate-limit";
import { parseBody, route } from "@/server/route";

export const POST = route(async (req, _ctx, requestId) => {
  const auth = await requireAuth(req);
  await enforceRateLimit(req, "paymentVerify", auth.user.id);
  const { orderId, razorpayPaymentId, razorpayOrderId, razorpaySignature } = await parseBody(
    req,
    VerifyPaymentRequestSchema
  );

  // 1. Only the order's customer may confirm its payment
  const access = await OrderRepository.findAccessContext(orderId);
  if (!access || access.customerId !== auth.user.id) throw new DomainError("NOT_FOUND", "Order not found");

  // 2. The provider order must be one we created for this order
  const [attempt] = await getDb()
    .select()
    .from(paymentAttempts)
    .where(and(eq(paymentAttempts.orderId, orderId), eq(paymentAttempts.razorpayOrderId, razorpayOrderId)))
    .limit(1);
  if (!attempt) throw new DomainError("VALIDATION_ERROR", "Payment does not belong to this order");

  // 3. Signature proves the callback came from Razorpay checkout for this provider order
  const razorpay = new RazorpayAdapter();
  const isValid = razorpay.verifyPaymentSignature({
    orderId: attempt.razorpayOrderId,
    paymentId: razorpayPaymentId,
    signature: razorpaySignature,
  });
  if (!isValid) throw new DomainError("PAYMENT_FAILED", "We could not verify this payment. If money was debited it will be refunded automatically.");

  // 4. Confirm the money actually moved (status + amount) before releasing the order to the kitchen
  let amountPaise = attempt.amountPaise;
  let currency = attempt.currency;
  if (!razorpay.isMock) {
    try {
      let payment = await razorpay.fetchPayment(razorpayPaymentId);
      if (payment.orderId !== attempt.razorpayOrderId) {
        throw new DomainError("VALIDATION_ERROR", "Payment does not belong to this order");
      }
      if (payment.status === "authorized") {
        payment = await razorpay.capturePayment(razorpayPaymentId, payment.amountPaise, payment.currency);
      }
      if (payment.status !== "captured") {
        throw new DomainError("PAYMENT_FAILED", "Payment has not completed. Please retry.");
      }
      amountPaise = payment.amountPaise;
      currency = payment.currency;
    } catch (err) {
      if (err instanceof ProviderUnavailableError) {
        // Outcome unknown: the webhook / payment reconciler will finalize it
        return apiSuccess({ success: true, orderId, status: "CONFIRMING", fulfillmentState: "PENDING_PAYMENT" }, 202, {
          requestId,
        });
      }
      throw err;
    }
  }

  const { outcome } = await OrderRepository.recordPaymentCapture({
    orderId,
    providerPaymentId: razorpayPaymentId,
    amountPaise,
    currency,
    paymentAttemptId: attempt.id,
  });

  const order = await OrderRepository.findById(orderId);
  return apiSuccess(
    {
      success: outcome === "CAPTURED" || outcome === "ALREADY_RECORDED",
      outcome,
      orderId,
      status: order?.paymentStatus,
      fulfillmentState: order?.fulfillmentState,
    },
    200,
    { requestId }
  );
});

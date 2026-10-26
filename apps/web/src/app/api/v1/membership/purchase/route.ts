import { randomUUID } from "node:crypto";
import { PurchaseMembershipSchema } from "@startup/contracts";
import { DomainError } from "@startup/core";
import { LoyaltyRepository } from "@startup/database";
import { ProviderUnavailableError, RazorpayAdapter } from "@startup/integrations";
import { getRazorpayKeyId } from "@startup/config";
import { apiSuccess } from "@/server/api-response";
import { requireAuth } from "@/server/auth-guard";
import { enforceRateLimit } from "@/server/rate-limit";
import { parseBody, route } from "@/server/route";

export const POST = route(async (req, _ctx, requestId) => {
  const { user } = await requireAuth(req);
  await enforceRateLimit(req, "checkout", user.id);
  const { planId } = await parseBody(req, PurchaseMembershipSchema);
  const plan = await LoyaltyRepository.findPlan(planId);
  if (!plan) throw new DomainError("NOT_FOUND", "Membership plan not found");
  if (plan.pricePaise <= 0) throw new DomainError("VALIDATION_ERROR", "This plan is earned, not purchased.");

  const razorpay = new RazorpayAdapter();
  let order;
  try {
    order = await razorpay.createOrder({
      amountPaise: plan.pricePaise,
      currency: "INR",
      receipt: `gold_${randomUUID().slice(0, 20)}`,
      notes: { userId: user.id, plan: plan.code },
    });
  } catch (err) {
    if (err instanceof ProviderUnavailableError) {
      throw new DomainError("PAYMENT_FAILED", "Payments are temporarily unavailable. Please try again in a minute.", {
        httpStatus: 503,
      });
    }
    throw err;
  }
  const purchase = await LoyaltyRepository.createPurchase({
    userId: user.id,
    planId: plan.id,
    razorpayOrderId: order.id,
    amountPaise: plan.pricePaise,
  });
  return apiSuccess(
    {
      purchaseId: purchase.id,
      razorpayOrderId: order.id,
      razorpayKeyId: getRazorpayKeyId(),
      amountPaise: plan.pricePaise,
      simulatedPayment: razorpay.isMock,
    },
    201,
    { requestId }
  );
});

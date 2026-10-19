import { NextRequest } from "next/server";
import { CreateCheckoutRequestSchema } from "@startup/contracts";
import { OrderFundingGuard, generateOrderNumber, generateVerificationOtp } from "@startup/core";
import {
  AddressRepository,
  OrderRepository,
  getDb,
  quotes,
} from "@startup/database";
import { RazorpayAdapter } from "@startup/integrations";
import { getClientEnv } from "@startup/config";
import { apiError, apiSuccess } from "@/server/api-response";
import { getAuthenticatedActor, getOrCreateDbUser } from "@/server/auth-guard";
import { eq } from "drizzle-orm";

export async function POST(req: NextRequest) {
  try {
    const actor = await getAuthenticatedActor(req);
    if (!actor) {
      return apiError("UNAUTHENTICATED", "Authentication required to checkout", 401);
    }

    const body = await req.json();
    const parsed = CreateCheckoutRequestSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("VALIDATION_ERROR", "Invalid checkout request", 400, parsed.error.format());
    }

    const { quoteId, deliveryAddressId, instructions, idempotencyKey } = parsed.data;

    const user = await getOrCreateDbUser(actor);

    // 1. Fetch and validate quote
    const db = getDb();
    const [quote] = await db.select().from(quotes).where(eq(quotes.id, quoteId)).limit(1);

    if (!quote) {
      return apiError("NOT_FOUND", "Quote not found", 404);
    }

    if (quote.customerId !== user.id) {
      return apiError("FORBIDDEN", "You do not have permission to checkout this quote", 403);
    }

    if (quote.expiresAt.getTime() < Date.now()) {
      return apiError("QUOTE_EXPIRED", "Your quote has expired. Please refresh prices before placing order.", 409);
    }

    // 2. Validate address ownership
    const address = await AddressRepository.findById(deliveryAddressId);
    if (!address) {
      return apiError("NOT_FOUND", "Delivery address not found", 404);
    }

    if (address.userId !== user.id) {
      return apiError("FORBIDDEN", "Delivery address does not belong to you", 403);
    }

    const breakdown: any = quote.breakdownJson;
    const items: any = quote.itemsJson;
    const requestHash = `${quoteId}_${deliveryAddressId}_${breakdown.payablePaise}`;

    // 3. Order-level funding guard: check if an order already exists for this quote
    const existingOrder = await OrderRepository.findOrderByQuote(quoteId);
    if (existingOrder) {
      const guardResult = OrderFundingGuard.evaluateCanCreateAttempt({
        orderFulfillmentState: existingOrder.fulfillmentState,
        orderPaymentStatus: existingOrder.paymentStatus as any,
        existingAttemptId: existingOrder.paymentAttemptId,
        existingAttemptStatus: existingOrder.attemptStatus as any,
        capturedAmountPaise: existingOrder.paymentStatus === "CAPTURED" ? existingOrder.payablePaise : 0,
        orderPayablePaise: existingOrder.payablePaise,
      });

      if (guardResult.action === "REJECT_ALREADY_PAID") {
        return apiError("STATE_CONFLICT", "This quote has already been funded and paid", 409);
      }

      if (guardResult.action === "REJECT_TERMINAL") {
        return apiError("STATE_CONFLICT", "The order for this quote has been cancelled", 409);
      }

      if (guardResult.action === "REUSE_EXISTING" && existingOrder.razorpayOrderId) {
        const clientEnv = getClientEnv();
        return apiSuccess({
          orderId: existingOrder.id,
          orderNumber: existingOrder.orderNumber,
          paymentAttemptId: existingOrder.paymentAttemptId,
          razorpayOrderId: existingOrder.razorpayOrderId,
          razorpayKeyId: clientEnv.NEXT_PUBLIC_RAZORPAY_KEY_ID,
          amountPaise: existingOrder.payablePaise,
          currency: "INR",
          isDuplicate: true,
        }, 200);
      }
    }

    // 4. Create Razorpay order
    const razorpayAdapter = new RazorpayAdapter();
    const orderNumber = generateOrderNumber();
    const rzpOrder = await razorpayAdapter.createOrder({
      amountPaise: breakdown.payablePaise,
      currency: "INR",
      receipt: orderNumber,
      notes: { quoteId, customerId: user.id },
    });

    // 5. Create Order Transactionally with Idempotency
    const deliveryOtp = generateVerificationOtp();
    const pickupOtp = generateVerificationOtp();

    const orderResult = await OrderRepository.createWithIdempotency({
      idempotencyKey,
      principalId: user.id,
      requestHash,
      customerId: user.id,
      restaurantId: quote.restaurantId,
      deliveryAddressId,
      orderNumber,
      items,
      breakdown,
      payablePaise: breakdown.payablePaise,
      deliveryOtp,
      pickupOtp,
      instructions,
      estimatedDeliveryMinutes: quote.estimatedMaxMinutes,
      razorpayOrderId: rzpOrder.id,
      quoteId,
    });

    const clientEnv = getClientEnv();

    return apiSuccess({
      orderId: orderResult.orderId,
      orderNumber: orderResult.orderNumber,
      paymentAttemptId: orderResult.paymentAttemptId,
      razorpayOrderId: orderResult.razorpayOrderId,
      razorpayKeyId: clientEnv.NEXT_PUBLIC_RAZORPAY_KEY_ID,
      amountPaise: breakdown.payablePaise,
      currency: "INR",
      isDuplicate: orderResult.isDuplicate,
    }, 201);
  } catch (err: any) {
    return apiError("INTERNAL_ERROR", err.message || "Failed to create checkout", 500);
  }
}

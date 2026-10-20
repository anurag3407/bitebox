import { createHash } from "node:crypto";
import { CheckoutResponse, CreateCheckoutRequestSchema, QuoteBreakdown, QuoteLineBreakdown } from "@startup/contracts";
import { DomainError, ServiceabilityPolicy, generateOrderNumber, generateVerificationOtp } from "@startup/core";
import {
  AddressRepository,
  CheckoutResult,
  OrderRepository,
  RestaurantRepository,
  evaluateAvailability,
  getDb,
  quotes,
} from "@startup/database";
import { ProviderUnavailableError, RazorpayAdapter } from "@startup/integrations";
import { getRazorpayKeyId } from "@startup/config";
import { eq } from "drizzle-orm";
import { apiSuccess } from "@/server/api-response";
import { requireAuth } from "@/server/auth-guard";
import { enforceRateLimit } from "@/server/rate-limit";
import { parseBody, route } from "@/server/route";

// A quote priced for map coordinates may be checked out to a saved address this close by
const MAX_ADDRESS_DRIFT_METERS = 300;

function toResponse(result: CheckoutResult, simulatedPayment: boolean): CheckoutResponse {
  return {
    orderId: result.orderId,
    orderNumber: result.orderNumber,
    paymentAttemptId: result.paymentAttemptId,
    razorpayOrderId: result.razorpayOrderId,
    razorpayKeyId: getRazorpayKeyId(),
    amountPaise: result.payablePaise,
    currency: "INR",
    isDuplicate: result.isDuplicate,
    simulatedPayment,
  };
}

export const POST = route(async (req, _ctx, requestId) => {
  const auth = await requireAuth(req);
  await enforceRateLimit(req, "checkout", auth.user.id);
  const { quoteId, deliveryAddressId, instructions, idempotencyKey } = await parseBody(req, CreateCheckoutRequestSchema);
  const razorpay = new RazorpayAdapter();

  const requestHash = createHash("sha256")
    .update(JSON.stringify({ quoteId, deliveryAddressId, instructions: instructions ?? "" }))
    .digest("hex");

  // 1. Replayed request (double tap, network retry): answer without touching the gateway
  const replay = await OrderRepository.findCompletedCheckout(auth.user.id, idempotencyKey, requestHash);
  if (replay) return apiSuccess(toResponse(replay, razorpay.isMock), 200, { requestId });

  // 2. The quote is the price contract
  const [quote] = await getDb().select().from(quotes).where(eq(quotes.id, quoteId)).limit(1);
  if (!quote || quote.customerId !== auth.user.id) throw new DomainError("NOT_FOUND", "Quote not found");

  // 3. Address must be the customer's and match what was priced
  const address = await AddressRepository.findById(deliveryAddressId);
  if (!address || address.userId !== auth.user.id || address.isDeleted) {
    throw new DomainError("NOT_FOUND", "Delivery address not found");
  }
  const pricedForOtherAddress = quote.deliveryAddressId
    ? quote.deliveryAddressId !== deliveryAddressId
    : quote.destinationLatitude === null ||
      ServiceabilityPolicy.calculateDistanceMeters(
        { latitude: quote.destinationLatitude, longitude: quote.destinationLongitude! },
        { latitude: address.latitude, longitude: address.longitude }
      ) > MAX_ADDRESS_DRIFT_METERS;
  if (pricedForOtherAddress) {
    throw new DomainError("QUOTE_EXPIRED", "Your delivery address changed. Please review the updated bill.");
  }

  // 4. One order per quote: a retry after a failed/cancelled payment window reuses the pending order
  const existingOrder = await OrderRepository.findOrderByQuote(quoteId);
  if (existingOrder) {
    if (existingOrder.paymentStatus !== "PENDING") {
      throw new DomainError("STATE_CONFLICT", "This order has already been paid.");
    }
    if (existingOrder.fulfillmentState !== "PENDING_PAYMENT") {
      throw new DomainError("QUOTE_EXPIRED", "This checkout has expired. Please review your cart and try again.");
    }
    if (existingOrder.razorpayOrderId && existingOrder.paymentAttemptId) {
      return apiSuccess(
        toResponse(
          {
            orderId: existingOrder.id,
            orderNumber: existingOrder.orderNumber,
            paymentAttemptId: existingOrder.paymentAttemptId,
            razorpayOrderId: existingOrder.razorpayOrderId,
            payablePaise: existingOrder.payablePaise,
            isDuplicate: true,
          },
          razorpay.isMock
        ),
        200,
        { requestId }
      );
    }
  }

  if (quote.expiresAt.getTime() < Date.now()) {
    throw new DomainError("QUOTE_EXPIRED", "Prices may have changed. Please review the updated bill.");
  }

  // 5. Restaurant may have closed or paused since the quote
  const restaurant = await RestaurantRepository.findById(quote.restaurantId);
  if (!restaurant || !evaluateAvailability(restaurant).isAcceptingOrders) {
    throw new DomainError("SERVICEABILITY_ERROR", "This restaurant has stopped accepting orders. Please try again later.");
  }

  const breakdown = quote.breakdownJson as QuoteBreakdown;
  const items = quote.itemsJson as QuoteLineBreakdown[];

  // 6. Gateway order first (external, cannot join our transaction). If the DB write
  // below fails the provider order is simply never paid and expires.
  let razorpayOrderId: string;
  let orderNumber = generateOrderNumber();
  try {
    const rzpOrder = await razorpay.createOrder({
      amountPaise: breakdown.payablePaise,
      currency: "INR",
      receipt: orderNumber,
      notes: { quoteId, customerId: auth.user.id },
    });
    razorpayOrderId = rzpOrder.id;
  } catch (err) {
    if (err instanceof ProviderUnavailableError) {
      throw new DomainError("PAYMENT_FAILED", "Payments are temporarily unavailable. Please try again in a minute.", {
        httpStatus: 503,
      });
    }
    throw err;
  }

  // 7. Persist atomically; retry the rare order-number collision with a fresh number
  for (let attempt = 0; ; attempt++) {
    try {
      const result = await OrderRepository.createWithIdempotency({
        idempotencyKey,
        principalId: auth.user.id,
        requestHash,
        customerId: auth.user.id,
        restaurantId: quote.restaurantId,
        deliveryAddressId,
        orderNumber,
        items,
        breakdown,
        payablePaise: breakdown.payablePaise,
        deliveryOtp: generateVerificationOtp(4),
        pickupOtp: generateVerificationOtp(4),
        instructions,
        estimatedDeliveryMinutes: quote.estimatedMaxMinutes,
        razorpayOrderId,
        quoteId,
        couponCode: quote.couponCode ?? undefined,
        deliveryAddressSnapshot: {
          label: address.label,
          building: address.building,
          street: address.street,
          landmark: address.landmark,
          latitude: address.latitude,
          longitude: address.longitude,
          contactPhone: address.contactPhone ?? auth.user.phone ?? undefined,
        },
      });
      return apiSuccess(toResponse(result, razorpay.isMock), result.isDuplicate ? 200 : 201, { requestId });
    } catch (err) {
      if (err instanceof DomainError && err.message === "ORDER_NUMBER_COLLISION" && attempt < 3) {
        orderNumber = generateOrderNumber();
        continue;
      }
      throw err;
    }
  }
});

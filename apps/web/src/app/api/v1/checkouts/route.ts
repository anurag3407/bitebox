import { createHash } from "node:crypto";
import {
  CheckoutResponse,
  CreateCheckoutRequestSchema,
  OrderMode,
  PaymentMethod,
  PaymentStatus,
  QuoteBreakdown,
  QuoteLineBreakdown,
} from "@startup/contracts";
import {
  DomainError,
  ServiceabilityPolicy,
  SettlementCalculator,
  generateOrderNumber,
  generateVerificationOtp,
  hashAttributionToken,
} from "@startup/core";
import {
  AddressRepository,
  AttributionRepository,
  CheckoutResult,
  CouponRepository,
  OrderRepository,
  RestaurantRepository,
  WalletRepository,
  evaluateAvailability,
  getDb,
  getDbPool,
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

function cookieValue(header: string | null, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return undefined;
}

function toResponse(result: CheckoutResult, simulatedPayment: boolean): CheckoutResponse {
  return {
    orderId: result.orderId,
    orderNumber: result.orderNumber,
    paymentAttemptId: result.paymentAttemptId,
    razorpayOrderId: result.razorpayOrderId,
    razorpayKeyId: result.paymentMethod === PaymentMethod.RAZORPAY ? getRazorpayKeyId() : undefined,
    amountPaise: result.payablePaise,
    currency: "INR",
    isDuplicate: result.isDuplicate,
    paymentMethod: result.paymentMethod ?? PaymentMethod.RAZORPAY,
    paymentStatus: result.paymentStatus ?? PaymentStatus.PENDING,
    simulatedPayment,
  };
}

export const POST = route(async (req, _ctx, requestId) => {
  const auth = await requireAuth(req);
  await enforceRateLimit(req, "checkout", auth.user.id);
  const parsed = await parseBody(req, CreateCheckoutRequestSchema);
  const { quoteId, deliveryAddressId, instructions, idempotencyKey, recipientName, recipientPhone, giftMessage } = parsed;
  const paymentMethod = parsed.paymentMethod ?? PaymentMethod.RAZORPAY;
  const razorpay = new RazorpayAdapter();
  const attributionToken = cookieValue(req.headers.get("cookie"), "mp_attr");

  const requestHash = createHash("sha256")
    .update(
      JSON.stringify({
        quoteId,
        deliveryAddressId,
        instructions: instructions ?? "",
        paymentMethod,
        recipientName: recipientName ?? "",
        recipientPhone: recipientPhone ?? "",
        giftMessage: giftMessage ?? "",
        attribution: attributionToken ? hashAttributionToken(attributionToken) : "",
      })
    )
    .digest("hex");

  // 1. Replayed request (double tap, network retry): answer without touching the gateway
  const replay = await OrderRepository.findCompletedCheckout(auth.user.id, idempotencyKey, requestHash);
  if (replay) return apiSuccess(toResponse(replay, razorpay.isMock), 200, { requestId });

  // 2. The quote is the price contract
  const [quote] = await getDb().select().from(quotes).where(eq(quotes.id, quoteId)).limit(1);
  if (!quote || quote.customerId !== auth.user.id) throw new DomainError("NOT_FOUND", "Quote not found");
  const isPickup = quote.orderMode === OrderMode.PICKUP;
  if (isPickup && recipientName) {
    throw new DomainError("VALIDATION_ERROR", "Pickup orders are collected by you and can't be gifted to someone else.");
  }

  // 3. Delivery needs the priced address; pickup has no last mile
  let address: Awaited<ReturnType<typeof AddressRepository.findById>> = null;
  if (isPickup) {
    if (paymentMethod === PaymentMethod.COD) {
      throw new DomainError("VALIDATION_ERROR", "Cash on delivery isn't available for pickup. Pay online to skip the queue.");
    }
  } else {
    if (!deliveryAddressId) throw new DomainError("VALIDATION_ERROR", "Choose a delivery address.");
    address = await AddressRepository.findById(deliveryAddressId);
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
  }

  // 4. One order per quote: a retry after a failed/cancelled payment window reuses the pending order
  const existingOrder = await OrderRepository.findOrderByQuote(quoteId);
  if (existingOrder) {
    // Wallet/COD orders are confirmed server-side, so a retry returns the placed order
    if (
      existingOrder.paymentMethod &&
      existingOrder.paymentMethod !== PaymentMethod.RAZORPAY &&
      existingOrder.fulfillmentState !== "PENDING_PAYMENT"
    ) {
      return apiSuccess(
        toResponse(
          {
            orderId: existingOrder.id,
            orderNumber: existingOrder.orderNumber,
            payablePaise: existingOrder.payablePaise,
            paymentMethod: existingOrder.paymentMethod,
            paymentStatus: existingOrder.paymentStatus as PaymentStatus,
            isDuplicate: true,
          },
          razorpay.isMock
        ),
        200,
        { requestId }
      );
    }
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

  // Attribution is locked at checkout: 24h signed session, then lifetime first origin,
  // then marketplace. Commission is snapshotted on the order so later rate changes
  // cannot rewrite what the merchant was promised.
  const acquisitionChannel = await AttributionRepository.resolveCheckoutAttribution({
    customerId: auth.user.id,
    restaurantId: quote.restaurantId,
    token: attributionToken,
  });
  const configRes = await getDbPool().query(
    `SELECT commission_bp, commission_min_paise, commission_max_paise,
            direct_order_flat_fee_paise, first_origin_cap_paise
       FROM restaurants WHERE id = $1`,
    [quote.restaurantId]
  );
  const config = configRes.rows[0];
  if (!config) throw new DomainError("NOT_FOUND", "Restaurant pricing configuration not found");
  const commission = SettlementCalculator.calculateCommission({
    subtotalPaise: breakdown.subtotalPaise,
    channel: acquisitionChannel,
    policy: {
      commissionBp: config.commission_bp,
      commissionMinPaise: config.commission_min_paise,
      commissionMaxPaise: config.commission_max_paise,
      directOrderFlatFeePaise: config.direct_order_flat_fee_paise,
      firstOriginCapPaise: config.first_origin_cap_paise,
    },
  });
  const coupon = quote.couponCode ? await CouponRepository.findByCode(quote.couponCode) : null;
  const merchantFundedDiscountPaise = coupon?.fundedBy === "MERCHANT" ? breakdown.discountPaise : 0;
  const merchantNetPayoutPaise = Math.max(
    0,
    SettlementCalculator.merchantEarningAfterFees(
      breakdown,
      commission.commissionPaise,
      commission.merchantOrderFeePaise
    ) - merchantFundedDiscountPaise
  );

  // 6. Gateway order first (external, cannot join our transaction). Wallet and COD
  // orders skip the gateway entirely.
  let razorpayOrderId: string | undefined;
  let orderNumber = generateOrderNumber();
  if (paymentMethod === PaymentMethod.WALLET) {
    const wallet = await WalletRepository.getOrCreate(auth.user.id);
    if (wallet.balancePaise < breakdown.payablePaise) {
      throw new DomainError("PAYMENT_FAILED", "Not enough BiteBox Credits for this order.", {
        details: { balancePaise: wallet.balancePaise, requiredPaise: breakdown.payablePaise },
      });
    }
  }
  if (paymentMethod === PaymentMethod.RAZORPAY) {
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
  }

  const scheduledFor = quote.scheduledFor ?? undefined;
  const estimatedDeliveryMinutes = scheduledFor
    ? Math.max(quote.estimatedMaxMinutes, Math.ceil((scheduledFor.getTime() - Date.now()) / 60000))
    : quote.estimatedMaxMinutes;

  // 7. Persist atomically; retry the rare order-number collision with a fresh number
  for (let attempt = 0; ; attempt++) {
    try {
      const result = await OrderRepository.createWithIdempotency({
        idempotencyKey,
        principalId: auth.user.id,
        requestHash,
        customerId: auth.user.id,
        restaurantId: quote.restaurantId,
        deliveryAddressId: isPickup ? undefined : address!.id,
        orderNumber,
        items,
        breakdown,
        payablePaise: breakdown.payablePaise,
        deliveryOtp: generateVerificationOtp(4),
        pickupOtp: generateVerificationOtp(4),
        instructions,
        estimatedDeliveryMinutes,
        razorpayOrderId,
        paymentMethod,
        orderMode: quote.orderMode as OrderMode,
        scheduledFor: scheduledFor?.toISOString(),
        contactless: quote.contactless,
        cutleryOptIn: quote.cutleryOptIn,
        deliveryPreference: quote.deliveryPreference ?? undefined,
        recipientName,
        recipientPhone,
        giftMessage,
        quoteId,
        couponCode: quote.couponCode ?? undefined,
        acquisitionChannel,
        commissionBpApplied: commission.commissionBpApplied,
        commissionPaise: commission.commissionPaise,
        merchantOrderFeePaise: commission.merchantOrderFeePaise,
        merchantNetPayoutPaise,
        merchantFundedDiscountPaise,
        slotWindow: quote.slotWindow ?? undefined,
        dropPointId: quote.dropPointId ?? undefined,
        deliveryAddressSnapshot: isPickup
          ? {
              label: "Pickup",
              building: restaurant.name,
              street: restaurant.addressText,
              latitude: restaurant.latitude,
              longitude: restaurant.longitude,
              contactPhone: restaurant.phone ?? auth.user.phone ?? undefined,
            }
          : {
              label: address!.label,
              building: address!.building,
              street: address!.street,
              landmark: address!.landmark,
              latitude: address!.latitude,
              longitude: address!.longitude,
              contactPhone: recipientPhone ?? address!.contactPhone ?? auth.user.phone ?? undefined,
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

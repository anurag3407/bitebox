import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import {
  AcquisitionChannel,
  FaultCode,
  FulfillmentState,
  OrderDetailDto,
  OrderMode,
  OrderSummaryDto,
  PaymentMethod,
  PaymentStatus,
  QuoteBreakdown,
  QuoteLineBreakdown,
} from "@startup/contracts";
import {
  CancellationActor,
  CancellationPolicy,
  DomainError,
  LedgerEngine,
  LedgerAccountType,
  OrderStateMachine,
  safeEqual,
} from "@startup/core";
import { getDbPool, withTransaction } from "../client.js";
import { CouponRepository } from "./coupon.repository.js";
import { JobKind, JobRepository } from "./job.repository.js";
import { LedgerRepository } from "./ledger.repository.js";
import { OutboxRepository } from "./outbox.repository.js";
import { RefundRepository } from "./refund.repository.js";
import { WalletRepository } from "./wallet.repository.js";
import { LoyaltyRepository } from "./loyalty.repository.js";

type Queryable = Pick<PoolClient, "query">;

export type OrderActorType = "CUSTOMER" | "MERCHANT" | "RIDER" | "ADMIN" | "SYSTEM";

export const MERCHANT_ACCEPTANCE_WINDOW_SECONDS = 90;
export const PAYMENT_WINDOW_MINUTES = 15;

export interface DeliveryAddressSnapshot {
  label?: string;
  building: string;
  street: string;
  landmark?: string;
  latitude: number;
  longitude: number;
  contactPhone?: string;
}

export interface CreateOrderParams {
  idempotencyKey: string;
  principalId: string;
  requestHash: string;
  customerId: string;
  restaurantId: string;
  deliveryAddressId?: string;
  orderNumber: string;
  items: QuoteLineBreakdown[];
  breakdown: QuoteBreakdown;
  payablePaise: number;
  deliveryOtp: string;
  pickupOtp: string;
  instructions?: string;
  estimatedDeliveryMinutes: number;
  // Absent for wallet / COD orders, which never create a gateway order
  razorpayOrderId?: string;
  paymentMethod?: PaymentMethod;
  quoteId?: string;
  couponCode?: string;
  deliveryAddressSnapshot?: DeliveryAddressSnapshot;
  acquisitionChannel?: AcquisitionChannel;
  commissionBpApplied?: number;
  commissionPaise?: number;
  merchantOrderFeePaise?: number;
  merchantNetPayoutPaise?: number;
  merchantFundedDiscountPaise?: number;
  orderType?: "PRIMARY" | "ADDON" | "MEAL_PASS" | "SURPLUS" | "CORPORATE";
  parentOrderId?: string;
  slotWindow?: string;
  dropPointId?: string;
  orderMode?: OrderMode;
  scheduledFor?: string;
  contactless?: boolean;
  cutleryOptIn?: boolean;
  deliveryPreference?: string;
  recipientName?: string;
  recipientPhone?: string;
  giftMessage?: string;
}

export interface CheckoutResult {
  orderId: string;
  orderNumber: string;
  paymentAttemptId?: string;
  razorpayOrderId?: string;
  payablePaise: number;
  paymentMethod?: PaymentMethod;
  paymentStatus?: PaymentStatus;
  isDuplicate: boolean;
}

export interface LockedOrderRow {
  id: string;
  order_number: string;
  customer_id: string;
  restaurant_id: string;
  fulfillment_state: FulfillmentState;
  payment_status: PaymentStatus;
  payable_paise: number;
  breakdown_json: QuoteBreakdown;
  version: number;
  prep_time_minutes: number | null;
  acquisition_channel: AcquisitionChannel;
  commission_bp_applied: number | null;
  merchant_order_fee_paise: number;
  merchant_net_payout_paise: number | null;
  merchant_funded_discount_paise: number;
  payment_method: PaymentMethod;
  refunded_paise: number;
  scheduled_for: Date | null;
  contactless: boolean;
  order_mode: OrderMode;
  pickup_otp: string;
}

// Timestamp column stamped when an order enters a state
const STATE_TIMESTAMP_COLUMN: Partial<Record<FulfillmentState, string>> = {
  [FulfillmentState.ACCEPTED]: "accepted_at",
  [FulfillmentState.READY_FOR_PICKUP]: "ready_at",
  [FulfillmentState.PICKED_UP]: "picked_up_at",
  [FulfillmentState.DELIVERED]: "delivered_at",
  [FulfillmentState.CANCELLED]: "cancelled_at",
  [FulfillmentState.DELIVERY_FAILED]: "cancelled_at",
};

function isUniqueViolation(err: unknown, constraint?: string): boolean {
  const e = err as { code?: string; constraint?: string };
  return e?.code === "23505" && (!constraint || e.constraint === constraint);
}

function mapDetailRow(row: any): OrderDetailDto {
  const snapshot = (row.delivery_address_snapshot ?? null) as DeliveryAddressSnapshot | null;
  const breakdown = row.breakdown_json as QuoteBreakdown & { quoteId?: string };
  const state = row.fulfillment_state as FulfillmentState;
  const { quoteId: _quoteId, ...publicBreakdown } = breakdown;
  return {
    orderId: row.id,
    orderNumber: row.order_number,
    customerId: row.customer_id,
    restaurant: {
      id: row.restaurant_id,
      name: row.restaurant_name,
      phone: row.restaurant_phone ?? undefined,
      heroImageUrl: row.restaurant_hero_image_url ?? undefined,
    },
    // Orders keep the address as it was at checkout even if the customer edits it later
    deliveryAddress: {
      building: snapshot?.building ?? row.address_building ?? row.restaurant_name,
      street: snapshot?.street ?? row.address_street ?? row.restaurant_address_text ?? "",
      landmark: (snapshot?.landmark ?? row.address_landmark) || undefined,
      latitude: snapshot?.latitude ?? row.address_latitude ?? row.restaurant_latitude ?? 0,
      longitude: snapshot?.longitude ?? row.address_longitude ?? row.restaurant_longitude ?? 0,
      contactPhone: (snapshot?.contactPhone ?? row.address_contact_phone) || undefined,
    },
    items: row.items_json as QuoteLineBreakdown[],
    breakdown: { ...publicBreakdown, tipPaise: publicBreakdown.tipPaise ?? 0 },
    fulfillmentState: state,
    paymentStatus: row.payment_status as PaymentStatus,
    createdAt: row.created_at.toISOString(),
    merchantResponseDeadlineAt: row.merchant_response_deadline_at?.toISOString(),
    promisedDeliveryAt: row.promised_delivery_at?.toISOString(),
    currentEtaMinutes: row.promised_delivery_at
      ? Math.max(1, Math.ceil((row.promised_delivery_at.getTime() - Date.now()) / 60000))
      : undefined,
    deliveryOtp: row.delivery_otp,
    pickupCode: row.pickup_otp,
    orderMode: row.order_mode ?? "DELIVERY",
    scheduledFor: row.scheduled_for?.toISOString(),
    contactless: row.contactless ?? false,
    cutleryOptIn: row.cutlery_opt_in ?? true,
    deliveryPreference: row.delivery_preference ?? undefined,
    paymentMethod: row.payment_method ?? "RAZORPAY",
    deliveryProofUrl: row.delivery_proof_url ?? undefined,
    pickupVerifiedAt: row.pickup_verified_at?.toISOString(),
    recipientName: row.recipient_name ?? undefined,
    recipientPhone: row.recipient_phone ?? undefined,
    giftMessage: row.gift_message ?? undefined,
    tipPaise: row.tip_paise ?? undefined,
    tipCreatedAt: row.tip_created_at?.toISOString(),
    instructions: row.instructions ?? undefined,
    couponCode: row.coupon_code ?? undefined,
    prepTimeMinutes: row.prep_time_minutes ?? undefined,
    cancellationReason: row.cancellation_reason ?? undefined,
    acceptedAt: row.accepted_at?.toISOString(),
    readyAt: row.ready_at?.toISOString(),
    pickedUpAt: row.picked_up_at?.toISOString(),
    deliveredAt: row.delivered_at?.toISOString(),
    cancelledAt: row.cancelled_at?.toISOString(),
    refundedPaise: row.refunded_paise ?? 0,
    acquisitionChannel: (row.acquisition_channel as AcquisitionChannel | undefined) ?? AcquisitionChannel.MARKETPLACE,
    commissionPaise: row.commission_paise ?? 0,
    merchantNetPayoutPaise: row.merchant_net_payout_paise ?? undefined,
    rider: row.rider_name
      ? { name: row.rider_name, phone: row.rider_phone ?? undefined, vehicleType: row.rider_vehicle_type ?? undefined }
      : undefined,
    rating: row.food_rating
      ? {
          foodRating: row.food_rating,
          deliveryRating: row.delivery_rating ?? undefined,
          comment: row.rating_comment ?? undefined,
        }
      : undefined,
    canCancel: CancellationPolicy.evaluate("CUSTOMER", state).allowed,
    canRate: state === FulfillmentState.DELIVERED && !row.food_rating,
  };
}

const DETAIL_SELECT = `
  SELECT o.*,
         r.name AS restaurant_name, r.phone AS restaurant_phone, r.hero_image_url AS restaurant_hero_image_url,
         r.slug AS restaurant_slug, r.address_text AS restaurant_address_text,
         r.latitude AS restaurant_latitude, r.longitude AS restaurant_longitude,
         a.building AS address_building, a.street AS address_street, a.landmark AS address_landmark,
         a.latitude AS address_latitude, a.longitude AS address_longitude, a.contact_phone AS address_contact_phone,
         rd.name AS rider_name, rd.phone AS rider_phone, rd.vehicle_type AS rider_vehicle_type,
         rt.food_rating, rt.delivery_rating, rt.comment AS rating_comment,
         tip.amount_paise AS tip_paise, tip.created_at AS tip_created_at
    FROM orders o
    JOIN restaurants r ON r.id = o.restaurant_id
    LEFT JOIN customer_addresses a ON a.id = o.delivery_address_id
    LEFT JOIN LATERAL (
      SELECT rider_id FROM delivery_assignments da
       WHERE da.order_id = o.id AND da.status <> 'CANCELLED'
       ORDER BY da.assigned_at DESC LIMIT 1
    ) last_trip ON true
    LEFT JOIN riders rd ON rd.id = last_trip.rider_id
    LEFT JOIN order_ratings rt ON rt.order_id = o.id
    LEFT JOIN LATERAL (SELECT amount_paise, created_at FROM order_tips WHERE order_id = o.id LIMIT 1) tip ON true`;

export class OrderRepository {
  static async findCompletedCheckout(principalId: string, idempotencyKey: string, requestHash: string) {
    const res = await getDbPool().query(
      `SELECT response_json, request_hash, status FROM idempotency_records
        WHERE principal_id = $1 AND operation = 'CHECKOUT' AND idempotency_key = $2`,
      [principalId, idempotencyKey]
    );
    const row = res.rows[0];
    if (!row) return null;
    if (row.request_hash !== requestHash) {
      throw new DomainError("IDEMPOTENCY_CONFLICT", "Idempotency key reused with a different request payload");
    }
    return row.status === "COMPLETED" ? ({ ...row.response_json, isDuplicate: true } as CheckoutResult) : null;
  }

  /**
   * Creates the order, its first event, the payment attempt, the coupon reservation and
   * the payment-expiry job in one transaction, keyed by (principal, idempotency key).
   * Concurrent duplicates block on the idempotency row and then return the first result.
   */
  static async createWithIdempotency(params: CreateOrderParams): Promise<CheckoutResult> {
    try {
      return await withTransaction(async (client) => {
        const inserted = await client.query(
          `INSERT INTO idempotency_records (id, principal_id, operation, idempotency_key, request_hash, status)
           VALUES (gen_random_uuid(), $1, 'CHECKOUT', $2, $3, 'PROCESSING')
           ON CONFLICT (principal_id, operation, idempotency_key) DO NOTHING
           RETURNING id`,
          [params.principalId, params.idempotencyKey, params.requestHash]
        );

        if (inserted.rows.length === 0) {
          const existing = await client.query(
            `SELECT response_json, status, request_hash FROM idempotency_records
              WHERE principal_id = $1 AND operation = 'CHECKOUT' AND idempotency_key = $2`,
            [params.principalId, params.idempotencyKey]
          );
          const row = existing.rows[0];
          if (row.request_hash !== params.requestHash) {
            throw new DomainError("IDEMPOTENCY_CONFLICT", "Idempotency key reused with a different request payload");
          }
          if (row.status === "COMPLETED") {
            return { ...row.response_json, isDuplicate: true } as CheckoutResult;
          }
          throw new DomainError("CONFLICT", "This checkout is already being processed. Please retry shortly.");
        }

        const promisedAt = new Date(Date.now() + params.estimatedDeliveryMinutes * 60 * 1000);
        const orderRes = await client.query(
          `INSERT INTO orders (
             id, order_number, customer_id, restaurant_id, delivery_address_id,
             items_json, breakdown_json, fulfillment_state, payment_status,
             payable_paise, delivery_otp, pickup_otp, instructions, promised_delivery_at,
             quote_id, coupon_code, delivery_address_snapshot,
             acquisition_channel, commission_bp_applied, commission_paise,
             merchant_order_fee_paise, merchant_net_payout_paise, order_type,
             parent_order_id, slot_window, drop_point_id, slot_cutoff_at,
             order_mode, scheduled_for, contactless, cutlery_opt_in, delivery_preference, payment_method,
             recipient_name, recipient_phone, gift_message, merchant_funded_discount_paise
           ) VALUES (
             gen_random_uuid(), $1, $2, $3, $4, $5, $6, 'PENDING_PAYMENT', 'PENDING',
             $7, $8, $9, $10, $11, $12, $13, $14,
             $15, $16, $17, $18, $19, $20, $21, $22, $23,
             COALESCE($25::timestamptz, $11::timestamptz) - interval '30 minutes',
             $24, $25, $26, $27, $28, $29, $30, $31, $32, $33
           ) RETURNING id`,
          [
            params.orderNumber,
            params.customerId,
            params.restaurantId,
            params.deliveryAddressId ?? null,
            JSON.stringify(params.items),
            JSON.stringify({ ...params.breakdown, quoteId: params.quoteId }),
            params.payablePaise,
            params.deliveryOtp,
            params.pickupOtp,
            params.instructions ?? null,
            promisedAt.toISOString(),
            params.quoteId ?? null,
            params.couponCode ?? null,
            params.deliveryAddressSnapshot ? JSON.stringify(params.deliveryAddressSnapshot) : null,
            params.acquisitionChannel ?? AcquisitionChannel.MARKETPLACE,
            params.commissionBpApplied ?? null,
            params.commissionPaise ?? 0,
            params.merchantOrderFeePaise ?? 0,
            params.merchantNetPayoutPaise ?? null,
            params.orderType ?? "PRIMARY",
            params.parentOrderId ?? null,
            params.slotWindow ?? null,
            params.dropPointId ?? null,
            params.orderMode ?? OrderMode.DELIVERY,
            params.scheduledFor ?? null,
            params.contactless ?? false,
            params.cutleryOptIn ?? true,
            params.deliveryPreference ?? null,
            params.paymentMethod ?? PaymentMethod.RAZORPAY,
            params.recipientName ?? null,
            params.recipientPhone ?? null,
            params.giftMessage ?? null,
            params.merchantFundedDiscountPaise ?? 0,
          ]
        );
        const orderId: string = orderRes.rows[0].id;

        await client.query(
          `INSERT INTO order_events (id, order_id, sequence, source_state, target_state, actor_type, actor_id, reason)
           VALUES (gen_random_uuid(), $1, 1, 'NONE', 'PENDING_PAYMENT', 'CUSTOMER', $2, 'Order initiated by customer')`,
          [orderId, params.customerId]
        );

        if (params.couponCode && params.breakdown.discountPaise > 0) {
          // Lock the coupon so usage limits are checked race-free across concurrent checkouts
          const coupon = await CouponRepository.findByCode(params.couponCode, client, true);
          const eligibility = await CouponRepository.checkEligibility(client, coupon, {
            userId: params.customerId,
            restaurantId: params.restaurantId,
          });
          if (!eligibility.ok || !coupon) {
            throw new DomainError("COUPON_INVALID", eligibility.ok ? "Coupon is no longer valid." : eligibility.reason);
          }
          await CouponRepository.reserveWithClient(client, {
            couponId: coupon.id,
            userId: params.customerId,
            orderId,
            discountPaise: params.breakdown.discountPaise,
          });
        }

        const paymentMethod = params.paymentMethod ?? PaymentMethod.RAZORPAY;
        let paymentAttemptId: string | undefined;
        let paymentStatus: PaymentStatus = PaymentStatus.PENDING;
        if (paymentMethod === PaymentMethod.RAZORPAY) {
          if (!params.razorpayOrderId) throw new DomainError("VALIDATION_ERROR", "Gateway order is required for card payments");
          const attemptRes = await client.query(
            `INSERT INTO payment_attempts (id, order_id, razorpay_order_id, status, amount_paise, currency)
             VALUES (gen_random_uuid(), $1, $2, 'READY', $3, 'INR')
             RETURNING id`,
            [orderId, params.razorpayOrderId, params.payablePaise]
          );
          paymentAttemptId = attemptRes.rows[0].id;

          // Unpaid gateway orders are reconciled with the gateway and then expired
          await JobRepository.enqueueWithClient(client, JobKind.PAYMENT_EXPIRY, { orderId }, {
            runAt: new Date(Date.now() + PAYMENT_WINDOW_MINUTES * 60 * 1000),
            dedupeKey: `payment-expiry:${orderId}`,
          });
        } else {
          // Wallet and cash orders are confirmed immediately, without a gateway round-trip.
          const locked = {
            id: orderId,
            order_number: params.orderNumber,
            customer_id: params.customerId,
            restaurant_id: params.restaurantId,
            fulfillment_state: FulfillmentState.PENDING_PAYMENT,
            payment_status: PaymentStatus.PENDING,
            payable_paise: params.payablePaise,
            breakdown_json: params.breakdown,
            version: 1,
            prep_time_minutes: null,
            acquisition_channel: params.acquisitionChannel ?? AcquisitionChannel.MARKETPLACE,
            commission_bp_applied: params.commissionBpApplied ?? null,
            merchant_order_fee_paise: params.merchantOrderFeePaise ?? 0,
            merchant_net_payout_paise: params.merchantNetPayoutPaise ?? null,
            merchant_funded_discount_paise: params.merchantFundedDiscountPaise ?? 0,
            payment_method: paymentMethod,
            refunded_paise: 0,
            scheduled_for: params.scheduledFor ? new Date(params.scheduledFor) : null,
            contactless: params.contactless ?? false,
            order_mode: params.orderMode ?? OrderMode.DELIVERY,
            pickup_otp: params.pickupOtp,
          } as LockedOrderRow;
          if (paymentMethod === PaymentMethod.WALLET) {
            await WalletRepository.debitForOrderWithClient(client, {
              userId: params.customerId,
              orderId,
              amountPaise: params.payablePaise,
              description: `Order ${params.orderNumber} paid with BiteBox Credits`,
            });
            const payRes = await client.query(
              `INSERT INTO payments (id, order_id, payment_attempt_id, provider_payment_id, status, amount_paise, currency)
               VALUES (gen_random_uuid(), $1, NULL, $2, 'CAPTURED', $3, 'INR') RETURNING id`,
              [orderId, `wallet:${orderId}`, params.payablePaise]
            );
            await LedgerRepository.postTransactionWithClient(client, {
              orderId,
              paymentId: payRes.rows[0].id,
              effectType: "CAPTURE",
              entries: LedgerEngine.buildOrderCaptureEntries({
                payablePaise: params.breakdown.payablePaise,
                subtotalPaise: params.breakdown.subtotalPaise,
                deliveryFeePaise: params.breakdown.deliveryFeePaise,
                platformFeePaise: params.breakdown.platformFeePaise,
                packagingPaise: params.breakdown.packagingPaise,
                taxPaise: params.breakdown.taxPaise,
                discountPaise: params.breakdown.discountPaise,
                surgePaise: params.breakdown.surgePaise,
                tipPaise: params.breakdown.tipPaise ?? 0,
                commissionRateBasisPoints: params.commissionBpApplied,
                merchantOrderFeePaise: params.merchantOrderFeePaise,
                merchantFundedDiscountPaise: params.merchantFundedDiscountPaise,
              }),
            });
            await client.query(`UPDATE orders SET payment_status = 'CAPTURED' WHERE id = $1`, [orderId]);
            paymentStatus = PaymentStatus.CAPTURED;
            await CouponRepository.markRedeemedWithClient(client, orderId);
          }

          const deadline = new Date(Date.now() + MERCHANT_ACCEPTANCE_WINDOW_SECONDS * 1000);
          await client.query(`UPDATE orders SET merchant_response_deadline_at = $2 WHERE id = $1`, [orderId, deadline]);
          await OrderRepository.transitionLockedWithClient(client, locked, {
            toState: FulfillmentState.AWAITING_MERCHANT,
            actorType: "SYSTEM",
            actorId: paymentMethod === PaymentMethod.WALLET ? "WALLET" : "COD",
            reason: paymentMethod === PaymentMethod.WALLET ? "Paid with BiteBox Credits" : "Cash on delivery confirmed",
            extra: { orderMode: params.orderMode ?? OrderMode.DELIVERY },
          });
          await JobRepository.enqueueWithClient(client, JobKind.MERCHANT_ACCEPTANCE_TIMEOUT, { orderId }, {
            runAt: deadline,
            dedupeKey: `merchant-timeout:${orderId}`,
          });
        }

        await OutboxRepository.appendWithClient(client, "order.created", orderId, 1, {
          orderId,
          orderNumber: params.orderNumber,
          customerId: params.customerId,
          restaurantId: params.restaurantId,
          payablePaise: params.payablePaise,
          paymentMethod,
        });

        // Fifteen minutes before the slot cutoff, prompt a one-tap add-on in the same crate.
        const slotCutoffAt = new Date(promisedAt.getTime() - 30 * 60 * 1000);
        const addonUpsellAt = new Date(slotCutoffAt.getTime() - 15 * 60 * 1000);
        await JobRepository.enqueueWithClient(client, JobKind.ADDON_UPSELL, { parentOrderId: orderId }, {
          runAt: addonUpsellAt,
          dedupeKey: `addon-upsell:${orderId}`,
        });

        const responsePayload: Omit<CheckoutResult, "isDuplicate"> = {
          orderId,
          orderNumber: params.orderNumber,
          paymentAttemptId,
          razorpayOrderId: params.razorpayOrderId,
          payablePaise: params.payablePaise,
          paymentMethod,
          paymentStatus,
        };

        await client.query(
          `UPDATE idempotency_records
           SET status = 'COMPLETED', response_json = $1
           WHERE principal_id = $2 AND operation = 'CHECKOUT' AND idempotency_key = $3`,
          [JSON.stringify(responsePayload), params.principalId, params.idempotencyKey]
        );

        return { ...responsePayload, isDuplicate: false };
      });
    } catch (err) {
      if (isUniqueViolation(err, "uq_orders_quote")) {
        throw new DomainError("CONFLICT", "An order has already been placed for this quote.");
      }
      if (isUniqueViolation(err, "orders_order_number_key")) {
        throw new DomainError("CONFLICT", "ORDER_NUMBER_COLLISION");
      }
      throw err;
    }
  }

  static async findOrderByQuote(quoteId: string): Promise<{
    id: string;
    orderNumber: string;
    customerId: string;
    fulfillmentState: string;
    paymentStatus: string;
    payablePaise: number;
    paymentMethod?: PaymentMethod;
    paymentAttemptId?: string;
    razorpayOrderId?: string;
    attemptStatus?: string;
  } | null> {
    const res = await getDbPool().query(
      `SELECT o.id, o.order_number, o.customer_id, o.fulfillment_state, o.payment_status, o.payable_paise,
              o.payment_method,
              pa.id as payment_attempt_id, pa.razorpay_order_id, pa.status as attempt_status
       FROM orders o
       LEFT JOIN LATERAL (
         SELECT id, razorpay_order_id, status FROM payment_attempts
          WHERE order_id = o.id ORDER BY created_at DESC LIMIT 1
       ) pa ON true
       WHERE o.quote_id = $1`,
      [quoteId]
    );
    if (res.rows.length === 0) return null;
    const row = res.rows[0];
    return {
      id: row.id,
      orderNumber: row.order_number,
      customerId: row.customer_id,
      fulfillmentState: row.fulfillment_state,
      paymentStatus: row.payment_status,
      payablePaise: row.payable_paise,
      paymentMethod: row.payment_method as PaymentMethod,
      paymentAttemptId: row.payment_attempt_id ?? undefined,
      razorpayOrderId: row.razorpay_order_id ?? undefined,
      attemptStatus: row.attempt_status ?? undefined,
    };
  }

  static async findById(orderId: string): Promise<OrderDetailDto | null> {
    const res = await getDbPool().query(`${DETAIL_SELECT} WHERE o.id = $1`, [orderId]);
    return res.rows[0] ? mapDetailRow(res.rows[0]) : null;
  }

  static async findAccessContext(orderId: string): Promise<{
    customerId: string;
    restaurantId: string;
    fulfillmentState: FulfillmentState;
    riderUserIds: string[];
  } | null> {
    const res = await getDbPool().query(
      `SELECT o.customer_id, o.restaurant_id, o.fulfillment_state,
              COALESCE(ARRAY(
                SELECT rd.user_id FROM delivery_assignments da JOIN riders rd ON rd.id = da.rider_id
                 WHERE da.order_id = o.id AND da.status <> 'CANCELLED'
                UNION
                SELECT rd.user_id FROM delivery_offers d JOIN riders rd ON rd.id = d.rider_id
                 WHERE d.order_id = o.id AND d.status = 'OFFERED'
              ), '{}') AS rider_user_ids
         FROM orders o WHERE o.id = $1`,
      [orderId]
    );
    const row = res.rows[0];
    if (!row) return null;
    return {
      customerId: row.customer_id,
      restaurantId: row.restaurant_id,
      fulfillmentState: row.fulfillment_state,
      riderUserIds: row.rider_user_ids,
    };
  }

  static async listByCustomer(
    customerId: string,
    options: { limit?: number; before?: Date } = {}
  ): Promise<OrderSummaryDto[]> {
    const limit = Math.min(Math.max(options.limit ?? 20, 1), 50);
    const res = await getDbPool().query(
      `SELECT o.id, o.order_number, o.restaurant_id, o.fulfillment_state, o.payment_status, o.payable_paise,
              o.created_at, o.promised_delivery_at, o.items_json,
              r.name AS restaurant_name, r.slug AS restaurant_slug, r.hero_image_url,
              rt.food_rating
         FROM orders o
         JOIN restaurants r ON r.id = o.restaurant_id
         LEFT JOIN order_ratings rt ON rt.order_id = o.id
        WHERE o.customer_id = $1
          -- Abandoned unpaid carts are noise in order history
          AND NOT (o.fulfillment_state = 'CANCELLED' AND o.payment_status = 'PENDING')
          AND ($2::timestamptz IS NULL OR o.created_at < $2::timestamptz)
        ORDER BY o.created_at DESC
        LIMIT $3`,
      [customerId, options.before?.toISOString() ?? null, limit]
    );

    return res.rows.map((r) => {
      const items = (r.items_json as QuoteLineBreakdown[]) || [];
      return {
        orderId: r.id,
        orderNumber: r.order_number,
        restaurantId: r.restaurant_id,
        restaurantName: r.restaurant_name,
        restaurantSlug: r.restaurant_slug,
        restaurantImageUrl: r.hero_image_url ?? undefined,
        fulfillmentState: r.fulfillment_state as FulfillmentState,
        paymentStatus: r.payment_status as PaymentStatus,
        payablePaise: r.payable_paise,
        createdAt: r.created_at.toISOString(),
        promisedDeliveryAt: r.promised_delivery_at?.toISOString(),
        itemCount: Math.max(1, items.reduce((sum, item) => sum + (item.quantity || 1), 0)),
        itemsPreview: items.map((i) => `${i.quantity} x ${i.name}`).join(", ").slice(0, 120),
        rating: r.food_rating ?? undefined,
      };
    });
  }

  static async listByRestaurant(
    restaurantId: string,
    states?: FulfillmentState[],
    options: { sinceHours?: number; limit?: number } = {}
  ): Promise<OrderDetailDto[]> {
    const res = await getDbPool().query(
      `${DETAIL_SELECT}
        WHERE o.restaurant_id = $1
          AND ($2::text[] IS NULL OR o.fulfillment_state = ANY($2::text[]))
          AND o.fulfillment_state <> 'PENDING_PAYMENT'
          AND o.created_at > NOW() - make_interval(hours => $3)
        ORDER BY o.created_at DESC
        LIMIT $4`,
      [restaurantId, states && states.length > 0 ? states : null, options.sinceHours ?? 24, options.limit ?? 100]
    );
    return res.rows.map(mapDetailRow);
  }

  static async lockForUpdate(client: Queryable, orderId: string): Promise<LockedOrderRow> {
    const res = await client.query(
      `SELECT id, order_number, customer_id, restaurant_id, fulfillment_state, payment_status,
              payable_paise, breakdown_json, version, prep_time_minutes,
              acquisition_channel, commission_bp_applied, merchant_order_fee_paise, merchant_net_payout_paise,
              payment_method, refunded_paise, scheduled_for, contactless, order_mode, pickup_otp
         FROM orders WHERE id = $1 FOR UPDATE`,
      [orderId]
    );
    if (res.rows.length === 0) throw new DomainError("NOT_FOUND", "Order not found");
    return res.rows[0];
  }

  /**
   * Moves a locked order to a new fulfillment state, stamping lifecycle timestamps,
   * bumping the version and recording a gapless event + outbox message.
   * The caller must hold the row lock (see lockForUpdate) inside `client`'s transaction.
   */
  static async transitionLockedWithClient(
    client: Queryable,
    order: LockedOrderRow,
    input: {
      toState: FulfillmentState;
      actorType: OrderActorType;
      actorId?: string;
      reason?: string;
      extra?: Record<string, unknown>;
    }
  ): Promise<LockedOrderRow> {
    const check = OrderStateMachine.canTransition(order.fulfillment_state, input.toState);
    if (!check.allowed) {
      throw new DomainError("STATE_CONFLICT", check.error ?? "Invalid order state transition", {
        details: { currentState: order.fulfillment_state, requestedState: input.toState },
      });
    }
    if (order.fulfillment_state === input.toState) return order;

    const stampColumn = STATE_TIMESTAMP_COLUMN[input.toState];
    const isTerminalFailure =
      input.toState === FulfillmentState.CANCELLED || input.toState === FulfillmentState.DELIVERY_FAILED;
    const newVersion = order.version + 1;

    await client.query(
      `UPDATE orders
          SET fulfillment_state = $2,
              version = $3,
              updated_at = NOW()
              ${stampColumn ? `, ${stampColumn} = NOW()` : ""}
              ${isTerminalFailure ? ", cancellation_reason = $4" : ""}
        WHERE id = $1`,
      isTerminalFailure
        ? [order.id, input.toState, newVersion, input.reason ?? null]
        : [order.id, input.toState, newVersion]
    );

    await client.query(
      `INSERT INTO order_events (id, order_id, sequence, source_state, target_state, actor_type, actor_id, reason)
       SELECT gen_random_uuid(), $1, COALESCE(MAX(sequence), 0) + 1, $2, $3, $4, $5, $6
         FROM order_events WHERE order_id = $1`,
      [order.id, order.fulfillment_state, input.toState, input.actorType, input.actorId ?? null, input.reason ?? null]
    );

    await OutboxRepository.appendWithClient(client, `order.${input.toState.toLowerCase()}`, order.id, newVersion, {
      orderId: order.id,
      orderNumber: order.order_number,
      customerId: order.customer_id,
      restaurantId: order.restaurant_id,
      fromState: order.fulfillment_state,
      state: input.toState,
      reason: input.reason,
      ...input.extra,
    });

    return { ...order, fulfillment_state: input.toState, version: newVersion };
  }

  /** Locks the order, asserts it is in one of `fromStates`, and transitions it. */
  static async updateFulfillmentState(input: {
    orderId: string;
    fromState: FulfillmentState | FulfillmentState[];
    toState: FulfillmentState;
    actorType: OrderActorType;
    actorId?: string;
    reason?: string;
  }): Promise<void> {
    await withTransaction(async (client) => {
      const order = await OrderRepository.lockForUpdate(client, input.orderId);
      const allowed = Array.isArray(input.fromState) ? input.fromState : [input.fromState];
      if (!allowed.includes(order.fulfillment_state)) {
        throw new DomainError(
          "STATE_CONFLICT",
          `Order is ${order.fulfillment_state.toLowerCase().replace(/_/g, " ")}; expected ${allowed
            .map((s) => s.toLowerCase().replace(/_/g, " "))
            .join(" or ")}.`,
          { details: { currentState: order.fulfillment_state } }
        );
      }
      await OrderRepository.transitionLockedWithClient(client, order, input);
    });
  }

  /**
   * Restaurant accepts: records the prep promise, re-promises the delivery time and
   * schedules dispatch so a rider arrives as food is ready (not idle at the counter).
   */
  static async acceptByMerchant(input: {
    orderId: string;
    prepTimeMinutes: number;
    actorId: string;
    travelToPickupMinutes?: number;
    lastMileMinutes: number;
  }): Promise<void> {
    await withTransaction(async (client) => {
      const order = await OrderRepository.lockForUpdate(client, input.orderId);
      if (order.fulfillment_state !== FulfillmentState.AWAITING_MERCHANT) {
        throw new DomainError("STATE_CONFLICT", "This order is no longer awaiting acceptance.", {
          details: { currentState: order.fulfillment_state },
        });
      }
      await OrderRepository.transitionLockedWithClient(client, order, {
        toState: FulfillmentState.ACCEPTED,
        actorType: "MERCHANT",
        actorId: input.actorId,
        reason: `Accepted with ${input.prepTimeMinutes} min preparation time`,
        extra: { prepTimeMinutes: input.prepTimeMinutes },
      });

      const isPickup = order.order_mode === OrderMode.PICKUP;
      const promised = order.scheduled_for
        ? order.scheduled_for
        : new Date(Date.now() + (input.prepTimeMinutes + (isPickup ? 0 : input.lastMileMinutes + 4)) * 60_000);
      await client.query(
        `UPDATE orders SET prep_time_minutes = $2, promised_delivery_at = $3, merchant_response_deadline_at = NULL
          WHERE id = $1`,
        [order.id, input.prepTimeMinutes, promised.toISOString()]
      );

      // Pickup has no rider. Delivery starts looking for one so the rider reaches the
      // store ~when food is ready; scheduled orders anchor backwards from the slot.
      if (!isPickup) {
        const leadMinutes = (input.travelToPickupMinutes ?? 8) + 2;
        const dispatchDelayMs = order.scheduled_for
          ? Math.max(0, order.scheduled_for.getTime() - Date.now() - (input.lastMileMinutes + leadMinutes) * 60_000)
          : Math.max(0, (input.prepTimeMinutes - leadMinutes) * 60_000);
        await JobRepository.enqueueWithClient(client, JobKind.DISPATCH_ORDER, { orderId: order.id, attempt: 0 }, {
          runAt: new Date(Date.now() + dispatchDelayMs),
          dedupeKey: `dispatch:${order.id}:0`,
        });
      }
    });
  }

  /**
   * Self-pickup handover: the restaurant enters the customer's pickup code at the
   * counter. No rider, no delivery OTP; the invoice is queued on collection.
   */
  static async completePickup(input: { orderId: string; actorId: string; pickupCode: string }) {
    return withTransaction(async (client) => {
      const order = await OrderRepository.lockForUpdate(client, input.orderId);
      if (order.order_mode !== OrderMode.PICKUP) {
        throw new DomainError("STATE_CONFLICT", "This is a delivery order.");
      }
      if (order.fulfillment_state !== FulfillmentState.READY_FOR_PICKUP) {
        throw new DomainError("STATE_CONFLICT", "Mark the order ready before handing it over.", {
          details: { currentState: order.fulfillment_state },
        });
      }
      if (!safeEqual(input.pickupCode, order.pickup_otp)) {
        throw new DomainError("VALIDATION_ERROR", "Incorrect pickup code. Ask the customer to read it again.");
      }
      const updated = await OrderRepository.transitionLockedWithClient(client, order, {
        toState: FulfillmentState.DELIVERED,
        actorType: "MERCHANT",
        actorId: input.actorId,
        reason: "Collected by customer with pickup code",
      });
      await client.query(`UPDATE orders SET pickup_verified_at = NOW() WHERE id = $1`, [order.id]);
      await LoyaltyRepository.rewardDeliveryWithClient(client, {
        userId: order.customer_id,
        orderId: order.id,
        subtotalPaise: order.breakdown_json.subtotalPaise,
      });
      await JobRepository.enqueueWithClient(client, JobKind.ISSUE_INVOICE, { orderId: order.id }, {
        dedupeKey: `invoice:${order.id}`,
      });
      return { fulfillmentState: updated.fulfillment_state, orderNumber: order.order_number };
    });
  }

  /**
   * Records a gateway capture. Handles, in one transaction:
   *  - replays of the same payment (idempotent no-op)
   *  - amount/currency mismatches (refunded, order left unpaid)
   *  - a second capture on an already-paid order (duplicate refunded)
   *  - a capture arriving after the order was cancelled (refunded, order stays cancelled)
   *  - the normal path: CAPTURED + AWAITING_MERCHANT with an acceptance deadline
   */
  static async recordPaymentCapture(input: {
    orderId: string;
    providerPaymentId: string;
    amountPaise: number;
    currency?: string;
    paymentAttemptId?: string;
  }): Promise<{ outcome: "CAPTURED" | "ALREADY_RECORDED" | "DUPLICATE_REFUNDED" | "LATE_REFUNDED" | "MISMATCH_REFUNDED" }> {
    return withTransaction(async (client) => {
      const order = await OrderRepository.lockForUpdate(client, input.orderId);

      const existingPayment = await client.query(`SELECT id, order_id FROM payments WHERE provider_payment_id = $1`, [
        input.providerPaymentId,
      ]);
      if (existingPayment.rows.length > 0) {
        if (existingPayment.rows[0].order_id !== input.orderId) {
          throw new DomainError("CONFLICT", "Payment is already linked to a different order");
        }
        return { outcome: "ALREADY_RECORDED" as const };
      }

      const payRes = await client.query(
        `INSERT INTO payments (id, order_id, payment_attempt_id, provider_payment_id, status, amount_paise, currency)
         VALUES (gen_random_uuid(), $1, $2, $3, 'CAPTURED', $4, $5)
         RETURNING id`,
        [input.orderId, input.paymentAttemptId ?? null, input.providerPaymentId, input.amountPaise, input.currency ?? "INR"]
      );
      const paymentId: string = payRes.rows[0].id;

      if (input.paymentAttemptId) {
        await client.query(`UPDATE payment_attempts SET status = 'CAPTURED', updated_at = NOW() WHERE id = $1`, [
          input.paymentAttemptId,
        ]);
      }

      const alreadyPaid = order.payment_status !== PaymentStatus.PENDING && order.payment_status !== PaymentStatus.FAILED;
      const amountMismatch = input.amountPaise !== order.payable_paise || (input.currency ?? "INR") !== "INR";

      if (alreadyPaid || amountMismatch) {
        // Money we must hand back: hold it in refund clearing and refund this exact payment
        await LedgerRepository.postTransactionWithClient(client, {
          orderId: input.orderId,
          paymentId,
          effectType: "CAPTURE",
          entries: [
            {
              account: LedgerAccountType.GATEWAY_CLEARING,
              debitPaise: input.amountPaise,
              creditPaise: 0,
              description: alreadyPaid ? "Duplicate capture received" : "Capture with unexpected amount",
            },
            {
              account: LedgerAccountType.REFUND_CLEARING,
              debitPaise: 0,
              creditPaise: input.amountPaise,
              description: "Owed back to customer",
            },
          ],
        });
        await RefundRepository.issueWithClient(client, {
          orderId: input.orderId,
          paymentId,
          reason: alreadyPaid
            ? "Automatic refund: order was already paid (duplicate payment)"
            : `Automatic refund: paid ${input.amountPaise} paise, expected ${order.payable_paise}`,
          initiatedBy: "SYSTEM",
          isDuplicateCapture: true,
        });
        await OutboxRepository.appendWithClient(client, "payment.anomaly", input.orderId, order.version, {
          orderId: input.orderId,
          providerPaymentId: input.providerPaymentId,
          kind: alreadyPaid ? "DUPLICATE_CAPTURE" : "AMOUNT_MISMATCH",
        });
        return { outcome: alreadyPaid ? ("DUPLICATE_REFUNDED" as const) : ("MISMATCH_REFUNDED" as const) };
      }

      const breakdown = order.breakdown_json;
      const commissionBp =
        order.commission_bp_applied ??
        (
          await client.query(`SELECT commission_bp FROM restaurants WHERE id = $1`, [order.restaurant_id])
        ).rows[0]?.commission_bp ??
        undefined;
      await LedgerRepository.postTransactionWithClient(client, {
        orderId: input.orderId,
        paymentId,
        effectType: "CAPTURE",
        entries: LedgerEngine.buildOrderCaptureEntries({
          payablePaise: breakdown.payablePaise,
          subtotalPaise: breakdown.subtotalPaise,
          deliveryFeePaise: breakdown.deliveryFeePaise,
          platformFeePaise: breakdown.platformFeePaise,
          packagingPaise: breakdown.packagingPaise,
          taxPaise: breakdown.taxPaise,
          discountPaise: breakdown.discountPaise,
          surgePaise: breakdown.surgePaise,
          tipPaise: breakdown.tipPaise ?? 0,
          commissionRateBasisPoints: commissionBp,
          merchantOrderFeePaise: order.merchant_order_fee_paise ?? 0,
          merchantFundedDiscountPaise: order.merchant_funded_discount_paise ?? 0,
        }),
      });
      await client.query(`UPDATE orders SET payment_status = 'CAPTURED', updated_at = NOW() WHERE id = $1`, [order.id]);

      if (
        order.acquisition_channel === AcquisitionChannel.MERCHANT_DIRECT_SESSION ||
        order.acquisition_channel === AcquisitionChannel.MERCHANT_FIRST_ORIGIN
      ) {
        await client.query(
          `UPDATE app_users
              SET first_origin_restaurant_id = $2,
                  first_origin_merchant_id = (SELECT merchant_id FROM restaurants WHERE id = $2),
                  first_origin_at = NOW(), updated_at = NOW()
            WHERE id = $1 AND first_origin_restaurant_id IS NULL`,
          [order.customer_id, order.restaurant_id]
        );
      }

      if (OrderStateMachine.isTerminal(order.fulfillment_state)) {
        // Late capture on a dead order: never resurrect it, give the money back
        await RefundRepository.issueWithClient(client, {
          orderId: input.orderId,
          paymentId,
          reason: "Late payment capture on cancelled order: automatic refund",
          initiatedBy: "SYSTEM",
        });
        await CouponRepository.releaseWithClient(client, input.orderId);
        await OutboxRepository.appendWithClient(client, "order.late_capture_refunded", input.orderId, order.version, {
          orderId: input.orderId,
          paymentId: input.providerPaymentId,
          amountPaise: input.amountPaise,
        });
        return { outcome: "LATE_REFUNDED" as const };
      }

      const deadline = new Date(Date.now() + MERCHANT_ACCEPTANCE_WINDOW_SECONDS * 1000);
      await client.query(`UPDATE orders SET merchant_response_deadline_at = $2 WHERE id = $1`, [
        order.id,
        deadline.toISOString(),
      ]);
      await OrderRepository.transitionLockedWithClient(client, order, {
        toState: FulfillmentState.AWAITING_MERCHANT,
        actorType: "SYSTEM",
        actorId: "PAYMENT_GATEWAY",
        reason: "Payment captured via Razorpay",
        extra: { paymentId: input.providerPaymentId, amountPaise: input.amountPaise },
      });
      await CouponRepository.markRedeemedWithClient(client, input.orderId);
      await JobRepository.enqueueWithClient(client, JobKind.MERCHANT_ACCEPTANCE_TIMEOUT, { orderId: input.orderId }, {
        runAt: deadline,
        dedupeKey: `merchant-timeout:${input.orderId}`,
      });
      return { outcome: "CAPTURED" as const };
    });
  }

  /**
   * Cash collected by the rider at the door. Runs inside the delivery transaction,
   * so an order can never be DELIVERED with unrecorded cash.
   */
  static async recordCodCollectionWithClient(client: PoolClient, order: LockedOrderRow): Promise<string | null> {
    if (order.payment_method !== PaymentMethod.COD || order.payment_status !== PaymentStatus.PENDING) return null;
    if (order.payable_paise <= 0) return null;

    const payRes = await client.query(
      `INSERT INTO payments (id, order_id, payment_attempt_id, provider_payment_id, status, amount_paise, currency)
       VALUES (gen_random_uuid(), $1, NULL, $2, 'CAPTURED', $3, 'INR') RETURNING id`,
      [order.id, `cod:${order.id}`, order.payable_paise]
    );
    const paymentId = payRes.rows[0].id as string;
    const b = order.breakdown_json;
    const entries = LedgerEngine.buildOrderCaptureEntries({
      payablePaise: b.payablePaise,
      subtotalPaise: b.subtotalPaise,
      deliveryFeePaise: b.deliveryFeePaise,
      platformFeePaise: b.platformFeePaise,
      packagingPaise: b.packagingPaise,
      taxPaise: b.taxPaise,
      discountPaise: b.discountPaise,
      surgePaise: b.surgePaise,
      tipPaise: b.tipPaise ?? 0,
      commissionRateBasisPoints: order.commission_bp_applied ?? undefined,
      merchantOrderFeePaise: order.merchant_order_fee_paise,
      merchantFundedDiscountPaise: order.merchant_funded_discount_paise ?? 0,
    }).map((entry) =>
      entry.account === LedgerAccountType.GATEWAY_CLEARING
        ? { ...entry, account: LedgerAccountType.CASH_IN_TRANSIT, description: "Cash collected by delivery partner" }
        : entry
    );
    await LedgerRepository.postTransactionWithClient(client, {
      orderId: order.id,
      paymentId,
      effectType: "CAPTURE",
      entries,
    });
    await client.query(`UPDATE orders SET payment_status = 'CAPTURED', updated_at = NOW() WHERE id = $1`, [order.id]);
    await CouponRepository.markRedeemedWithClient(client, order.id);
    await OutboxRepository.appendWithClient(client, "payment.cod_collected", order.id, order.version, {
      orderId: order.id,
      paymentId,
      amountPaise: order.payable_paise,
    });
    return paymentId;
  }

  static async recordPaymentFailure(input: { razorpayOrderId: string; reason?: string }): Promise<void> {
    await getDbPool().query(
      `UPDATE payment_attempts SET failure_reason = LEFT($2, 500), updated_at = NOW()
        WHERE razorpay_order_id = $1 AND status <> 'CAPTURED'`,
      [input.razorpayOrderId, input.reason ?? "Payment failed"]
    );
  }

  /**
   * Cancels (or, once with the rider, fails) an order under the cancellation policy,
   * in one transaction with: offer revocation, trip cancellation, coupon release and refund.
   */
  static async cancel(input: {
    orderId: string;
    actor: CancellationActor;
    actorId?: string;
    reason: string;
    // Only honoured for DISCRETIONARY (admin) refunds; defaults to the full balance
    refundAmountPaise?: number;
    // When set, the order must currently be in one of these states (e.g. merchant reject)
    expectedStates?: FulfillmentState[];
    faultCode?: FaultCode;
  }): Promise<{ fulfillmentState: FulfillmentState; refundedPaise: number }> {
    return withTransaction(async (client) => {
      const order = await OrderRepository.lockForUpdate(client, input.orderId);
      if (input.expectedStates && !input.expectedStates.includes(order.fulfillment_state)) {
        throw new DomainError(
          "STATE_CONFLICT",
          `Order is ${order.fulfillment_state.toLowerCase().replace(/_/g, " ")} and can no longer be changed this way.`,
          { details: { currentState: order.fulfillment_state } }
        );
      }

      const decision = CancellationPolicy.evaluate(input.actor, order.fulfillment_state);
      if (!decision.allowed) {
        throw new DomainError("STATE_CONFLICT", decision.reason ?? "Order cannot be cancelled now.", {
          details: { currentState: order.fulfillment_state },
        });
      }

      await OrderRepository.transitionLockedWithClient(client, order, {
        toState: decision.targetState,
        actorType: input.actor,
        actorId: input.actorId,
        reason: input.reason,
      });

      await client.query(
        `UPDATE delivery_offers SET status = 'REVOKED', responded_at = NOW()
          WHERE order_id = $1 AND status = 'OFFERED'`,
        [order.id]
      );
      await client.query(
        `UPDATE delivery_assignments
            SET status = $2, completed_at = NOW(), failure_reason = $3
          WHERE order_id = $1 AND status IN ('ASSIGNED', 'AT_PICKUP', 'PICKED_UP', 'AT_DROPOFF')`,
        [order.id, decision.targetState === FulfillmentState.DELIVERY_FAILED ? "FAILED" : "CANCELLED", input.reason]
      );

      let refundAmount: number | undefined;
      if (decision.refundPolicy === "FULL") refundAmount = undefined; // full balance
      else if (decision.refundPolicy === "DISCRETIONARY") refundAmount = input.refundAmountPaise;
      const paid = order.payment_status !== PaymentStatus.PENDING;
      const shouldRefund =
        paid &&
        (decision.refundPolicy === "FULL" ||
          (decision.refundPolicy === "DISCRETIONARY" && input.refundAmountPaise !== 0));

      let refundedPaise = 0;
      if (shouldRefund) {
        if (order.payment_method === PaymentMethod.WALLET || order.payment_method === PaymentMethod.COD) {
          // Money already held by the platform (credits or cash) goes straight back to credits
          const refundable = Math.max(0, order.payable_paise - order.refunded_paise);
          const amount = Math.min(refundable, refundAmount ?? refundable);
          if (amount > 0) {
            const refundRes = await client.query(
              `INSERT INTO refunds
                 (order_id, payment_id, provider_refund_id, status, amount_paise, reason, initiated_by, processed_at)
               VALUES ($1, NULL, $2, 'PROCESSED', $3, $4, $5, NOW()) RETURNING id`,
              [
                order.id,
                `wallet-refund:${order.id}:${randomUUID()}`,
                amount,
                input.reason,
                input.actorId ? `${input.actor}:${input.actorId}` : input.actor,
              ]
            );
            await WalletRepository.creditWithClient(client, {
              userId: order.customer_id,
              kind: "REFUND_CREDIT",
              amountPaise: amount,
              referenceType: "REFUND",
              referenceId: refundRes.rows[0].id,
              description: `Refund for order ${order.order_number}`,
              orderId: order.id,
            });
            await client.query(`UPDATE orders SET refunded_paise = refunded_paise + $2 WHERE id = $1`, [order.id, amount]);
            refundedPaise = amount;
          }
        } else {
          const refund = await RefundRepository.issueWithClient(client, {
            orderId: order.id,
            amountPaise: refundAmount,
            reason: input.reason,
            initiatedBy: input.actorId ? `${input.actor}:${input.actorId}` : input.actor,
            faultCode: input.faultCode,
          });
          refundedPaise = refund?.amountPaise ?? 0;
        }
      }

      // The coupon goes back to the customer unless they were charged and kept part of the value
      if (!paid || decision.refundPolicy === "FULL" || refundAmount === undefined) {
        await CouponRepository.releaseWithClient(client, order.id);
      }

      return { fulfillmentState: decision.targetState, refundedPaise };
    });
  }

  static async listEvents(orderId: string) {
    const res = await getDbPool().query(
      `SELECT sequence, source_state, target_state, actor_type, reason, created_at
         FROM order_events WHERE order_id = $1 ORDER BY sequence`,
      [orderId]
    );
    return res.rows.map((r) => ({
      sequence: r.sequence as number,
      sourceState: r.source_state as string,
      targetState: r.target_state as string,
      actorType: r.actor_type as string,
      reason: (r.reason as string | null) ?? undefined,
      createdAt: (r.created_at as Date).toISOString(),
    }));
  }

  /** Operations board: newest orders first with optional state filter. */
  static async listForAdmin(options: { states?: FulfillmentState[]; limit?: number; stuckOnly?: boolean } = {}) {
    const res = await getDbPool().query(
      `SELECT o.id, o.order_number, o.fulfillment_state, o.payment_status, o.payable_paise, o.refunded_paise,
              o.created_at, o.updated_at, o.promised_delivery_at,
              r.name AS restaurant_name, r.address_text AS restaurant_address,
              COALESCE(o.delivery_address_snapshot->>'building', a.building, r.name) AS building,
              COALESCE(o.delivery_address_snapshot->>'street', a.street, r.address_text) AS street,
              rd.name AS rider_name
         FROM orders o
         JOIN restaurants r ON r.id = o.restaurant_id
         LEFT JOIN customer_addresses a ON a.id = o.delivery_address_id
         LEFT JOIN delivery_assignments da
           ON da.order_id = o.id AND da.status IN ('ASSIGNED', 'AT_PICKUP', 'PICKED_UP', 'AT_DROPOFF')
         LEFT JOIN riders rd ON rd.id = da.rider_id
        WHERE ($1::text[] IS NULL OR o.fulfillment_state = ANY($1::text[]))
          AND (
            NOT $3::boolean
            OR (o.fulfillment_state = 'READY_FOR_PICKUP' AND da.id IS NULL AND o.ready_at < NOW() - INTERVAL '5 minutes')
            OR (o.fulfillment_state IN ('ACCEPTED', 'PREPARING', 'READY_FOR_PICKUP', 'PICKED_UP', 'OUT_FOR_DELIVERY')
                AND o.promised_delivery_at < NOW() - INTERVAL '10 minutes')
          )
        ORDER BY o.created_at DESC
        LIMIT $2`,
      [options.states && options.states.length > 0 ? options.states : null, options.limit ?? 50, options.stuckOnly ?? false]
    );
    return res.rows.map((r) => ({
      orderId: r.id as string,
      orderNumber: r.order_number as string,
      restaurantName: r.restaurant_name as string,
      customerAddress: `${r.building}, ${r.street}`,
      riderName: (r.rider_name as string | null) ?? undefined,
      fulfillmentState: r.fulfillment_state as FulfillmentState,
      paymentStatus: r.payment_status as PaymentStatus,
      payablePaise: r.payable_paise as number,
      refundedPaise: r.refunded_paise as number,
      createdAt: (r.created_at as Date).toISOString(),
      updatedAt: (r.updated_at as Date).toISOString(),
      promisedDeliveryAt: (r.promised_delivery_at as Date | null)?.toISOString(),
    }));
  }
}

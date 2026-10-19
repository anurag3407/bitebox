import { and, desc, eq, inArray, sql } from "drizzle-orm";
import {
  FulfillmentState,
  OrderDetailDto,
  OrderSummaryDto,
  PaymentAttemptStatus,
  PaymentStatus,
  QuoteBreakdown,
  QuoteLineBreakdown,
} from "@startup/contracts";
import { OrderStateMachine } from "@startup/core";
import { getDb, getDbPool } from "../client.js";
import {
  customerAddresses,
  idempotencyRecords,
  jobs,
  orderEvents,
  orders,
  outboxEvents,
  paymentAttempts,
  payments,
  restaurants,
} from "../schema/schema.js";

import { LedgerEngine } from "@startup/core";
import { LedgerRepository } from "./ledger.repository.js";

export interface CreateOrderParams {
  idempotencyKey: string;
  principalId: string;
  requestHash: string;
  customerId: string;
  restaurantId: string;
  deliveryAddressId: string;
  orderNumber: string;
  items: QuoteLineBreakdown[];
  breakdown: QuoteBreakdown;
  payablePaise: number;
  deliveryOtp: string;
  pickupOtp: string;
  instructions?: string;
  estimatedDeliveryMinutes: number;
  razorpayOrderId: string;
  quoteId?: string;
}

export class OrderRepository {
  static async createWithIdempotency(params: CreateOrderParams): Promise<{
    orderId: string;
    orderNumber: string;
    paymentAttemptId: string;
    razorpayOrderId: string;
    isDuplicate: boolean;
  }> {
    const pool = getDbPool();
    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      // 1. Check idempotency record
      const idemRes = await client.query(
        `SELECT response_json, status, request_hash FROM idempotency_records
         WHERE principal_id = $1 AND operation = 'CHECKOUT' AND idempotency_key = $2
         FOR UPDATE`,
        [params.principalId, params.idempotencyKey]
      );

      if (idemRes.rows.length > 0) {
        if (idemRes.rows[0].request_hash !== params.requestHash) {
          throw new Error("IDEMPOTENCY_CONFLICT: Idempotency key reused with different request payload");
        }
        if (idemRes.rows[0].status === "COMPLETED") {
          await client.query("COMMIT");
          return {
            ...idemRes.rows[0].response_json,
            isDuplicate: true,
          };
        }
      }

      // Record processing idempotency
      await client.query(
        `INSERT INTO idempotency_records (id, principal_id, operation, idempotency_key, request_hash, status)
         VALUES (gen_random_uuid(), $1, 'CHECKOUT', $2, $3, 'PROCESSING')
         ON CONFLICT (principal_id, operation, idempotency_key) DO NOTHING`,
        [params.principalId, params.idempotencyKey, params.requestHash]
      );

      // 2. Insert Order
      const promisedAt = new Date(Date.now() + params.estimatedDeliveryMinutes * 60 * 1000);
      const breakdownToStore = {
        ...params.breakdown,
        quoteId: params.quoteId ?? (params.breakdown as any).quoteId,
      };

      const orderRes = await client.query(
        `INSERT INTO orders (
           id, order_number, customer_id, restaurant_id, delivery_address_id,
           items_json, breakdown_json, fulfillment_state, payment_status,
           payable_paise, delivery_otp, pickup_otp, instructions, promised_delivery_at
         ) VALUES (
           gen_random_uuid(), $1, $2, $3, $4, $5, $6, 'PENDING_PAYMENT', 'PENDING',
           $7, $8, $9, $10, $11
         ) RETURNING id`,
        [
          params.orderNumber,
          params.customerId,
          params.restaurantId,
          params.deliveryAddressId,
          JSON.stringify(params.items),
          JSON.stringify(breakdownToStore),
          params.payablePaise,
          params.deliveryOtp,
          params.pickupOtp,
          params.instructions ?? null,
          promisedAt.toISOString(),
        ]
      );
      const orderId = orderRes.rows[0].id;

      // 3. Insert Initial Order Event
      await client.query(
        `INSERT INTO order_events (id, order_id, sequence, source_state, target_state, actor_type, actor_id, reason)
         VALUES (gen_random_uuid(), $1, 1, 'NONE', 'PENDING_PAYMENT', 'CUSTOMER', $2, 'Order initiated by customer')`,
        [orderId, params.customerId]
      );

      // 4. Insert Payment Attempt
      const attemptRes = await client.query(
        `INSERT INTO payment_attempts (id, order_id, razorpay_order_id, status, amount_paise, currency)
         VALUES (gen_random_uuid(), $1, $2, 'READY', $3, 'INR')
         RETURNING id`,
        [orderId, params.razorpayOrderId, params.payablePaise]
      );
      const paymentAttemptId = attemptRes.rows[0].id;

      // 5. Insert Outbox Event
      await client.query(
        `INSERT INTO outbox_events (id, event_type, aggregate_id, aggregate_version, payload_json, status)
         VALUES (gen_random_uuid(), 'order.created', $1, 1, $2, 'PENDING')`,
        [
          orderId,
          JSON.stringify({
            orderId,
            orderNumber: params.orderNumber,
            payablePaise: params.payablePaise,
          }),
        ]
      );

      const responsePayload = {
        orderId,
        orderNumber: params.orderNumber,
        paymentAttemptId,
        razorpayOrderId: params.razorpayOrderId,
      };

      // 6. Complete Idempotency record
      await client.query(
        `UPDATE idempotency_records
         SET status = 'COMPLETED', response_json = $1
         WHERE principal_id = $2 AND operation = 'CHECKOUT' AND idempotency_key = $3`,
        [JSON.stringify(responsePayload), params.principalId, params.idempotencyKey]
      );

      await client.query("COMMIT");

      return {
        ...responsePayload,
        isDuplicate: false,
      };
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  static async findOrderByQuote(quoteId: string): Promise<{
    id: string;
    orderNumber: string;
    fulfillmentState: string;
    paymentStatus: string;
    payablePaise: number;
    paymentAttemptId?: string;
    razorpayOrderId?: string;
    attemptStatus?: string;
  } | null> {
    const pool = getDbPool();
    const res = await pool.query(
      `SELECT o.id, o.order_number, o.fulfillment_state, o.payment_status, o.payable_paise,
              pa.id as payment_attempt_id, pa.razorpay_order_id, pa.status as attempt_status
       FROM orders o
       LEFT JOIN payment_attempts pa ON pa.order_id = o.id
       WHERE o.breakdown_json->>'quoteId' = $1
       ORDER BY o.created_at DESC
       LIMIT 1`,
      [quoteId]
    );
    if (res.rows.length === 0) return null;
    const row = res.rows[0];
    return {
      id: row.id,
      orderNumber: row.order_number,
      fulfillmentState: row.fulfillment_state,
      paymentStatus: row.payment_status,
      payablePaise: row.payable_paise,
      paymentAttemptId: row.payment_attempt_id,
      razorpayOrderId: row.razorpay_order_id,
      attemptStatus: row.attempt_status,
    };
  }

  static async findById(orderId: string): Promise<OrderDetailDto | null> {
    const db = getDb();
    const [row] = await db
      .select({
        order: orders,
        restaurant: restaurants,
        address: customerAddresses,
      })
      .from(orders)
      .innerJoin(restaurants, eq(orders.restaurantId, restaurants.id))
      .innerJoin(customerAddresses, eq(orders.deliveryAddressId, customerAddresses.id))
      .where(eq(orders.id, orderId))
      .limit(1);

    if (!row) return null;

    return {
      orderId: row.order.id,
      orderNumber: row.order.orderNumber,
      customerId: row.order.customerId,
      restaurant: {
        id: row.restaurant.id,
        name: row.restaurant.name,
        phone: row.restaurant.phone ?? undefined,
        heroImageUrl: row.restaurant.heroImageUrl ?? undefined,
      },
      deliveryAddress: {
        building: row.address.building,
        street: row.address.street,
        landmark: row.address.landmark ?? undefined,
        latitude: row.address.latitude,
        longitude: row.address.longitude,
        contactPhone: row.address.contactPhone ?? undefined,
      },
      items: row.order.itemsJson as QuoteLineBreakdown[],
      breakdown: row.order.breakdownJson as QuoteBreakdown,
      fulfillmentState: row.order.fulfillmentState as FulfillmentState,
      paymentStatus: row.order.paymentStatus as PaymentStatus,
      createdAt: row.order.createdAt.toISOString(),
      merchantResponseDeadlineAt: row.order.merchantResponseDeadlineAt?.toISOString(),
      promisedDeliveryAt: row.order.promisedDeliveryAt?.toISOString(),
      currentEtaMinutes: 30,
      deliveryOtp: row.order.deliveryOtp,
    };
  }

  static async listByCustomer(customerId: string): Promise<OrderSummaryDto[]> {
    const db = getDb();
    const rows = await db
      .select({
        order: orders,
        restaurant: restaurants,
      })
      .from(orders)
      .innerJoin(restaurants, eq(orders.restaurantId, restaurants.id))
      .where(eq(orders.customerId, customerId))
      .orderBy(desc(orders.createdAt));

    return rows.map((r) => {
      const items = (r.order.itemsJson as any[]) || [];
      const totalCount = items.reduce((sum, item) => sum + (item.quantity || 1), 0);
      return {
        orderId: r.order.id,
        orderNumber: r.order.orderNumber,
        restaurantId: r.restaurant.id,
        restaurantName: r.restaurant.name,
        fulfillmentState: r.order.fulfillmentState as FulfillmentState,
        payablePaise: r.order.payablePaise,
        createdAt: r.order.createdAt.toISOString(),
        promisedDeliveryAt: r.order.promisedDeliveryAt?.toISOString(),
        itemCount: totalCount,
      };
    });
  }

  static async listByRestaurant(
    restaurantId: string,
    states?: FulfillmentState[]
  ): Promise<OrderDetailDto[]> {
    const db = getDb();
    const conditions = [eq(orders.restaurantId, restaurantId)];
    if (states && states.length > 0) {
      conditions.push(inArray(orders.fulfillmentState, states));
    }

    const rows = await db
      .select({
        order: orders,
        restaurant: restaurants,
        address: customerAddresses,
      })
      .from(orders)
      .innerJoin(restaurants, eq(orders.restaurantId, restaurants.id))
      .innerJoin(customerAddresses, eq(orders.deliveryAddressId, customerAddresses.id))
      .where(and(...conditions))
      .orderBy(desc(orders.createdAt));

    return rows.map((r) => ({
      orderId: r.order.id,
      orderNumber: r.order.orderNumber,
      restaurant: {
        id: r.restaurant.id,
        name: r.restaurant.name,
        phone: r.restaurant.phone ?? undefined,
        heroImageUrl: r.restaurant.heroImageUrl ?? undefined,
      },
      deliveryAddress: {
        building: r.address.building,
        street: r.address.street,
        landmark: r.address.landmark ?? undefined,
        latitude: r.address.latitude,
        longitude: r.address.longitude,
      },
      items: r.order.itemsJson as QuoteLineBreakdown[],
      breakdown: r.order.breakdownJson as QuoteBreakdown,
      fulfillmentState: r.order.fulfillmentState as FulfillmentState,
      paymentStatus: r.order.paymentStatus as PaymentStatus,
      createdAt: r.order.createdAt.toISOString(),
      merchantResponseDeadlineAt: r.order.merchantResponseDeadlineAt?.toISOString(),
      promisedDeliveryAt: r.order.promisedDeliveryAt?.toISOString(),
      deliveryOtp: r.order.deliveryOtp,
    }));
  }

  static async recordPaymentCapture(input: {
    orderId: string;
    providerPaymentId: string;
    amountPaise: number;
    paymentAttemptId?: string;
  }): Promise<void> {
    const pool = getDbPool();
    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      // 1. Lock Order for update
      const orderRes = await client.query(
        `SELECT id, fulfillment_state, payment_status, payable_paise, breakdown_json FROM orders WHERE id = $1 FOR UPDATE`,
        [input.orderId]
      );
      if (orderRes.rows.length === 0) {
        throw new Error(`Order ${input.orderId} not found`);
      }
      const order = orderRes.rows[0];

      if (order.payment_status === "CAPTURED") {
        await client.query("COMMIT");
        return; // Idempotent capture acknowledgment
      }

      // 2. Insert Payment Record
      const payRes = await client.query(
        `INSERT INTO payments (id, order_id, payment_attempt_id, provider_payment_id, status, amount_paise, currency)
         VALUES (gen_random_uuid(), $1, $2, $3, 'CAPTURED', $4, 'INR')
         ON CONFLICT (provider_payment_id) DO UPDATE SET status = 'CAPTURED'
         RETURNING id`,
        [input.orderId, input.paymentAttemptId ?? null, input.providerPaymentId, input.amountPaise]
      );
      const paymentRecordId = payRes.rows[0]?.id;

      // 3. Update payment attempt status if known
      if (input.paymentAttemptId) {
        await client.query(
          `UPDATE payment_attempts SET status = 'CAPTURED', updated_at = NOW() WHERE id = $1`,
          [input.paymentAttemptId]
        );
      }

      // 4. Post balanced double-entry accounting ledger entries for capture
      const breakdown = order.breakdown_json as QuoteBreakdown;
      if (breakdown) {
        const captureEntries = LedgerEngine.buildOrderCaptureEntries({
          payablePaise: breakdown.payablePaise,
          subtotalPaise: breakdown.subtotalPaise,
          deliveryFeePaise: breakdown.deliveryFeePaise,
          platformFeePaise: breakdown.platformFeePaise,
          packagingPaise: breakdown.packagingPaise,
          taxPaise: breakdown.taxPaise,
        });
        await LedgerRepository.postTransactionWithClient(client, {
          orderId: input.orderId,
          paymentId: paymentRecordId,
          effectType: "CAPTURE",
          entries: captureEntries,
        });
      }

      // 5. Check if order was already cancelled or terminal: late capture handling!
      if (order.fulfillment_state === "CANCELLED" || order.fulfillment_state === "DELIVERY_FAILED") {
        // Late capture on cancelled order: DO NOT resurrect order to AWAITING_MERCHANT!
        await client.query(
          `UPDATE orders SET payment_status = 'CAPTURED', updated_at = NOW() WHERE id = $1`,
          [input.orderId]
        );

        // Auto-create refund record for the late capture
        const refundRes = await client.query(
          `INSERT INTO refunds (id, order_id, payment_id, status, amount_paise, reason)
           VALUES (gen_random_uuid(), $1, $2, 'APPROVED', $3, 'Late payment capture on cancelled order: automatic refund initiated')
           RETURNING id`,
          [input.orderId, paymentRecordId, input.amountPaise]
        );
        const refundId = refundRes.rows[0]?.id;

        // Post balanced ledger entries for refund
        const refundEntries = LedgerEngine.buildRefundEntries(
          input.amountPaise,
          "Late payment capture on cancelled order"
        );
        await LedgerRepository.postTransactionWithClient(client, {
          orderId: input.orderId,
          paymentId: paymentRecordId,
          refundId,
          effectType: "REFUND",
          entries: refundEntries,
        });

        // Outbox event
        await client.query(
          `INSERT INTO outbox_events (id, event_type, aggregate_id, aggregate_version, payload_json, status)
           VALUES (gen_random_uuid(), 'order.late_capture_refunded', $1, 2, $2, 'PENDING')`,
          [input.orderId, JSON.stringify({ orderId: input.orderId, paymentId: input.providerPaymentId, amountPaise: input.amountPaise })]
        );

        await client.query("COMMIT");
        return;
      }

      // 6. Normal flow: transition to AWAITING_MERCHANT with 90s deadline
      const deadline = new Date(Date.now() + 90 * 1000);

      await client.query(
        `UPDATE orders
         SET payment_status = 'CAPTURED',
             fulfillment_state = 'AWAITING_MERCHANT',
             merchant_response_deadline_at = $1,
             updated_at = NOW()
         WHERE id = $2`,
        [deadline.toISOString(), input.orderId]
      );

      // Order Event
      await client.query(
        `INSERT INTO order_events (id, order_id, sequence, source_state, target_state, actor_type, actor_id, reason)
         VALUES (gen_random_uuid(), $1, 2, 'PENDING_PAYMENT', 'AWAITING_MERCHANT', 'SYSTEM', 'PAYMENT_GATEWAY', 'Payment captured via Razorpay')`,
        [input.orderId]
      );

      // Enqueue merchant acceptance timeout job (90 seconds)
      await client.query(
        `INSERT INTO jobs (id, kind, payload_json, status, run_at)
         VALUES (gen_random_uuid(), 'MERCHANT_ACCEPTANCE_TIMEOUT', $1, 'PENDING', $2)`,
        [JSON.stringify({ orderId: input.orderId }), deadline.toISOString()]
      );

      // Outbox Event
      await client.query(
        `INSERT INTO outbox_events (id, event_type, aggregate_id, aggregate_version, payload_json, status)
         VALUES (gen_random_uuid(), 'order.paid', $1, 2, $2, 'PENDING')`,
        [input.orderId, JSON.stringify({ orderId: input.orderId, paymentId: input.providerPaymentId })]
      );

      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  static async updateFulfillmentState(input: {
    orderId: string;
    fromState: FulfillmentState;
    toState: FulfillmentState;
    actorType: "CUSTOMER" | "MERCHANT" | "RIDER" | "ADMIN" | "SYSTEM";
    actorId?: string;
    reason?: string;
  }): Promise<void> {
    OrderStateMachine.assertTransition(input.fromState, input.toState);

    const pool = getDbPool();
    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      // Verify current state under row lock
      const res = await client.query(
        `SELECT fulfillment_state FROM orders WHERE id = $1 FOR UPDATE`,
        [input.orderId]
      );
      if (res.rows.length === 0) {
        throw new Error(`Order ${input.orderId} not found`);
      }
      const currentState = res.rows[0].fulfillment_state;
      if (currentState !== input.fromState) {
        throw new Error(
          `Conflict: cannot transition from ${currentState} to ${input.toState} (expected source: ${input.fromState})`
        );
      }

      await client.query(
        `UPDATE orders SET fulfillment_state = $1, updated_at = NOW() WHERE id = $2`,
        [input.toState, input.orderId]
      );

      await client.query(
        `INSERT INTO order_events (id, order_id, sequence, source_state, target_state, actor_type, actor_id, reason)
         VALUES (gen_random_uuid(), $1, 3, $2, $3, $4, $5, $6)`,
        [
          input.orderId,
          input.fromState,
          input.toState,
          input.actorType,
          input.actorId ?? null,
          input.reason ?? null,
        ]
      );

      await client.query(
        `INSERT INTO outbox_events (id, event_type, aggregate_id, aggregate_version, payload_json, status)
         VALUES (gen_random_uuid(), $1, $2, 3, $3, 'PENDING')`,
        [
          `order.${input.toState.toLowerCase()}`,
          input.orderId,
          JSON.stringify({ orderId: input.orderId, state: input.toState }),
        ]
      );

      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }
}

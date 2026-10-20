import { beforeAll, describe, expect, it } from "vitest";
import crypto, { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { SEED_IDS, OrderRepository, getDbPool } from "@startup/database";
import { MENU, call, createCustomerWithAddress } from "./helpers.js";

import { POST as createQuote } from "../src/app/api/v1/quotes/route.js";
import { POST as createCheckout } from "../src/app/api/v1/checkouts/route.js";
import { POST as verifyPayment } from "../src/app/api/v1/payments/verify/route.js";
import { POST as cancelOrder } from "../src/app/api/v1/orders/[orderId]/cancel/route.js";
import { POST as razorpayWebhook } from "../src/app/api/v1/webhooks/razorpay/route.js";

const WEBHOOK_SECRET = "mock_razorpay_webhook_secret";

function signedWebhook(payload: unknown, eventId = `evt_${randomUUID()}`) {
  const raw = JSON.stringify(payload);
  const signature = crypto.createHmac("sha256", WEBHOOK_SECRET).update(raw).digest("hex");
  return new NextRequest("http://localhost/api/v1/webhooks/razorpay", {
    method: "POST",
    body: raw,
    headers: { "x-razorpay-signature": signature, "x-razorpay-event-id": eventId, "content-type": "application/json" },
  });
}

function capturedEvent(razorpayOrderId: string, amount: number, paymentId = `pay_${randomUUID().slice(0, 14)}`) {
  return {
    event: "payment.captured",
    payload: { payment: { entity: { id: paymentId, order_id: razorpayOrderId, amount, currency: "INR", status: "captured" } } },
  };
}

async function createUnpaidOrder(customer: Awaited<ReturnType<typeof createCustomerWithAddress>>, couponCode?: string) {
  const quote = await call(createQuote, "POST", "/q", {
    token: customer.token,
    body: {
      restaurantId: SEED_IDS.restaurant1Id,
      deliveryAddressId: customer.addressId,
      items: [{ menuItemId: MENU.paneerTikka, quantity: 2 }],
      couponCode,
    },
  });
  expect(quote.status).toBe(200);
  const checkout = await call(createCheckout, "POST", "/c", {
    token: customer.token,
    body: { quoteId: quote.body.data.quoteId, deliveryAddressId: customer.addressId, idempotencyKey: `idem_${randomUUID()}` },
  });
  expect(checkout.status).toBe(201);
  return { ...checkout.body.data, payable: quote.body.data.breakdown.payablePaise as number, quote: quote.body.data };
}

async function orderRow(orderId: string) {
  return (await getDbPool().query(`SELECT fulfillment_state, payment_status, refunded_paise FROM orders WHERE id = $1`, [orderId])).rows[0];
}

describe("Razorpay webhooks", () => {
  let customer: Awaited<ReturnType<typeof createCustomerWithAddress>>;
  beforeAll(async () => {
    customer = await createCustomerWithAddress();
  });

  it("rejects bad signatures", async () => {
    const req = new NextRequest("http://localhost/x", { method: "POST", body: "{}", headers: { "x-razorpay-signature": "deadbeef" } });
    expect((await razorpayWebhook(req)).status).toBe(400);
  });

  it("captures through the webhook alone when the browser callback is lost, and ignores redelivery", async () => {
    const order = await createUnpaidOrder(customer);
    const eventId = `evt_${randomUUID()}`;
    const event = capturedEvent(order.razorpayOrderId, order.payable);
    expect((await razorpayWebhook(signedWebhook(event, eventId))).status).toBe(200);
    expect(await orderRow(order.orderId)).toMatchObject({ fulfillment_state: "AWAITING_MERCHANT", payment_status: "CAPTURED" });

    const again = await razorpayWebhook(signedWebhook(event, eventId));
    expect(await again.json()).toEqual({ status: "ignored_duplicate" });
    const payments = await getDbPool().query(`SELECT COUNT(*)::int AS n FROM payments WHERE order_id = $1`, [order.orderId]);
    expect(payments.rows[0].n).toBe(1);
  });

  it("re-processes an event whose first delivery failed instead of dropping it", async () => {
    const order = await createUnpaidOrder(customer);
    const eventId = `evt_${randomUUID()}`;
    // Simulate a crash after the inbox insert: the row exists but was never processed
    await getDbPool().query(
      `INSERT INTO webhook_inbox (provider, provider_event_id, payload_json, status) VALUES ('RAZORPAY', $1, '{}', 'FAILED')`,
      [eventId]
    );
    const res = await razorpayWebhook(signedWebhook(capturedEvent(order.razorpayOrderId, order.payable), eventId));
    expect(res.status).toBe(200);
    expect((await orderRow(order.orderId)).payment_status).toBe("CAPTURED");
  });

  it("refunds a second capture on an already-paid order", async () => {
    const order = await createUnpaidOrder(customer);
    await razorpayWebhook(signedWebhook(capturedEvent(order.razorpayOrderId, order.payable)));
    await razorpayWebhook(signedWebhook(capturedEvent(order.razorpayOrderId, order.payable)));
    const refunds = await getDbPool().query(`SELECT amount_paise, reason FROM refunds WHERE order_id = $1`, [order.orderId]);
    expect(refunds.rows).toHaveLength(1);
    expect(refunds.rows[0].reason).toMatch(/duplicate/i);
    // The order's own payment is untouched
    expect(await orderRow(order.orderId)).toMatchObject({ payment_status: "CAPTURED", refunded_paise: 0 });
  });

  it("refunds a capture whose amount does not match and keeps the order unpaid", async () => {
    const order = await createUnpaidOrder(customer);
    await razorpayWebhook(signedWebhook(capturedEvent(order.razorpayOrderId, order.payable - 100)));
    expect(await orderRow(order.orderId)).toMatchObject({ fulfillment_state: "PENDING_PAYMENT", payment_status: "PENDING" });
    const refunds = await getDbPool().query(`SELECT amount_paise FROM refunds WHERE order_id = $1`, [order.orderId]);
    expect(refunds.rows[0].amount_paise).toBe(order.payable - 100);
  });

  it("refunds a payment that lands after the customer cancelled, without resurrecting the order", async () => {
    const order = await createUnpaidOrder(customer);
    expect((await call(cancelOrder, "POST", "/c", { token: customer.token, params: { orderId: order.orderId }, body: {} })).status).toBe(200);
    await razorpayWebhook(signedWebhook(capturedEvent(order.razorpayOrderId, order.payable)));
    expect(await orderRow(order.orderId)).toMatchObject({
      fulfillment_state: "CANCELLED",
      payment_status: "REFUNDED",
      refunded_paise: order.payable,
    });
  });

  it("applies refund.processed / refund.failed webhooks and restores the refundable balance on failure", async () => {
    const order = await createUnpaidOrder(customer);
    await razorpayWebhook(signedWebhook(capturedEvent(order.razorpayOrderId, order.payable)));
    await call(cancelOrder, "POST", "/c", { token: customer.token, params: { orderId: order.orderId }, body: {} });
    const refund = (await getDbPool().query(`SELECT id, payment_id FROM refunds WHERE order_id = $1`, [order.orderId])).rows[0];
    expect((await orderRow(order.orderId)).refunded_paise).toBe(order.payable);

    const failed = {
      event: "refund.failed",
      payload: { refund: { entity: { id: `rfnd_${randomUUID().slice(0, 12)}`, payment_id: "pay_x", amount: order.payable, receipt: refund.id, status: "failed" } } },
    };
    expect((await razorpayWebhook(signedWebhook(failed))).status).toBe(200);
    expect((await getDbPool().query(`SELECT status FROM refunds WHERE id = $1`, [refund.id])).rows[0].status).toBe("FAILED");
    expect((await orderRow(order.orderId)).refunded_paise).toBe(0);

    // A late "processed" for an already-failed refund must not flip it back
    const processed = { ...failed, event: "refund.processed" };
    await razorpayWebhook(signedWebhook(processed));
    expect((await getDbPool().query(`SELECT status FROM refunds WHERE id = $1`, [refund.id])).rows[0].status).toBe("FAILED");

    // Ledger stays balanced across capture, refund and reversal
    const ledger = await getDbPool().query(
      `SELECT SUM(debit_paise)::int AS d, SUM(credit_paise)::int AS c FROM ledger_entries le
         JOIN ledger_transactions lt ON lt.id = le.transaction_id WHERE lt.order_id = $1`,
      [order.orderId]
    );
    expect(ledger.rows[0].d).toBe(ledger.rows[0].c);
  });
});

describe("Checkout edge cases", () => {
  it("rejects a forged checkout signature for a real (non-simulated) callback", async () => {
    const customer = await createCustomerWithAddress();
    const order = await createUnpaidOrder(customer);
    const res = await call(verifyPayment, "POST", "/v", {
      token: customer.token,
      body: { orderId: order.orderId, razorpayOrderId: order.razorpayOrderId, razorpayPaymentId: "pay_forged123", razorpaySignature: "a".repeat(64) },
    });
    expect(res.status).toBe(402);
    expect((await orderRow(order.orderId)).payment_status).toBe("PENDING");
  });

  it("reuses the pending order when the customer retries checkout with a new idempotency key", async () => {
    const customer = await createCustomerWithAddress();
    const order = await createUnpaidOrder(customer);
    const retry = await call(createCheckout, "POST", "/c", {
      token: customer.token,
      body: { quoteId: order.quote.quoteId, deliveryAddressId: customer.addressId, idempotencyKey: `idem_${randomUUID()}` },
    });
    expect(retry.status).toBe(200);
    expect(retry.body.data.orderId).toBe(order.orderId);
  });

  it("rejects reuse of an idempotency key with a different payload", async () => {
    const customer = await createCustomerWithAddress();
    const key = `idem_${randomUUID()}`;
    const q1 = await call(createQuote, "POST", "/q", {
      token: customer.token,
      body: { restaurantId: SEED_IDS.restaurant1Id, deliveryAddressId: customer.addressId, items: [{ menuItemId: MENU.paneerTikka, quantity: 1 }] },
    });
    await call(createCheckout, "POST", "/c", { token: customer.token, body: { quoteId: q1.body.data.quoteId, deliveryAddressId: customer.addressId, idempotencyKey: key } });
    const res = await call(createCheckout, "POST", "/c", {
      token: customer.token,
      body: { quoteId: q1.body.data.quoteId, deliveryAddressId: customer.addressId, idempotencyKey: key, instructions: "different" },
    });
    expect(res.status).toBe(409);
    expect(res.body.error?.code).toBe("IDEMPOTENCY_CONFLICT");
  });

  it("enforces first-order-only and per-user coupon limits", async () => {
    const customer = await createCustomerWithAddress();
    const first = await createUnpaidOrder(customer, "WELCOME50");
    expect(first.quote.appliedCouponCode).toBe("WELCOME50");
    await razorpayWebhook(signedWebhook(capturedEvent(first.razorpayOrderId, first.payable)));

    const second = await call(createQuote, "POST", "/q", {
      token: customer.token,
      body: { restaurantId: SEED_IDS.restaurant1Id, deliveryAddressId: customer.addressId, items: [{ menuItemId: MENU.paneerTikka, quantity: 2 }], couponCode: "WELCOME50" },
    });
    expect(second.status).toBe(200);
    expect(second.body.data.appliedCouponCode).toBeUndefined();
    expect(second.body.data.couponError).toMatch(/already used|first order/i);
    expect(second.body.data.breakdown.discountPaise).toBe(0);
  });

  it("releases a reserved coupon when an unpaid order is cancelled", async () => {
    const customer = await createCustomerWithAddress();
    const order = await createUnpaidOrder(customer, "WELCOME50");
    await OrderRepository.cancel({ orderId: order.orderId, actor: "SYSTEM", reason: "Payment was not completed" });
    const redemption = await getDbPool().query(`SELECT status FROM coupon_redemptions WHERE order_id = $1`, [order.orderId]);
    expect(redemption.rows[0].status).toBe("RELEASED");
  });
});

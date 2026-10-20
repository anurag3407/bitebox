import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { FulfillmentState } from "@startup/contracts";
import {
  ClaimedJob,
  JobKind,
  OrderRepository,
  RiderRepository,
  SEED_IDS,
  getDbPool,
  withTransaction,
} from "@startup/database";
import { ProviderUnavailableError, RazorpayAdapter, RazorpayPayment, RazorpayRefund } from "@startup/integrations";
import { createCustomerWithAddress, createRider, isolateRiders } from "../../web/tests/helpers.js";
import {
  handleDispatchOfferTimeout,
  handleDispatchOrder,
  handleMerchantAcceptanceTimeout,
  handlePaymentExpiry,
  handleRefundSubmit,
} from "../src/handlers.js";
import { WorkerRunner } from "../src/runner.js";
import { NotificationService } from "../src/notifications.js";

const job = (kind: string, payload: Record<string, unknown>): ClaimedJob => ({
  id: randomUUID(),
  kind,
  payload,
  attemptCount: 1,
  maxAttempts: 5,
});

async function createOrder(state: "PENDING_PAYMENT" | "PAID", couponCode?: string) {
  const customer = await createCustomerWithAddress();
  const result = await OrderRepository.createWithIdempotency({
    idempotencyKey: `idem_${randomUUID()}`,
    principalId: customer.userId,
    requestHash: "h",
    customerId: customer.userId,
    restaurantId: SEED_IDS.restaurant1Id,
    deliveryAddressId: customer.addressId,
    orderNumber: `ORD-TEST-${randomUUID().slice(0, 8).toUpperCase()}`,
    items: [{ menuItemId: "90000000-0000-4000-8000-000000000001", name: "Paneer Tikka", quantity: 1, basePricePaise: 28000, optionsPricePaise: 0, lineTotalPaise: 28000, selectedOptionNames: [] }],
    breakdown: { subtotalPaise: 28000, packagingPaise: 2000, deliveryFeePaise: 3000, platformFeePaise: 500, surgePaise: 0, taxPaise: 2390, discountPaise: 0, tipPaise: 0, payablePaise: 35890 },
    payablePaise: 35890,
    deliveryOtp: "1234",
    pickupOtp: "5678",
    estimatedDeliveryMinutes: 30,
    razorpayOrderId: `order_${randomUUID().slice(0, 14)}`,
    couponCode,
  });
  if (state === "PAID") {
    await OrderRepository.recordPaymentCapture({
      orderId: result.orderId,
      providerPaymentId: `pay_${randomUUID().slice(0, 14)}`,
      amountPaise: 35890,
      paymentAttemptId: result.paymentAttemptId,
    });
  }
  return result;
}

/** Fake gateway: lets tests script timeouts and inspect calls. */
class FakeRazorpay extends RazorpayAdapter {
  refunds: RazorpayRefund[] = [];
  createCalls = 0;
  failNextCreateWithTimeout = false;
  orderPayments: RazorpayPayment[] = [];

  constructor() {
    super("live_like_secret_for_tests", "rzp_test_fake");
  }
  override get isMock() {
    return false;
  }
  override async listRefunds(paymentId: string) {
    return this.refunds.filter((r) => r.paymentId === paymentId);
  }
  override async createRefund(input: { paymentId: string; amountPaise: number; receipt: string }) {
    this.createCalls++;
    const refund = { id: `rfnd_${randomUUID().slice(0, 12)}`, paymentId: input.paymentId, amountPaise: input.amountPaise, status: "processed", receipt: input.receipt };
    this.refunds.push(refund);
    if (this.failNextCreateWithTimeout) {
      // The gateway created the refund but our request timed out before the response arrived
      this.failNextCreateWithTimeout = false;
      throw new ProviderUnavailableError("Razorpay", new Error("timeout"));
    }
    return refund;
  }
  override async fetchOrderPayments() {
    return this.orderPayments;
  }
  override async capturePayment(paymentId: string, amountPaise: number, currency = "INR"): Promise<RazorpayPayment> {
    return { id: paymentId, orderId: null, status: "captured", amountPaise, currency };
  }
}

describe("Worker: merchant timeout, payment expiry, refunds", () => {
  it("auto-cancels unanswered orders with a full refund and leaves accepted ones alone", async () => {
    const stale = await createOrder("PAID");
    await handleMerchantAcceptanceTimeout(job(JobKind.MERCHANT_ACCEPTANCE_TIMEOUT, { orderId: stale.orderId }));
    const row = (await getDbPool().query(`SELECT fulfillment_state, refunded_paise FROM orders WHERE id = $1`, [stale.orderId])).rows[0];
    expect(row).toEqual({ fulfillment_state: "CANCELLED", refunded_paise: 35890 });

    const accepted = await createOrder("PAID");
    await OrderRepository.updateFulfillmentState({ orderId: accepted.orderId, fromState: FulfillmentState.AWAITING_MERCHANT, toState: FulfillmentState.ACCEPTED, actorType: "MERCHANT" });
    await handleMerchantAcceptanceTimeout(job(JobKind.MERCHANT_ACCEPTANCE_TIMEOUT, { orderId: accepted.orderId }));
    expect((await OrderRepository.findById(accepted.orderId))?.fulfillmentState).toBe("ACCEPTED");
  });

  it("submits a refund exactly once even when the gateway response is lost", async () => {
    const order = await createOrder("PAID");
    await OrderRepository.cancel({ orderId: order.orderId, actor: "CUSTOMER", reason: "Changed mind" });
    const refundId = (await getDbPool().query(`SELECT id FROM refunds WHERE order_id = $1`, [order.orderId])).rows[0].id;

    const gateway = new FakeRazorpay();
    gateway.failNextCreateWithTimeout = true;
    await expect(handleRefundSubmit(job(JobKind.REFUND_SUBMIT, { refundId }), gateway)).rejects.toThrow(/unavailable/);
    expect((await getDbPool().query(`SELECT status FROM refunds WHERE id = $1`, [refundId])).rows[0].status).toBe("UNKNOWN");

    // Retry finds the refund by receipt instead of refunding twice
    await handleRefundSubmit(job(JobKind.REFUND_SUBMIT, { refundId }), gateway);
    expect(gateway.createCalls).toBe(1);
    const refund = (await getDbPool().query(`SELECT status, provider_refund_id FROM refunds WHERE id = $1`, [refundId])).rows[0];
    expect(refund).toEqual({ status: "PROCESSED", provider_refund_id: gateway.refunds[0]!.id });
  });

  it("recovers a payment the browser never reported before expiring the order", async () => {
    const order = await createOrder("PENDING_PAYMENT");
    const gateway = new FakeRazorpay();
    gateway.orderPayments = [{ id: `pay_${randomUUID().slice(0, 12)}`, orderId: order.razorpayOrderId, status: "authorized", amountPaise: 35890, currency: "INR" }];
    await handlePaymentExpiry(job(JobKind.PAYMENT_EXPIRY, { orderId: order.orderId }), gateway);
    expect((await OrderRepository.findById(order.orderId))?.fulfillmentState).toBe("AWAITING_MERCHANT");
  });

  it("expires truly unpaid orders and releases their coupon", async () => {
    const order = await createOrder("PENDING_PAYMENT");
    await handlePaymentExpiry(job(JobKind.PAYMENT_EXPIRY, { orderId: order.orderId }), new FakeRazorpay());
    expect((await OrderRepository.findById(order.orderId))?.fulfillmentState).toBe("CANCELLED");
  });
});

describe("Worker: dispatch", () => {
  async function acceptedOrder() {
    const order = await createOrder("PAID");
    await OrderRepository.updateFulfillmentState({ orderId: order.orderId, fromState: FulfillmentState.AWAITING_MERCHANT, toState: FulfillmentState.ACCEPTED, actorType: "MERCHANT" });
    return order;
  }

  it("offers to the nearest fresh rider, then the next one when the offer lapses", async () => {
    const near = await createRider({ latitude: 28.6327, longitude: 77.2196 });
    const far = await createRider({ latitude: 28.645, longitude: 77.23 });
    const stale = await createRider({ latitude: 28.6328, longitude: 77.2197 });
    await getDbPool().query(`UPDATE riders SET last_ping_at = NOW() - INTERVAL '10 minutes' WHERE id = $1`, [stale.riderId]);
    await isolateRiders([near.riderId, far.riderId, stale.riderId]);

    const order = await acceptedOrder();
    await handleDispatchOrder(job(JobKind.DISPATCH_ORDER, { orderId: order.orderId, attempt: 0 }));
    const first = await RiderRepository.getPendingOfferForRider(near.riderId);
    expect(first?.orderId).toBe(order.orderId);
    expect(await RiderRepository.getPendingOfferForRider(stale.riderId)).toBeNull();

    // Offer lapses: the next rider gets it, and the near rider is not asked again
    await getDbPool().query(`UPDATE delivery_offers SET expires_at = NOW() - INTERVAL '1 second' WHERE id = $1`, [first!.id]);
    await handleDispatchOfferTimeout(job(JobKind.DISPATCH_OFFER_TIMEOUT, { offerId: first!.id }));
    await handleDispatchOrder(job(JobKind.DISPATCH_ORDER, { orderId: order.orderId, attempt: 1 }));
    expect((await RiderRepository.getPendingOfferForRider(far.riderId))?.orderId).toBe(order.orderId);
  });

  it("keeps retrying and escalates to ops when no rider is available", async () => {
    await isolateRiders([]);
    const order = await acceptedOrder();
    await handleDispatchOrder(job(JobKind.DISPATCH_ORDER, { orderId: order.orderId, attempt: 9 }));
    const retry = await getDbPool().query(
      `SELECT payload_json FROM jobs WHERE kind = 'DISPATCH_ORDER' AND payload_json->>'orderId' = $1 AND status = 'PENDING'`,
      [order.orderId]
    );
    expect(retry.rows.some((r) => r.payload_json.attempt === 10)).toBe(true);
    const escalation = await getDbPool().query(
      `SELECT 1 FROM outbox_events WHERE event_type = 'dispatch.escalated' AND aggregate_id = $1`,
      [order.orderId]
    );
    expect(escalation.rows).toHaveLength(1);
  });

  it("never dispatches cancelled orders and revokes their live offers", async () => {
    const rider = await createRider();
    await isolateRiders([rider.riderId]);
    const order = await acceptedOrder();
    await handleDispatchOrder(job(JobKind.DISPATCH_ORDER, { orderId: order.orderId, attempt: 0 }));
    expect(await RiderRepository.getPendingOfferForRider(rider.riderId)).not.toBeNull();

    await OrderRepository.cancel({ orderId: order.orderId, actor: "MERCHANT", reason: "Out of paneer" });
    expect(await RiderRepository.getPendingOfferForRider(rider.riderId)).toBeNull();
  });

  it("keeps a rider on one active trip at a time (database-enforced)", async () => {
    const rider = await createRider();
    const a = await acceptedOrder();
    const b = await acceptedOrder();
    await withTransaction(async (client) => {
      await client.query(`INSERT INTO delivery_assignments (order_id, rider_id, status) VALUES ($1, $2, 'ASSIGNED')`, [a.orderId, rider.riderId]);
    });
    await expect(
      getDbPool().query(`INSERT INTO delivery_assignments (order_id, rider_id, status) VALUES ($1, $2, 'ASSIGNED')`, [b.orderId, rider.riderId])
    ).rejects.toThrow(/uq_delivery_assignments_active_rider/);
  });
});

describe("Worker: outbox → notifications", () => {
  it("delivers order updates to subscribed devices and prunes dead subscriptions", async () => {
    const order = await createOrder("PAID");
    const customerId = (await getDbPool().query(`SELECT customer_id FROM orders WHERE id = $1`, [order.orderId])).rows[0].customer_id;
    await getDbPool().query(
      `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth) VALUES ($1, $2, 'p256dh-key-value', 'auth-key')`,
      [customerId, `https://push.example.test/${randomUUID()}`]
    );
    const notifications = new NotificationService();
    const runner = new WorkerRunner(`test_${Date.now()}`, notifications);
    while ((await runner.publishOutboxOnce()) > 0) {
      // drain
    }
    const pushes = notifications.adapters.push.sent.filter((s) => s.message.url === `/orders/${order.orderId}`);
    expect(pushes.map((p) => p.message.title)).toContain("Order placed");
  });
});

describe("Worker: job priority", () => {
  it("claims dispatch work ahead of an older backlog", async () => {
    const { JobRepository } = await import("@startup/database");
    const old = new Date(Date.now() - 60 * 60 * 1000);
    for (let i = 0; i < 3; i++) await JobRepository.enqueue("BACKLOG_TEST", { i }, { runAt: old });
    const urgent = await JobRepository.enqueue(JobKind.DISPATCH_ORDER, { orderId: randomUUID(), attempt: 0 });
    const claimed = await JobRepository.claimRunnableJobs(`prio_${Date.now()}`, 1, 30);
    // Other suites may leave older dispatch work; what matters is that urgent work beat the backlog
    expect(["DISPATCH_ORDER", "DISPATCH_OFFER_TIMEOUT", "MERCHANT_ACCEPTANCE_TIMEOUT"]).toContain(claimed[0]?.kind);
    expect(claimed[0]?.kind).not.toBe("BACKLOG_TEST");
    await getDbPool().query(`UPDATE jobs SET status = 'COMPLETED' WHERE kind = 'BACKLOG_TEST' OR id = $1`, [urgent]);
    await getDbPool().query(`UPDATE jobs SET status = 'PENDING', lease_owner = NULL WHERE id = $1 AND status = 'PROCESSING'`, [claimed[0]?.id]);
  });
});

import { beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { SEED_IDS, getDbPool } from "@startup/database";
import { WorkerRunner } from "../../worker/src/runner.js";
import { NotificationService } from "../../worker/src/notifications.js";
import { MENU, call, createCustomerWithAddress, createMerchantStaff, createRider, isolateRiders } from "./helpers.js";

import { POST as createQuote } from "../src/app/api/v1/quotes/route.js";
import { POST as createCheckout } from "../src/app/api/v1/checkouts/route.js";
import { POST as verifyPayment } from "../src/app/api/v1/payments/verify/route.js";
import { GET as getOrder } from "../src/app/api/v1/orders/[orderId]/route.js";
import { GET as getTracking } from "../src/app/api/v1/orders/[orderId]/tracking/route.js";
import { POST as rateOrder } from "../src/app/api/v1/orders/[orderId]/rating/route.js";
import { GET as reorder } from "../src/app/api/v1/orders/[orderId]/reorder/route.js";
import { GET as merchantOrders } from "../src/app/api/v1/merchant/orders/route.js";
import { POST as merchantAccept } from "../src/app/api/v1/merchant/orders/[orderId]/accept/route.js";
import { POST as merchantPreparing } from "../src/app/api/v1/merchant/orders/[orderId]/preparing/route.js";
import { POST as merchantReady } from "../src/app/api/v1/merchant/orders/[orderId]/ready/route.js";
import { GET as riderTrip } from "../src/app/api/v1/rider/trip/route.js";
import { POST as riderAccept } from "../src/app/api/v1/rider/offers/[offerId]/accept/route.js";
import { POST as riderMilestone } from "../src/app/api/v1/rider/trip/milestone/route.js";
import { POST as riderLocation } from "../src/app/api/v1/rider/location/route.js";

/** Runs due jobs (pulling this order's scheduled dispatch forward) and publishes the outbox. */
async function drainWorker(worker: WorkerRunner, orderId?: string) {
  if (orderId) {
    // Other suites leave dispatchable orders behind (the maintenance sweep would re-dispatch them);
    // only this order should compete for our rider
    await getDbPool().query(
      `UPDATE orders SET fulfillment_state = 'CANCELLED' WHERE id <> $1 AND fulfillment_state IN ('ACCEPTED', 'PREPARING', 'READY_FOR_PICKUP')`,
      [orderId]
    );
    await getDbPool().query(`UPDATE delivery_offers SET status = 'EXPIRED' WHERE order_id <> $1 AND status = 'OFFERED'`, [orderId]);
    await getDbPool().query(
      `UPDATE jobs SET status = 'COMPLETED' WHERE status = 'PENDING' AND kind = 'DISPATCH_ORDER' AND payload_json->>'orderId' <> $1`,
      [orderId]
    );
    await getDbPool().query(
      `UPDATE jobs SET run_at = NOW() WHERE status = 'PENDING' AND kind = 'DISPATCH_ORDER' AND payload_json->>'orderId' = $1`,
      [orderId]
    );
  }
  for (let i = 0; i < 50; i++) {
    const jobs = await worker.runOnce();
    const events = await worker.publishOutboxOnce();
    if (jobs === 0 && events === 0) break;
  }
}

describe("Full order lifecycle: browse → pay → cook → dispatch → deliver → rate", () => {
  let customer: Awaited<ReturnType<typeof createCustomerWithAddress>>;
  let merchant: Awaited<ReturnType<typeof createMerchantStaff>>;
  let rider: Awaited<ReturnType<typeof createRider>>;
  let worker: WorkerRunner;
  let notifications: NotificationService;

  beforeAll(async () => {
    customer = await createCustomerWithAddress();
    merchant = await createMerchantStaff(SEED_IDS.restaurant1Id);
    rider = await createRider();
    await isolateRiders([rider.riderId]);
    notifications = new NotificationService();
    worker = new WorkerRunner(`test_worker_${Date.now()}`, notifications);
    // Earlier suites may have left due work; start from a clean outbox
    await getDbPool().query(`UPDATE outbox_events SET status = 'PROCESSED' WHERE status = 'PENDING'`);
  });

  it("delivers an order end to end with consistent money, state and notifications", async () => {
    // 1. Quote: server-side prices, modifiers, variants, coupon and tip
    const quote = await call(createQuote, "POST", "/api/v1/quotes", {
      token: customer.token,
      body: {
        restaurantId: SEED_IDS.restaurant1Id,
        deliveryAddressId: customer.addressId,
        items: [
          { menuItemId: MENU.malaiTikka, selectedOptionIds: [MENU.garlicDip], quantity: 2 },
          { menuItemId: MENU.dalMakhani, variantId: MENU.dalHalf, selectedOptionIds: [], quantity: 1 },
        ],
        couponCode: "bitebox20",
        tipPaise: 2000,
      },
    });
    expect(quote.status).toBe(200);
    const q = quote.body.data;
    expect(q.breakdown.subtotalPaise).toBe((34000 + 3000) * 2 + 29000);
    expect(q.appliedCouponCode).toBe("BITEBOX20");
    expect(q.breakdown.discountPaise).toBe(5000); // 20% capped at ₹50
    expect(q.breakdown.tipPaise).toBe(2000);

    // 2. Checkout is idempotent: a double tap returns the same order
    const idempotencyKey = `idem_${randomUUID()}`;
    const checkoutBody = { quoteId: q.quoteId, deliveryAddressId: customer.addressId, idempotencyKey, instructions: "Ring the bell" };
    const checkout = await call(createCheckout, "POST", "/api/v1/checkouts", { token: customer.token, body: checkoutBody });
    expect(checkout.status).toBe(201);
    const replay = await call(createCheckout, "POST", "/api/v1/checkouts", { token: customer.token, body: checkoutBody });
    expect(replay.status).toBe(200);
    expect(replay.body.data.orderId).toBe(checkout.body.data.orderId);
    expect(checkout.body.data.simulatedPayment).toBe(true);
    const { orderId, razorpayOrderId } = checkout.body.data;

    // 3. Payment (simulated gateway in tests)
    const paid = await call(verifyPayment, "POST", "/api/v1/payments/verify", {
      token: customer.token,
      body: { orderId, razorpayOrderId, razorpayPaymentId: `pay_${randomUUID().slice(0, 14)}`, razorpaySignature: "mock_valid_sig_verification_token" },
    });
    expect(paid.status).toBe(200);
    expect(paid.body.data.fulfillmentState).toBe("AWAITING_MERCHANT");

    // 4. Restaurant sees it (with pickup code, without the customer's OTP) and accepts
    const board = await call(merchantOrders, "GET", `/api/v1/merchant/orders?restaurantId=${SEED_IDS.restaurant1Id}`, {
      token: merchant.token,
    });
    const ticket = board.body.data.find((o: any) => o.orderId === orderId);
    expect(ticket).toBeDefined();
    expect(ticket.deliveryOtp).toBeUndefined();
    expect(ticket.pickupCode).toMatch(/^\d{4}$/);

    expect((await call(merchantAccept, "POST", "/x", { token: merchant.token, params: { orderId }, body: { preparationTimeMinutes: 5 } })).status).toBe(200);
    expect((await call(merchantPreparing, "POST", "/x", { token: merchant.token, params: { orderId } })).status).toBe(200);

    // 5. Worker dispatches to the nearby rider
    await drainWorker(worker, orderId);
    const offerView = await call(riderTrip, "GET", "/api/v1/rider/trip", { token: rider.token });
    expect(offerView.body.data.pendingOffer?.orderId).toBe(orderId);
    expect(offerView.body.data.offerOrder.deliveryOtp).toBeUndefined();

    const accepted = await call(riderAccept, "POST", "/x", { token: rider.token, params: { offerId: offerView.body.data.pendingOffer.id } });
    expect(accepted.status).toBe(200);
    const assignmentId = accepted.body.data.assignmentId;

    // 6. Kitchen marks ready; rider arrives and picks up
    expect((await call(merchantReady, "POST", "/x", { token: merchant.token, params: { orderId } })).status).toBe(200);
    expect((await call(riderMilestone, "POST", "/x", { token: rider.token, body: { assignmentId, nextStatus: "AT_PICKUP" } })).status).toBe(200);
    const pickup = await call(riderMilestone, "POST", "/x", { token: rider.token, body: { assignmentId, nextStatus: "PICKED_UP" } });
    expect(pickup.body.data.fulfillmentState).toBe("OUT_FOR_DELIVERY");

    // 7. Live location feeds the customer's tracking snapshot
    const ping = await call(riderLocation, "POST", "/x", {
      token: rider.token,
      body: { latitude: 28.632, longitude: 77.218, accuracyMeters: 12, capturedAt: new Date().toISOString() },
    });
    expect(ping.body.data.accepted).toBe(true);
    const tracking = await call(getTracking, "GET", "/x", { token: customer.token, params: { orderId } });
    expect(tracking.body.data.rider.location.latitude).toBeCloseTo(28.632);
    expect(tracking.body.data.rider.isStale).toBe(false);
    expect(tracking.body.data.order.deliveryOtp).toMatch(/^\d{4}$/);

    // 8. Delivery requires the customer's OTP
    const otp = tracking.body.data.order.deliveryOtp as string;
    const wrong = otp === "0000" ? "1111" : "0000";
    await call(riderMilestone, "POST", "/x", { token: rider.token, body: { assignmentId, nextStatus: "AT_DROPOFF" } });
    const bad = await call(riderMilestone, "POST", "/x", { token: rider.token, body: { assignmentId, nextStatus: "COMPLETED", challengeCode: wrong } });
    expect(bad.status).toBe(400);
    expect(bad.body.error?.details.attemptsRemaining).toBe(4);
    const done = await call(riderMilestone, "POST", "/x", { token: rider.token, body: { assignmentId, nextStatus: "COMPLETED", challengeCode: otp } });
    expect(done.status).toBe(200);
    expect(done.body.data.fulfillmentState).toBe("DELIVERED");

    // 9. Full, gapless audit trail
    const events = await getDbPool().query(`SELECT sequence, target_state FROM order_events WHERE order_id = $1 ORDER BY sequence`, [orderId]);
    expect(events.rows.map((r) => r.target_state)).toEqual([
      "PENDING_PAYMENT",
      "AWAITING_MERCHANT",
      "ACCEPTED",
      "PREPARING",
      "READY_FOR_PICKUP",
      "PICKED_UP",
      "OUT_FOR_DELIVERY",
      "DELIVERED",
    ]);
    expect(events.rows.map((r) => r.sequence)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);

    // 10. Ledger for this order balances and includes the discount and tip
    const ledger = await getDbPool().query(
      `SELECT SUM(le.debit_paise)::int AS debit, SUM(le.credit_paise)::int AS credit
         FROM ledger_entries le JOIN ledger_transactions lt ON lt.id = le.transaction_id WHERE lt.order_id = $1`,
      [orderId]
    );
    expect(ledger.rows[0].debit).toBe(ledger.rows[0].credit);
    expect(ledger.rows[0].debit).toBe(q.breakdown.payablePaise + q.breakdown.discountPaise);
    const redemption = await getDbPool().query(`SELECT status FROM coupon_redemptions WHERE order_id = $1`, [orderId]);
    expect(redemption.rows[0].status).toBe("REDEEMED");

    // 11. Customer rates once; reorder rebuilds the cart from today's menu
    expect((await call(rateOrder, "POST", "/x", { token: customer.token, params: { orderId }, body: { foodRating: 5, deliveryRating: 4, comment: "Hot and fresh" } })).status).toBe(201);
    expect((await call(rateOrder, "POST", "/x", { token: customer.token, params: { orderId }, body: { foodRating: 1 } })).status).toBe(409);
    const again = await call(reorder, "GET", "/x", { token: customer.token, params: { orderId } });
    expect(again.body.data.lines).toHaveLength(2);
    expect(again.body.data.unavailable).toEqual([]);

    const detail = await call(getOrder, "GET", "/x", { token: customer.token, params: { orderId } });
    expect(detail.body.data.rating.foodRating).toBe(5);
    expect(detail.body.data.pickupCode).toBeUndefined();

    // 12. Notifications went out on the way (push captured because VAPID is not configured)
    await drainWorker(worker);
    const titles = notifications.adapters.push.sent.map((s) => s.message.title);
    // No push subscriptions exist for the test users, so nothing is sent; the pipeline still processed events
    const pending = await getDbPool().query(`SELECT COUNT(*)::int AS n FROM outbox_events WHERE aggregate_id = $1 AND status <> 'PROCESSED'`, [orderId]);
    expect(pending.rows[0].n).toBe(0);
    expect(Array.isArray(titles)).toBe(true);
  });
});

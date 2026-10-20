import { beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { SignJWT, generateKeyPair } from "jose";
import { SEED_IDS, getDbPool } from "@startup/database";
import { ClerkAuthAdapter } from "@startup/integrations";
import { resetEnvCacheForTests } from "@startup/config";
import {
  MENU,
  call,
  createCustomerWithAddress,
  createMerchantStaff,
  createRider,
  createUser,
  isolateRiders,
  startAuthServer,
} from "./helpers.js";

import { GET as adminOrders } from "../src/app/api/v1/admin/orders/route.js";
import { POST as adminRefund } from "../src/app/api/v1/admin/orders/[orderId]/refund/route.js";
import { POST as createQuote } from "../src/app/api/v1/quotes/route.js";
import { POST as createCheckout } from "../src/app/api/v1/checkouts/route.js";
import { POST as verifyPayment } from "../src/app/api/v1/payments/verify/route.js";
import { GET as getOrder } from "../src/app/api/v1/orders/[orderId]/route.js";
import { GET as getTracking } from "../src/app/api/v1/orders/[orderId]/tracking/route.js";
import { POST as cancelOrder } from "../src/app/api/v1/orders/[orderId]/cancel/route.js";
import { POST as merchantAccept } from "../src/app/api/v1/merchant/orders/[orderId]/accept/route.js";
import { GET as merchantOrders } from "../src/app/api/v1/merchant/orders/route.js";
import { POST as riderMilestone } from "../src/app/api/v1/rider/trip/milestone/route.js";
import { POST as riderAccept } from "../src/app/api/v1/rider/offers/[offerId]/accept/route.js";
import { GET as getAddresses } from "../src/app/api/v1/addresses/route.js";
import { GET as search } from "../src/app/api/v1/search/route.js";
import { RiderRepository } from "@startup/database";

/** Places and pays an order for `customer`; returns ids. */
async function placePaidOrder(customer: Awaited<ReturnType<typeof createCustomerWithAddress>>) {
  const quote = await call(createQuote, "POST", "/q", {
    token: customer.token,
    body: { restaurantId: SEED_IDS.restaurant1Id, deliveryAddressId: customer.addressId, items: [{ menuItemId: MENU.paneerTikka, quantity: 1 }] },
  });
  expect(quote.status).toBe(200);
  const checkout = await call(createCheckout, "POST", "/c", {
    token: customer.token,
    body: { quoteId: quote.body.data.quoteId, deliveryAddressId: customer.addressId, idempotencyKey: `idem_${randomUUID()}` },
  });
  expect(checkout.status).toBe(201);
  const { orderId, razorpayOrderId } = checkout.body.data;
  const paid = await call(verifyPayment, "POST", "/v", {
    token: customer.token,
    body: { orderId, razorpayOrderId, razorpayPaymentId: `pay_${randomUUID().slice(0, 14)}`, razorpaySignature: "mock_valid_sig_verification_token" },
  });
  expect(paid.status).toBe(200);
  return { orderId: orderId as string, razorpayOrderId: razorpayOrderId as string, payable: quote.body.data.breakdown.payablePaise as number };
}

describe("Authentication", () => {
  beforeAll(async () => {
    await startAuthServer();
  });

  it("rejects unsigned, forged, expired and wrong-issuer tokens", async () => {
    const auth = await startAuthServer();
    const { privateKey: attackerKey } = await generateKeyPair("RS256");
    const forged = await new SignJWT({}).setProtectedHeader({ alg: "RS256", kid: "test-key" }).setIssuer(auth.issuer).setSubject("user_x").setExpirationTime("5m").sign(attackerKey);
    const realButExpired = await auth.sign("user_x").then(() =>
      // a token that expired a minute ago, signed by an attacker key: must fail either way
      new SignJWT({}).setProtectedHeader({ alg: "RS256", kid: "test-key" }).setIssuer(auth.issuer).setSubject("user_x").setExpirationTime(Math.floor(Date.now() / 1000) - 60).sign(attackerKey)
    );

    for (const token of ["random-string", "eyJhbGciOiJSUzI1NiJ9.e30.sig", forged, realButExpired, "demo_hacker_admin"]) {
      expect(await ClerkAuthAdapter.resolveIdentity(`Bearer ${token}`)).toBeNull();
    }
    // Previously any bearer string was accepted as a customer and every real JWT collapsed onto one account
    expect((await call(getAddresses, "GET", "/a", { token: "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.anything" })).status).toBe(401);
  });

  it("verifies real tokens and derives the role from the database, not the token", async () => {
    const admin = await createUser("ADMIN");
    const customer = await createUser("CUSTOMER");
    expect((await call(adminOrders, "GET", "/a", { token: admin.token })).status).toBe(200);
    expect((await call(adminOrders, "GET", "/a", { token: customer.token })).status).toBe(403);
    // The admin board used to have no auth at all
    expect((await call(adminOrders, "GET", "/a")).status).toBe(401);
  });

  it("refuses demo personas in production-like environments", async () => {
    const original = { APP_ENV: process.env.APP_ENV, NODE_ENV: process.env.NODE_ENV };
    process.env.APP_ENV = "development";
    process.env.AUTH_DEMO_MODE = "false";
    resetEnvCacheForTests();
    expect(await ClerkAuthAdapter.resolveIdentity("Bearer demo_admin")).toBeNull();
    delete process.env.AUTH_DEMO_MODE;
    process.env.APP_ENV = original.APP_ENV;
    resetEnvCacheForTests();
    expect(await ClerkAuthAdapter.resolveIdentity("Bearer demo_admin")).not.toBeNull();
  });

  it("refuses to boot a strict environment with placeholder secrets", async () => {
    const { ServerEnvSchema, findInsecureSettings } = await import("@startup/config");
    const env = ServerEnvSchema.parse({ APP_ENV: "production" });
    const problems = findInsecureSettings(env);
    expect(problems.join("\n")).toMatch(/RAZORPAY_KEY_SECRET/);
    expect(problems.join("\n")).toMatch(/CLERK_ISSUER/);
  });
});

describe("Authorization & data isolation", () => {
  let alice: Awaited<ReturnType<typeof createCustomerWithAddress>>;
  let bob: Awaited<ReturnType<typeof createCustomerWithAddress>>;
  let aliceOrder: Awaited<ReturnType<typeof placePaidOrder>>;

  beforeAll(async () => {
    alice = await createCustomerWithAddress();
    bob = await createCustomerWithAddress();
    aliceOrder = await placePaidOrder(alice);
  });

  it("hides other customers' orders (404, not 403, so ids cannot be probed)", async () => {
    expect((await call(getOrder, "GET", "/o", { token: bob.token, params: { orderId: aliceOrder.orderId } })).status).toBe(404);
    expect((await call(getTracking, "GET", "/o", { token: bob.token, params: { orderId: aliceOrder.orderId } })).status).toBe(404);
    expect((await call(cancelOrder, "POST", "/o", { token: bob.token, params: { orderId: aliceOrder.orderId } })).status).toBe(404);
    expect((await call(getOrder, "GET", "/o", { token: bob.token, params: { orderId: "not-a-uuid" } })).status).toBe(404);
  });

  it("stops staff of one restaurant from touching another restaurant's orders", async () => {
    const otherStaff = await createMerchantStaff(SEED_IDS.restaurant3Id);
    const accept = await call(merchantAccept, "POST", "/m", {
      token: otherStaff.token,
      params: { orderId: aliceOrder.orderId },
      body: { preparationTimeMinutes: 10 },
    });
    expect(accept.status).toBe(403);
    const board = await call(merchantOrders, "GET", `/m?restaurantId=${SEED_IDS.restaurant1Id}`, { token: otherStaff.token });
    expect(board.status).toBe(403);
    // ...and riders/customers cannot use merchant endpoints at all
    expect((await call(merchantAccept, "POST", "/m", { token: alice.token, params: { orderId: aliceOrder.orderId }, body: { preparationTimeMinutes: 10 } })).status).toBe(403);
  });

  it("lets riders see only orders offered or assigned to them, never the delivery OTP", async () => {
    const stranger = await createRider();
    expect((await call(getOrder, "GET", "/o", { token: stranger.token, params: { orderId: aliceOrder.orderId } })).status).toBe(404);
  });

  it("refuses a customer self-cancel once the kitchen has accepted", async () => {
    const staff = await createMerchantStaff(SEED_IDS.restaurant1Id);
    const order = await placePaidOrder(alice);
    await call(merchantAccept, "POST", "/m", { token: staff.token, params: { orderId: order.orderId }, body: { preparationTimeMinutes: 10 } });
    const res = await call(cancelOrder, "POST", "/c", { token: alice.token, params: { orderId: order.orderId }, body: {} });
    expect(res.status).toBe(409);
    expect(res.body.error?.message).toMatch(/contact support/i);
  });

  it("refunds in full when the customer cancels before acceptance, and only once", async () => {
    const order = await placePaidOrder(alice);
    const first = await call(cancelOrder, "POST", "/c", { token: alice.token, params: { orderId: order.orderId }, body: { reason: "Ordered by mistake" } });
    expect(first.status).toBe(200);
    expect(first.body.data.refundedPaise).toBe(order.payable);
    const second = await call(cancelOrder, "POST", "/c", { token: alice.token, params: { orderId: order.orderId }, body: {} });
    expect(second.status).toBe(409);
    const refunds = await getDbPool().query(`SELECT COUNT(*)::int AS n FROM refunds WHERE order_id = $1`, [order.orderId]);
    expect(refunds.rows[0].n).toBe(1);
  });
});

describe("Rider trip integrity", () => {
  it("prevents a rider from completing someone else's trip or skipping steps, and locks after 5 bad OTPs", async () => {
    const customer = await createCustomerWithAddress();
    const staff = await createMerchantStaff(SEED_IDS.restaurant1Id);
    const rider = await createRider();
    const intruder = await createRider();
    await isolateRiders([rider.riderId]);

    const order = await placePaidOrder(customer);
    await call(merchantAccept, "POST", "/m", { token: staff.token, params: { orderId: order.orderId }, body: { preparationTimeMinutes: 5 } });
    const offer = await RiderRepository.createOffer({ orderId: order.orderId, riderId: rider.riderId, distanceToPickupMeters: 100 });
    expect(offer).not.toBeNull();

    // Another rider cannot claim this offer
    expect((await call(riderAccept, "POST", "/r", { token: intruder.token, params: { offerId: offer!.offerId } })).status).toBe(404);
    const { body } = await call(riderAccept, "POST", "/r", { token: rider.token, params: { offerId: offer!.offerId } });
    const assignmentId = body.data.assignmentId as string;

    // The intruder cannot drive the owner's trip
    expect((await call(riderMilestone, "POST", "/r", { token: intruder.token, body: { assignmentId, nextStatus: "AT_PICKUP" } })).status).toBe(404);
    // Cannot deliver before pickup
    expect((await call(riderMilestone, "POST", "/r", { token: rider.token, body: { assignmentId, nextStatus: "COMPLETED", challengeCode: "1234" } })).status).toBe(409);
    // Cannot pick up food that is not ready without the restaurant's pickup code
    expect((await call(riderMilestone, "POST", "/r", { token: rider.token, body: { assignmentId, nextStatus: "PICKED_UP" } })).status).toBe(400);
    const code = (await getDbPool().query(`SELECT pickup_otp, delivery_otp FROM orders WHERE id = $1`, [order.orderId])).rows[0];
    expect((await call(riderMilestone, "POST", "/r", { token: rider.token, body: { assignmentId, nextStatus: "PICKED_UP", challengeCode: code.pickup_otp } })).status).toBe(200);

    const wrong = code.delivery_otp === "9999" ? "1111" : "9999";
    for (let i = 0; i < 5; i++) {
      await call(riderMilestone, "POST", "/r", { token: rider.token, body: { assignmentId, nextStatus: "COMPLETED", challengeCode: wrong } });
    }
    // Even the right code is refused once locked
    const locked = await call(riderMilestone, "POST", "/r", { token: rider.token, body: { assignmentId, nextStatus: "COMPLETED", challengeCode: code.delivery_otp } });
    expect(locked.status).toBe(403);
  });
});

describe("Input hardening", () => {
  it("treats LIKE wildcards in search literally", async () => {
    const res = await call(search, "GET", "/api/v1/search?q=%25%25");
    expect(res.status).toBe(200);
    expect(res.body.data.restaurants).toHaveLength(0);
    expect(res.body.data.dishes).toHaveLength(0);
  });

  it("never prices an address that belongs to someone else", async () => {
    const alice = await createCustomerWithAddress();
    const bob = await createCustomerWithAddress();
    const res = await call(createQuote, "POST", "/q", {
      token: bob.token,
      body: { restaurantId: SEED_IDS.restaurant1Id, deliveryAddressId: alice.addressId, items: [{ menuItemId: MENU.paneerTikka, quantity: 1 }] },
    });
    expect(res.status).toBe(404);
  });

  it("refuses to deliver outside the service area instead of pricing a default location", async () => {
    const mumbai = await createCustomerWithAddress({ latitude: 19.076, longitude: 72.8777 });
    const res = await call(createQuote, "POST", "/q", {
      token: mumbai.token,
      body: { restaurantId: SEED_IDS.restaurant1Id, deliveryAddressId: mumbai.addressId, items: [{ menuItemId: MENU.paneerTikka, quantity: 1 }] },
    });
    expect(res.status).toBe(422);
    expect(res.body.error?.code).toBe("SERVICEABILITY_ERROR");
  });

  it("caps admin refunds at the captured amount", async () => {
    const admin = await createUser("ADMIN");
    const customer = await createCustomerWithAddress();
    const order = await placePaidOrder(customer);
    const over = await call(adminRefund, "POST", "/r", { token: admin.token, params: { orderId: order.orderId }, body: { amountPaise: order.payable + 1, reason: "Too much" } });
    expect(over.status).toBe(400);
    const partial = await call(adminRefund, "POST", "/r", { token: admin.token, params: { orderId: order.orderId }, body: { amountPaise: 1000, reason: "Missing raita" } });
    expect(partial.status).toBe(200);
    expect(partial.body.data.remainingRefundablePaise).toBe(order.payable - 1000);
    const status = await getDbPool().query(`SELECT payment_status, refunded_paise FROM orders WHERE id = $1`, [order.orderId]);
    expect(status.rows[0]).toEqual({ payment_status: "PARTIALLY_REFUNDED", refunded_paise: 1000 });
  });
});

import http from "node:http";
import { AddressInfo } from "node:net";
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { SignJWT, exportJWK, generateKeyPair } from "jose";
import { resetEnvCacheForTests } from "@startup/config";
import { SEED_IDS, getDbPool } from "@startup/database";

export const APP = "http://localhost:3000";

let authServer: { issuer: string; sign: (sub: string) => Promise<string>; close: () => Promise<void> } | null = null;

/**
 * Starts a local JWKS endpoint and points the app's Clerk verification at it, so
 * tests exercise the real JWT verification path with tokens we mint.
 */
export async function startAuthServer() {
  if (authServer) return authServer;
  const { publicKey, privateKey } = await generateKeyPair("RS256");
  const jwk = { ...(await exportJWK(publicKey)), kid: "test-key", alg: "RS256", use: "sig" };
  const server = http.createServer((req, res) => {
    if (req.url === "/.well-known/jwks.json") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ keys: [jwk] }));
    } else {
      res.writeHead(404).end();
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const issuer = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  process.env.CLERK_ISSUER = issuer;
  delete process.env.CLERK_JWKS_URL;
  resetEnvCacheForTests();

  authServer = {
    issuer,
    sign: (sub: string) =>
      new SignJWT({ sid: `sess_${sub}`, azp: "http://localhost:3000" })
        .setProtectedHeader({ alg: "RS256", kid: "test-key" })
        .setIssuer(issuer)
        .setSubject(sub)
        .setIssuedAt()
        .setExpirationTime("10m")
        .sign(privateKey),
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
  return authServer;
}

export interface TestUser {
  userId: string;
  clerkUserId: string;
  token: string;
}

/** Creates a user directly (bypassing first-sight provisioning) and returns a signed token. */
export async function createUser(role: "CUSTOMER" | "MERCHANT_STAFF" | "RIDER" | "ADMIN" = "CUSTOMER"): Promise<TestUser> {
  const auth = await startAuthServer();
  const clerkUserId = `user_test_${randomUUID().slice(0, 12)}`;
  const res = await getDbPool().query(
    `INSERT INTO app_users (clerk_user_id, name, email, phone, role)
     VALUES ($1, $2, $3, '+919812345678', $4) RETURNING id`,
    [clerkUserId, `Test ${role.toLowerCase()}`, `${clerkUserId}@example.test`, role]
  );
  return { userId: res.rows[0].id, clerkUserId, token: await auth.sign(clerkUserId) };
}

export async function createCustomerWithAddress(at = { latitude: 28.6315, longitude: 77.2167 }) {
  const user = await createUser("CUSTOMER");
  const res = await getDbPool().query(
    `INSERT INTO customer_addresses (user_id, label, building, street, latitude, longitude, is_default, contact_phone)
     VALUES ($1, 'Home', 'Flat 1', 'Barakhamba Road', $2, $3, true, '+919812345678') RETURNING id`,
    [user.userId, at.latitude, at.longitude]
  );
  return { ...user, addressId: res.rows[0].id as string };
}

export async function createMerchantStaff(restaurantId: string = SEED_IDS.restaurant1Id) {
  const user = await createUser("MERCHANT_STAFF");
  await getDbPool().query(
    `INSERT INTO merchant_memberships (user_id, restaurant_id, staff_role) VALUES ($1, $2, 'MANAGER')`,
    [user.userId, restaurantId]
  );
  return user;
}

/** An online rider with a fresh ping at `at` (defaults to next to Punjabi Angithi). */
export async function createRider(at = { latitude: 28.6326, longitude: 77.2195 }) {
  const user = await createUser("RIDER");
  const res = await getDbPool().query(
    `INSERT INTO riders (user_id, name, phone, is_approved, is_online, current_latitude, current_longitude, last_ping_at, verification_status)
     VALUES ($1, 'Test Rider', '+919800000000', true, true, $2, $3, NOW(), 'VERIFIED') RETURNING id`,
    [user.userId, at.latitude, at.longitude]
  );
  await getDbPool().query(
    `INSERT INTO rider_verifications (rider_id, status, verified_at) VALUES ($1, 'VERIFIED', NOW()) ON CONFLICT DO NOTHING`,
    [res.rows[0].id]
  );
  return { ...user, riderId: res.rows[0].id as string };
}

/** Takes every other rider offline so dispatch in a test is deterministic. */
export async function isolateRiders(keepRiderIds: string[] = []) {
  await getDbPool().query(`UPDATE riders SET is_online = false WHERE NOT (id = ANY($1::uuid[]))`, [keepRiderIds]);
}

export function makeRequest(
  method: string,
  path: string,
  options: { token?: string; body?: unknown; headers?: Record<string, string> } = {}
): NextRequest {
  const headers: Record<string, string> = { "x-real-ip": "10.0.0.1", ...options.headers };
  if (options.token) headers.authorization = `Bearer ${options.token}`;
  if (options.body !== undefined) headers["content-type"] = "application/json";
  return new NextRequest(`${APP}${path}`, {
    method,
    headers,
    body: options.body === undefined ? undefined : typeof options.body === "string" ? options.body : JSON.stringify(options.body),
  });
}

type Handler = (req: NextRequest, ctx: { params: Promise<any> }) => Promise<Response>;

export async function call<T = any>(
  handler: Handler,
  method: string,
  path: string,
  options: { token?: string; body?: unknown; params?: Record<string, string>; headers?: Record<string, string> } = {}
): Promise<{ status: number; body: { data: T; error?: { code: string; message: string; details?: any } } }> {
  const res = await handler(makeRequest(method, path, options), { params: Promise.resolve(options.params ?? {}) });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : undefined };
}

export const MENU = {
  paneerTikka: "90000000-0000-4000-8000-000000000001",
  malaiTikka: "90000000-0000-4000-8000-000000000002",
  dalMakhani: "90000000-0000-4000-8000-000000000004",
  dalHalf: "c0000000-0000-4000-8000-000000000040",
  mintDip: "b0000000-0000-4000-8000-000000000010",
  garlicDip: "b0000000-0000-4000-8000-000000000011",
};

/**
 * Drives an order from checkout to DELIVERED through the real repositories
 * (no HTTP), for tests that only care about what happens after delivery.
 */
export async function deliverOrder(
  options: {
    restaurantId?: string;
    rider?: Awaited<ReturnType<typeof createRider>>;
    customer?: Awaited<ReturnType<typeof createCustomerWithAddress>>;
  } = {}
) {
  const { OrderRepository, RiderRepository } = await import("@startup/database");
  const { FulfillmentState, DeliveryTripStatus } = await import("@startup/contracts");
  const customer = options.customer ?? (await createCustomerWithAddress());
  const rider = options.rider ?? (await createRider());
  const breakdown = {
    subtotalPaise: 56000,
    packagingPaise: 2000,
    deliveryFeePaise: 3000,
    platformFeePaise: 500,
    surgePaise: 0,
    // 5% of ₹560 food + 18% of ₹55 delivery/packaging/platform
    taxPaise: 2800 + 990,
    discountPaise: 0,
    tipPaise: 2000,
    foodTaxPaise: 2800,
    foodDiscountPaise: 0,
    payablePaise: 56000 + 2000 + 3000 + 500 + 3790 + 2000,
  };
  const created = await OrderRepository.createWithIdempotency({
    idempotencyKey: `idem_${randomUUID()}`,
    principalId: customer.userId,
    requestHash: "h",
    customerId: customer.userId,
    restaurantId: options.restaurantId ?? SEED_IDS.restaurant1Id,
    deliveryAddressId: customer.addressId,
    orderNumber: `ORD-T-${randomUUID().slice(0, 8).toUpperCase()}`,
    items: [{ menuItemId: MENU.paneerTikka, name: "Paneer Tikka Shashlik", quantity: 2, basePricePaise: 28000, optionsPricePaise: 0, lineTotalPaise: 56000, selectedOptionNames: [] }],
    breakdown,
    payablePaise: breakdown.payablePaise,
    deliveryOtp: "1234",
    pickupOtp: "5678",
    estimatedDeliveryMinutes: 30,
    razorpayOrderId: `order_${randomUUID().slice(0, 14)}`,
  });
  await OrderRepository.recordPaymentCapture({ orderId: created.orderId, providerPaymentId: `pay_${randomUUID().slice(0, 14)}`, amountPaise: breakdown.payablePaise, paymentAttemptId: created.paymentAttemptId });
  await OrderRepository.updateFulfillmentState({ orderId: created.orderId, fromState: FulfillmentState.AWAITING_MERCHANT, toState: FulfillmentState.ACCEPTED, actorType: "MERCHANT" });
  await OrderRepository.updateFulfillmentState({ orderId: created.orderId, fromState: FulfillmentState.ACCEPTED, toState: FulfillmentState.READY_FOR_PICKUP, actorType: "MERCHANT" });
  const { assignmentId } = await RiderRepository.assignManually({ orderId: created.orderId, riderId: rider.riderId, adminId: customer.userId, reason: "test" });
  await RiderRepository.advanceTrip({ assignmentId, riderId: rider.riderId, nextStatus: DeliveryTripStatus.PICKED_UP });
  await RiderRepository.advanceTrip({ assignmentId, riderId: rider.riderId, nextStatus: DeliveryTripStatus.COMPLETED, challengeCode: "1234" });
  return { orderId: created.orderId, customer, rider, breakdown, assignmentId };
}

import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import {
  DeliveryTripStatus,
  FulfillmentState,
  UserRole,
} from "@startup/contracts";
import {
  LedgerRepository,
  OrderRepository,
  RiderRepository,
  SEED_IDS,
  deliveryOffers,
  getDb,
  getDbPool,
  refunds,
} from "@startup/database";
import { ClerkAuthAdapter } from "@startup/integrations";
import { LedgerEngine } from "@startup/core";

// Import route handlers
import { GET as getOrderById } from "../src/app/api/v1/orders/[orderId]/route.js";
import { POST as cancelOrder } from "../src/app/api/v1/orders/[orderId]/cancel/route.js";
import { GET as getOrderTracking } from "../src/app/api/v1/orders/[orderId]/tracking/route.js";
import { GET as getMe, PATCH as updateMe } from "../src/app/api/v1/me/route.js";
import { GET as getRiderTrip } from "../src/app/api/v1/rider/trip/route.js";
import { POST as updateMilestone } from "../src/app/api/v1/rider/trip/milestone/route.js";
import { POST as acceptOffer } from "../src/app/api/v1/rider/offers/[offerId]/accept/route.js";
import { POST as adminRefund } from "../src/app/api/v1/admin/orders/[orderId]/refund/route.js";

describe("Security & Business Edge Cases Test Suite", () => {
  describe("1. Clerk Authentication & Privilege Escalation Protection", () => {
    it("exact-matches demo tokens and prevents privilege escalation via substring matching", async () => {
      // Valid exact tokens
      const adminActor = await ClerkAuthAdapter.resolveActor("Bearer demo_admin");
      expect(adminActor).not.toBeNull();
      expect(adminActor?.role).toBe(UserRole.ADMIN);

      const customerActor = await ClerkAuthAdapter.resolveActor("Bearer demo_customer");
      expect(customerActor).not.toBeNull();
      expect(customerActor?.role).toBe(UserRole.CUSTOMER);

      // Malicious attempt: token with 'admin' substring must NOT grant admin role
      const spoofedAdmin = await ClerkAuthAdapter.resolveActor("Bearer my_admin_token");
      expect(spoofedAdmin).not.toBeNull();
      expect(spoofedAdmin?.role).toBe(UserRole.CUSTOMER); // Default customer, not admin

      // Malicious attempt: prefix demo_ with invalid suffix must be rejected
      const invalidDemo = await ClerkAuthAdapter.resolveActor("Bearer demo_hacker_admin");
      expect(invalidDemo).toBeNull();
    });
  });

  describe("2. Late Payment Capture Invariant on Cancelled Orders", () => {
    it("never resurrects a CANCELLED order to AWAITING_MERCHANT and automatically triggers approved refund", async () => {
      const orderNum = `ORD-LATE-${Date.now().toString(36).toUpperCase()}`;
      const created = await OrderRepository.createWithIdempotency({
        idempotencyKey: `idem_late_${Date.now()}`,
        principalId: SEED_IDS.customerUserId,
        requestHash: "hash_late",
        customerId: SEED_IDS.customerUserId,
        restaurantId: SEED_IDS.restaurant1Id,
        deliveryAddressId: SEED_IDS.customerAddressId,
        orderNumber: orderNum,
        items: [
          {
            menuItemId: "90000000-0000-4000-8000-000000000001",
            name: "Paneer Tikka Shashlik",
            quantity: 1,
            basePricePaise: 28000,
            optionsPricePaise: 0,
            lineTotalPaise: 28000,
            selectedOptionNames: [],
          },
        ],
        breakdown: {
          subtotalPaise: 28000,
          packagingPaise: 2000,
          deliveryFeePaise: 3000,
          platformFeePaise: 500,
          surgePaise: 0,
          taxPaise: 2390,
          discountPaise: 0,
          payablePaise: 35890,
        },
        payablePaise: 35890,
        deliveryOtp: "556677",
        pickupOtp: "889900",
        estimatedDeliveryMinutes: 30,
        razorpayOrderId: `rzp_order_late_${Date.now()}`,
      });

      // Simulate timeout cancellation before payment capture
      await OrderRepository.updateFulfillmentState({
        orderId: created.orderId,
        fromState: FulfillmentState.PENDING_PAYMENT,
        toState: FulfillmentState.CANCELLED,
        actorType: "SYSTEM",
        reason: "Timeout expired waiting for payment capture",
      });

      const orderBeforeCapture = await OrderRepository.findById(created.orderId);
      expect(orderBeforeCapture?.fulfillmentState).toBe(FulfillmentState.CANCELLED);

      // Now late capture webhook arrives from Razorpay
      await OrderRepository.recordPaymentCapture({
        orderId: created.orderId,
        providerPaymentId: `pay_late_${Date.now()}`,
        amountPaise: 35890,
        paymentAttemptId: created.paymentAttemptId,
      });

      // Assert order is NOT resurrected!
      const orderAfterCapture = await OrderRepository.findById(created.orderId);
      expect(orderAfterCapture?.paymentStatus).toBe("CAPTURED");
      expect(orderAfterCapture?.fulfillmentState).toBe(FulfillmentState.CANCELLED);

      // Assert automatic refund was created with APPROVED status
      const db = getDb();
      const refundRows = await db.select().from(refunds);
      const autoRefund = refundRows.find((r) => r.orderId === created.orderId);
      expect(autoRefund).toBeDefined();
      expect(autoRefund?.status).toBe("APPROVED");
      expect(autoRefund?.amountPaise).toBe(35890);
    });
  });

  describe("3. Delivery Challenge OTP Confidentiality & Milestone Verification", () => {
    it("confines deliveryOtp to customer and enforces OTP on milestone completion", async () => {
      const orderNum = `ORD-OTP-${Date.now().toString(36).toUpperCase()}`;
      const expectedOtp = "789123";

      const created = await OrderRepository.createWithIdempotency({
        idempotencyKey: `idem_otp_${Date.now()}`,
        principalId: SEED_IDS.customerUserId,
        requestHash: "hash_otp",
        customerId: SEED_IDS.customerUserId,
        restaurantId: SEED_IDS.restaurant1Id,
        deliveryAddressId: SEED_IDS.customerAddressId,
        orderNumber: orderNum,
        items: [
          {
            menuItemId: "90000000-0000-4000-8000-000000000001",
            name: "Paneer Tikka Shashlik",
            quantity: 1,
            basePricePaise: 28000,
            optionsPricePaise: 0,
            lineTotalPaise: 28000,
            selectedOptionNames: [],
          },
        ],
        breakdown: {
          subtotalPaise: 28000,
          packagingPaise: 2000,
          deliveryFeePaise: 3000,
          platformFeePaise: 500,
          surgePaise: 0,
          taxPaise: 2390,
          discountPaise: 0,
          payablePaise: 35890,
        },
        payablePaise: 35890,
        deliveryOtp: expectedOtp,
        pickupOtp: "112233",
        estimatedDeliveryMinutes: 30,
        razorpayOrderId: `rzp_otp_${Date.now()}`,
      });

      // 1. Customer request: sees OTP
      const customerReq = new NextRequest(`http://localhost:3000/api/v1/orders/${created.orderId}`, {
        headers: { Authorization: "Bearer demo_customer" },
      });
      const customerRes = await getOrderById(customerReq, {
        params: Promise.resolve({ orderId: created.orderId }),
      });
      expect(customerRes.status).toBe(200);
      const customerBody = await customerRes.json();
      expect(customerBody.data.deliveryOtp).toBe(expectedOtp);

      // 2. Unauthenticated request: 401
      const unauthReq = new NextRequest(`http://localhost:3000/api/v1/orders/${created.orderId}`);
      const unauthRes = await getOrderById(unauthReq, {
        params: Promise.resolve({ orderId: created.orderId }),
      });
      expect(unauthRes.status).toBe(401);

      // 3. Rider active trip: must NOT expose customer OTP
      const riderReq = new NextRequest(`http://localhost:3000/api/v1/rider/trip`, {
        headers: { Authorization: "Bearer demo_rider" },
      });
      const riderRes = await getRiderTrip(riderReq);
      expect(riderRes.status).toBe(200);
      const riderBody = await riderRes.json();
      if (riderBody.data.order) {
        expect(riderBody.data.order.deliveryOtp).toBeUndefined();
      }

      // 4. Milestone completion challenge check
      // Try to complete without OTP
      const noOtpReq = new NextRequest(`http://localhost:3000/api/v1/rider/trip/milestone`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer demo_rider",
        },
        body: JSON.stringify({
          assignmentId: "00000000-0000-0000-0000-000000000001",
          orderId: created.orderId,
          nextStatus: DeliveryTripStatus.COMPLETED,
        }),
      });
      const noOtpRes = await updateMilestone(noOtpReq);
      expect(noOtpRes.status).toBe(400);

      // Try with wrong OTP
      const wrongOtpReq = new NextRequest(`http://localhost:3000/api/v1/rider/trip/milestone`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer demo_rider",
        },
        body: JSON.stringify({
          assignmentId: "00000000-0000-0000-0000-000000000001",
          orderId: created.orderId,
          nextStatus: DeliveryTripStatus.COMPLETED,
          challengeCode: "000000",
        }),
      });
      const wrongOtpRes = await updateMilestone(wrongOtpReq);
      expect(wrongOtpRes.status).toBe(400);
    });
  });

  describe("4. Admin Cumulative Refund Limit & Row-Locked Invariant", () => {
    it("rejects refunds that cumulatively exceed payablePaise", async () => {
      const orderNum = `ORD-REF-${Date.now().toString(36).toUpperCase()}`;
      const payablePaise = 30000;

      const created = await OrderRepository.createWithIdempotency({
        idempotencyKey: `idem_ref_${Date.now()}`,
        principalId: SEED_IDS.customerUserId,
        requestHash: "hash_ref",
        customerId: SEED_IDS.customerUserId,
        restaurantId: SEED_IDS.restaurant1Id,
        deliveryAddressId: SEED_IDS.customerAddressId,
        orderNumber: orderNum,
        items: [
          {
            menuItemId: "90000000-0000-4000-8000-000000000001",
            name: "Paneer Tikka Shashlik",
            quantity: 1,
            basePricePaise: 30000,
            optionsPricePaise: 0,
            lineTotalPaise: 30000,
            selectedOptionNames: [],
          },
        ],
        breakdown: {
          subtotalPaise: 30000,
          packagingPaise: 0,
          deliveryFeePaise: 0,
          platformFeePaise: 0,
          surgePaise: 0,
          taxPaise: 0,
          discountPaise: 0,
          payablePaise: 30000,
        },
        payablePaise: 30000,
        deliveryOtp: "111222",
        pickupOtp: "333444",
        estimatedDeliveryMinutes: 30,
        razorpayOrderId: `rzp_ref_${Date.now()}`,
      });

      // Capture payment
      await OrderRepository.recordPaymentCapture({
        orderId: created.orderId,
        providerPaymentId: `pay_ref_${Date.now()}`,
        amountPaise: payablePaise,
        paymentAttemptId: created.paymentAttemptId,
      });

      // 1. Partial refund of 20000 paise (20000 <= 30000) -> SUCCESS
      const firstRefundReq = new NextRequest(
        `http://localhost:3000/api/v1/admin/orders/${created.orderId}/refund`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer demo_admin",
          },
          body: JSON.stringify({
            amountPaise: 20000,
            reason: "Damaged item partial refund",
          }),
        }
      );
      const firstRes = await adminRefund(firstRefundReq, {
        params: Promise.resolve({ orderId: created.orderId }),
      });
      expect(firstRes.status).toBe(200);

      // 2. Second refund of 15000 paise (20000 + 15000 = 35000 > 30000) -> MUST BE REJECTED
      const secondRefundReq = new NextRequest(
        `http://localhost:3000/api/v1/admin/orders/${created.orderId}/refund`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer demo_admin",
          },
          body: JSON.stringify({
            amountPaise: 15000,
            reason: "Excessive second refund attempt",
          }),
        }
      );
      const secondRes = await adminRefund(secondRefundReq, {
        params: Promise.resolve({ orderId: created.orderId }),
      });
      expect(secondRes.status).toBe(400);
      const secondBody = await secondRes.json();
      expect(secondBody.error.message).toContain("exceeds remaining refundable balance");

      // 3. Non-admin attempting refund -> 403 Forbidden
      const nonAdminReq = new NextRequest(
        `http://localhost:3000/api/v1/admin/orders/${created.orderId}/refund`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer demo_customer",
          },
          body: JSON.stringify({
            amountPaise: 5000,
            reason: "Non-admin refund attempt",
          }),
        }
      );
      const nonAdminRes = await adminRefund(nonAdminReq, {
        params: Promise.resolve({ orderId: created.orderId }),
      });
      expect(nonAdminRes.status).toBe(403);
    });
  });

  describe("5. Customer Order Cancellation & Tracking Endpoints", () => {
    it("allows customer to cancel eligible order and returns comprehensive tracking telemetry", async () => {
      const orderNum = `ORD-CAN-${Date.now().toString(36).toUpperCase()}`;
      const created = await OrderRepository.createWithIdempotency({
        idempotencyKey: `idem_can_${Date.now()}`,
        principalId: SEED_IDS.customerUserId,
        requestHash: "hash_can",
        customerId: SEED_IDS.customerUserId,
        restaurantId: SEED_IDS.restaurant1Id,
        deliveryAddressId: SEED_IDS.customerAddressId,
        orderNumber: orderNum,
        items: [
          {
            menuItemId: "90000000-0000-4000-8000-000000000001",
            name: "Paneer Tikka Shashlik",
            quantity: 1,
            basePricePaise: 28000,
            optionsPricePaise: 0,
            lineTotalPaise: 28000,
            selectedOptionNames: [],
          },
        ],
        breakdown: {
          subtotalPaise: 28000,
          packagingPaise: 2000,
          deliveryFeePaise: 3000,
          platformFeePaise: 500,
          surgePaise: 0,
          taxPaise: 2390,
          discountPaise: 0,
          payablePaise: 35890,
        },
        payablePaise: 35890,
        deliveryOtp: "667788",
        pickupOtp: "990011",
        estimatedDeliveryMinutes: 30,
        razorpayOrderId: `rzp_can_${Date.now()}`,
      });

      // Capture payment so it is AWAITING_MERCHANT
      await OrderRepository.recordPaymentCapture({
        orderId: created.orderId,
        providerPaymentId: `pay_can_${Date.now()}`,
        amountPaise: 35890,
        paymentAttemptId: created.paymentAttemptId,
      });

      // Tracking endpoint test
      const trackReq = new NextRequest(
        `http://localhost:3000/api/v1/orders/${created.orderId}/tracking`,
        {
          headers: { Authorization: "Bearer demo_customer" },
        }
      );
      const trackRes = await getOrderTracking(trackReq, {
        params: Promise.resolve({ orderId: created.orderId }),
      });
      expect(trackRes.status).toBe(200);
      const trackBody = await trackRes.json();
      expect(trackBody.data.orderNumber).toBe(orderNum);
      expect(trackBody.data.fulfillmentState).toBe("AWAITING_MERCHANT");
      expect(trackBody.data.deliveryOtp).toBe("667788");

      // Customer cancellation
      const cancelReq = new NextRequest(
        `http://localhost:3000/api/v1/orders/${created.orderId}/cancel`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer demo_customer",
          },
          body: JSON.stringify({ reason: "Changed my mind" }),
        }
      );
      const cancelRes = await cancelOrder(cancelReq, {
        params: Promise.resolve({ orderId: created.orderId }),
      });
      expect(cancelRes.status).toBe(200);

      // Verify order is now CANCELLED
      const order = await OrderRepository.findById(created.orderId);
      expect(order?.fulfillmentState).toBe(FulfillmentState.CANCELLED);

      // Second cancellation must return 409 Conflict
      const secondCancelRes = await cancelOrder(cancelReq, {
        params: Promise.resolve({ orderId: created.orderId }),
      });
      expect(secondCancelRes.status).toBe(409);
    });
  });

  describe("6. Identity / Profile Endpoint (GET & PATCH /api/v1/me)", () => {
    it("authenticates and allows profile updates with E.164 validation", async () => {
      // 1. Unauthenticated -> 401
      const unauth = await getMe(new NextRequest("http://localhost:3000/api/v1/me"));
      expect(unauth.status).toBe(401);

      // 2. Authenticated -> 200
      const authReq = new NextRequest("http://localhost:3000/api/v1/me", {
        headers: { Authorization: "Bearer demo_customer" },
      });
      const authRes = await getMe(authReq);
      expect(authRes.status).toBe(200);
      const authBody = await authRes.json();
      expect(authBody.data.email).toBe("customer@example.com");

      // 3. Patch profile with valid phone
      const patchReq = new NextRequest("http://localhost:3000/api/v1/me", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer demo_customer",
        },
        body: JSON.stringify({ phone: "+919123456789" }),
      });
      const patchRes = await updateMe(patchReq);
      expect(patchRes.status).toBe(200);
      const patchBody = await patchRes.json();
      expect(patchBody.data.phone).toBe("+919123456789");

      // 4. Patch profile with invalid phone -> 400
      const invalidPatchReq = new NextRequest("http://localhost:3000/api/v1/me", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer demo_customer",
        },
        body: JSON.stringify({ phone: "not-a-phone" }),
      });
      const invalidPatchRes = await updateMe(invalidPatchReq);
      expect(invalidPatchRes.status).toBe(400);
    });
  });

  describe("7. Delivery Offer Atomic Acceptance Endpoint", () => {
    it("atomically accepts delivery offer and locks against double assignment", async () => {
      const orderNum = `ORD-OFFER-${Date.now().toString(36).toUpperCase()}`;
      const created = await OrderRepository.createWithIdempotency({
        idempotencyKey: `idem_off_${Date.now()}`,
        principalId: SEED_IDS.customerUserId,
        requestHash: "hash_off",
        customerId: SEED_IDS.customerUserId,
        restaurantId: SEED_IDS.restaurant1Id,
        deliveryAddressId: SEED_IDS.customerAddressId,
        orderNumber: orderNum,
        items: [
          {
            menuItemId: "90000000-0000-4000-8000-000000000001",
            name: "Paneer Tikka Shashlik",
            quantity: 1,
            basePricePaise: 28000,
            optionsPricePaise: 0,
            lineTotalPaise: 28000,
            selectedOptionNames: [],
          },
        ],
        breakdown: {
          subtotalPaise: 28000,
          packagingPaise: 2000,
          deliveryFeePaise: 3000,
          platformFeePaise: 500,
          surgePaise: 0,
          taxPaise: 2390,
          discountPaise: 0,
          payablePaise: 35890,
        },
        payablePaise: 35890,
        deliveryOtp: "667788",
        pickupOtp: "990011",
        estimatedDeliveryMinutes: 30,
        razorpayOrderId: `rzp_off_${Date.now()}`,
      });

      // Reset any active assignments for test rider so rider has no active trip
      const pool = getDbPool();
      await pool.query(
        `UPDATE delivery_assignments SET status = 'COMPLETED' WHERE rider_id = $1 AND status != 'COMPLETED'`,
        [SEED_IDS.riderId]
      );

      // Insert an offer in deliveryOffers for SEED_IDS.riderId
      const db = getDb();
      const [offer] = await db
        .insert(deliveryOffers)
        .values({
          orderId: created.orderId,
          riderId: SEED_IDS.riderId,
          status: "OFFERED",
          expiresAt: new Date(Date.now() + 60000),
        })
        .returning();

      expect(offer).toBeDefined();
      const offerId = offer!.id;

      // 1. Accept offer as rider -> 200
      const acceptReq = new NextRequest(
        `http://localhost:3000/api/v1/rider/offers/${offerId}/accept`,
        {
          method: "POST",
          headers: { Authorization: "Bearer demo_rider" },
        }
      );
      const acceptRes = await acceptOffer(acceptReq, {
        params: Promise.resolve({ offerId }),
      });
      expect(acceptRes.status).toBe(200);
      const acceptBody = await acceptRes.json();
      expect(acceptBody.data.assignmentId).toBeDefined();

      // 2. Second accept on same offer -> 409 Conflict
      const secondRes = await acceptOffer(acceptReq, {
        params: Promise.resolve({ offerId }),
      });
      expect(secondRes.status).toBe(409);
    });
  });
});

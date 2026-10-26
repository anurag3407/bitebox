import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { DeliveryTripStatus, FulfillmentState, PaymentMethod } from "@startup/contracts";
import {
  InvoiceRepository,
  MenuEditorRepository,
  NotificationRepository,
  SurplusRepository,
  OrderRepository,
  PayoutRepository,
  RestaurantRepository,
  RiderRepository,
  SEED_IDS,
  WalletRepository,
  BatchRepository,
  CorporateRepository,
  JobRepository,
  AuditRepository,
  AddonRepository,
  getDbPool,
  withTransaction,
} from "@startup/database";
import { platformEntity } from "../../worker/src/handlers.js";
import {
  MENU,
  call,
  createCustomerWithAddress,
  createMerchantStaff,
  createRider,
  createUser,
  deliverOrder,
} from "./helpers.js";

import { GET as getWallet } from "../src/app/api/v1/wallet/route.js";
import { GET as getReferrals } from "../src/app/api/v1/referrals/route.js";
import { POST as applyReferral } from "../src/app/api/v1/referrals/apply/route.js";
import { POST as createQuote } from "../src/app/api/v1/quotes/route.js";
import { POST as createCheckout } from "../src/app/api/v1/checkouts/route.js";
import { POST as cancelOrder } from "../src/app/api/v1/orders/[orderId]/cancel/route.js";
import { POST as createIssue, GET as getIssues } from "../src/app/api/v1/orders/[orderId]/issues/route.js";
import { GET as getMessages, POST as sendMessage } from "../src/app/api/v1/orders/[orderId]/messages/route.js";
import { POST as shareOrder } from "../src/app/api/v1/orders/[orderId]/share/route.js";
import { GET as publicTrack } from "../src/app/api/v1/track/[token]/route.js";
import { POST as saveProof } from "../src/app/api/v1/rider/trip/proof/route.js";
import { POST as riderMilestone } from "../src/app/api/v1/rider/trip/milestone/route.js";
import { GET as riderVerification, POST as uploadDocument } from "../src/app/api/v1/rider/verification/route.js";
import { POST as submitVerification } from "../src/app/api/v1/rider/verification/submit/route.js";
import { GET as adminKycList } from "../src/app/api/v1/admin/rider-verifications/route.js";
import { POST as reviewKyc } from "../src/app/api/v1/admin/rider-verifications/[riderId]/review/route.js";
import { POST as riderStatus } from "../src/app/api/v1/rider/status/route.js";
import { GET as diningRestaurants } from "../src/app/api/v1/dining/restaurants/route.js";
import { GET as diningAvailability } from "../src/app/api/v1/dining/restaurants/[restaurantId]/route.js";
import { GET as myReservations, POST as reserve } from "../src/app/api/v1/dining/reservations/route.js";
import { DELETE as cancelReservation } from "../src/app/api/v1/dining/reservations/[reservationId]/route.js";
import { GET as notificationPrefs, PATCH as updateNotificationPrefs } from "../src/app/api/v1/me/notifications/route.js";
import { POST as safetyEvent } from "../src/app/api/v1/safety/events/route.js";
import { GET as searchSuggestions } from "../src/app/api/v1/search/suggestions/route.js";
import { POST as verifyPayment } from "../src/app/api/v1/payments/verify/route.js";
import { POST as merchantAccept } from "../src/app/api/v1/merchant/orders/[orderId]/accept/route.js";
import { POST as merchantReady } from "../src/app/api/v1/merchant/orders/[orderId]/ready/route.js";
import { POST as merchantHandover } from "../src/app/api/v1/merchant/orders/[orderId]/handover/route.js";
import { GET as getOrder } from "../src/app/api/v1/orders/[orderId]/route.js";
import { POST as rateOrder } from "../src/app/api/v1/orders/[orderId]/rating/route.js";
import { GET as restaurantReviews } from "../src/app/api/v1/restaurants/[slug]/reviews/route.js";
import { POST as replyReview } from "../src/app/api/v1/merchant/restaurants/[restaurantId]/reviews/[ratingId]/reply/route.js";
import { POST as placeCall } from "../src/app/api/v1/orders/[orderId]/call/route.js";
import { POST as tipOrder } from "../src/app/api/v1/orders/[orderId]/tip/route.js";
import { GET as merchantCoupons, POST as createMerchantCoupon } from "../src/app/api/v1/merchant/restaurants/[restaurantId]/coupons/route.js";
import { PATCH as setCouponActive } from "../src/app/api/v1/merchant/restaurants/[restaurantId]/coupons/[couponId]/route.js";
import { GET as publicCoupons } from "../src/app/api/v1/coupons/route.js";
import { GET as surplusBags } from "../src/app/api/v1/surplus/route.js";
import { POST as purchaseSurplus } from "../src/app/api/v1/surplus/[listingId]/purchase/route.js";
import { GET as getMembership } from "../src/app/api/v1/membership/route.js";
import { GET as getNotifications } from "../src/app/api/v1/notifications/route.js";
import { POST as markNotificationsRead } from "../src/app/api/v1/notifications/read/route.js";
import { POST as purchaseMembership } from "../src/app/api/v1/membership/purchase/route.js";
import { POST as verifyMembership } from "../src/app/api/v1/membership/verify/route.js";
import { GET as riderRewards } from "../src/app/api/v1/rider/rewards/route.js";
import { POST as claimIncentive } from "../src/app/api/v1/rider/rewards/incentives/[incentiveId]/claim/route.js";
import { POST as bookShift } from "../src/app/api/v1/rider/rewards/shifts/[shiftId]/book/route.js";
import { POST as cancelShift } from "../src/app/api/v1/rider/rewards/shifts/[shiftId]/cancel/route.js";
import { GET as getMealPlans } from "../src/app/api/v1/meal-pass/plans/route.js";
import { GET as getMealPasses, POST as purchaseMealPass } from "../src/app/api/v1/meal-pass/passes/route.js";
import { GET as getMealDeliveries } from "../src/app/api/v1/meal-pass/deliveries/route.js";
import { POST as skipMeal } from "../src/app/api/v1/meal-pass/deliveries/[deliveryId]/skip/route.js";
import { GET as getCorporateMe } from "../src/app/api/v1/corporate/me/route.js";
import { GET as getCorporateSplit } from "../src/app/api/v1/corporate/split/route.js";
import { GET as getGiftCards, POST as buyGiftCard } from "../src/app/api/v1/gift-cards/route.js";
import { POST as redeemGiftCard } from "../src/app/api/v1/gift-cards/redeem/route.js";
import { GET as getAdminOperations } from "../src/app/api/v1/admin/operations/route.js";
import { POST as retryAdminJob } from "../src/app/api/v1/admin/jobs/[jobId]/retry/route.js";
import { GET as getDonations, POST as giveDonation } from "../src/app/api/v1/donations/route.js";
import { GET as getMerchantSurplus, POST as createMerchantSurplus } from "../src/app/api/v1/merchant/restaurants/[restaurantId]/surplus/route.js";
import { PATCH as patchMerchantSurplus } from "../src/app/api/v1/merchant/restaurants/[restaurantId]/surplus/[listingId]/route.js";
import { GET as getAddonUpsell } from "../src/app/api/v1/addons/upsell/route.js";
import { POST as addOneTapAddon } from "../src/app/api/v1/addons/route.js";
import { GET as getPersonalizedFeed } from "../src/app/api/v1/feed/personalized/route.js";
import { GET as getCorporateAccounts, POST as createCorporateAccountRoute } from "../src/app/api/v1/admin/corporate/accounts/route.js";
import { GET as getCorporateDropPoints } from "../src/app/api/v1/admin/corporate/drop-points/route.js";
import { POST as addCorporateEmployeeRoute } from "../src/app/api/v1/admin/corporate/accounts/[accountId]/employees/route.js";
import { GET as getRiderInsurance, POST as enrollRiderInsurance } from "../src/app/api/v1/rider/insurance/route.js";
import { POST as fileInsuranceClaim } from "../src/app/api/v1/rider/insurance/claims/route.js";
import { GET as getAdminInsuranceClaims } from "../src/app/api/v1/admin/insurance/claims/route.js";
import { POST as reviewInsuranceClaim } from "../src/app/api/v1/admin/insurance/claims/[claimId]/review/route.js";
import { GET as getAdminZones, POST as createAdminZone } from "../src/app/api/v1/admin/zones/route.js";
import { PATCH as patchAdminZone } from "../src/app/api/v1/admin/zones/[zoneId]/route.js";
import { POST as createAdminDropPoint } from "../src/app/api/v1/admin/zones/[zoneId]/drop-points/route.js";
import { GET as getZoneBatches } from "../src/app/api/v1/admin/zones/[zoneId]/batches/route.js";
import { PATCH as updateRestaurantSettings } from "../src/app/api/v1/merchant/restaurants/[restaurantId]/settings/route.js";
import { POST as lockZoneBatch } from "../src/app/api/v1/admin/zones/[zoneId]/batches/lock/route.js";
import { PATCH as assignBatchRider } from "../src/app/api/v1/admin/zones/[zoneId]/batches/[batchId]/route.js";
import { GET as getMe } from "../src/app/api/v1/me/route.js";
import { PATCH as updateLanguage } from "../src/app/api/v1/me/language/route.js";
import { GET as getRiderEquipment } from "../src/app/api/v1/rider/equipment/route.js";
import { POST as issueRiderEquipment } from "../src/app/api/v1/admin/rider-equipment/route.js";
import { PATCH as updateRiderEquipmentStatus } from "../src/app/api/v1/admin/rider-equipment/[riderId]/route.js";
import { GET as getCampuses } from "../src/app/api/v1/campus/route.js";
import { GET as getSponsorship, POST as buySponsorship } from "../src/app/api/v1/merchant/restaurants/[restaurantId]/sponsorship/route.js";
import { GET as getOrderSplit, POST as createOrderSplit } from "../src/app/api/v1/orders/[orderId]/split/route.js";
import { GET as getSharedSplit, POST as paySplit } from "../src/app/api/v1/splits/[token]/route.js";
import { POST as createGroupCart } from "../src/app/api/v1/group-carts/route.js";
import { GET as getGroupCart } from "../src/app/api/v1/group-carts/[code]/route.js";
import { POST as addGroupCartItem } from "../src/app/api/v1/group-carts/[code]/items/route.js";
import {
  PATCH as updateGroupCartItem,
  DELETE as removeGroupCartItem,
} from "../src/app/api/v1/group-carts/[code]/items/[itemId]/route.js";
import { POST as lockGroupCart } from "../src/app/api/v1/group-carts/[code]/lock/route.js";
import { POST as reopenGroupCart } from "../src/app/api/v1/group-carts/[code]/reopen/route.js";
import { POST as completeGroupCart } from "../src/app/api/v1/group-carts/[code]/complete/route.js";
import { GET as listDiningEvents } from "../src/app/api/v1/events/route.js";
import { GET as getDiningEvent } from "../src/app/api/v1/events/[eventId]/route.js";
import { POST as bookDiningEvent } from "../src/app/api/v1/events/[eventId]/book/route.js";
import { GET as listDiningEventBookings } from "../src/app/api/v1/events/bookings/route.js";
import { POST as cancelDiningEventBooking } from "../src/app/api/v1/events/bookings/[bookingId]/cancel/route.js";
import { GET as listCollections } from "../src/app/api/v1/collections/route.js";
import { GET as getCollection } from "../src/app/api/v1/collections/[slug]/route.js";
import { POST as recordSponsorshipEvent } from "../src/app/api/v1/sponsorship/events/route.js";
import { GET as getSponsorshipAnalytics } from "../src/app/api/v1/merchant/restaurants/[restaurantId]/sponsorship/analytics/route.js";
import { PATCH as updateSponsorshipCampaign } from "../src/app/api/v1/merchant/restaurants/[restaurantId]/sponsorship/route.js";
import { PATCH as updateEquipmentStatus } from "../src/app/api/v1/admin/rider-equipment/[riderId]/route.js";
import { POST as requestEquipmentRenewal } from "../src/app/api/v1/rider/equipment/route.js";
import { GET as getAdminConfig, PUT as updateAdminConfig } from "../src/app/api/v1/admin/config/route.js";
import { GET as getPublicConfig } from "../src/app/api/v1/config/route.js";
import { translate } from "../src/features/i18n/messages.js";

async function creditWallet(userId: string, paise: number) {
  await withTransaction((client) =>
    WalletRepository.creditWithClient(client, {
      userId,
      kind: "ADMIN_ADJUSTMENT",
      amountPaise: paise,
      referenceType: "TEST",
      referenceId: `test:${randomUUID()}`,
      description: "Test credit",
    })
  );
}

function istDate(daysAhead: number): string {
  const d = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(d);
}

describe("Refer & earn", () => {
  it("credits both wallets only after the friend's first delivery, and blocks a second code", async () => {
    const referrer = await createUser("CUSTOMER");
    const referee = await createCustomerWithAddress();
    const referral = await call(getReferrals, "GET", "/r", { token: referrer.token });
    expect(referral.status).toBe(200);
    const code = referral.body.data.code as string;
    expect(code).toMatch(/^BX[A-Z2-9]{8}$/);

    const applied = await call(applyReferral, "POST", "/r", { token: referee.token, body: { code } });
    expect(applied.status).toBe(201);
    expect(applied.body.data.status).toBe("PENDING");

    const rider = await createRider();
    await deliverOrder({ customer: referee, rider });

    const referrerWallet = await call(getWallet, "GET", "/w", { token: referrer.token });
    expect(referrerWallet.body.data.account.balancePaise).toBe(10_000);
    const refereeWallet = await call(getWallet, "GET", "/w", { token: referee.token });
    // ₹50 welcome reward + 2% cashback on the delivered order
    expect(refereeWallet.body.data.account.balancePaise).toBe(5_000 + 1_120);

    const second = await call(applyReferral, "POST", "/r", { token: referee.token, body: { code } });
    expect(second.status).toBe(409);
  });
});

describe("Wallet payments", () => {
  it("pays with credits atomically and refunds a cancelled wallet order back to credits", async () => {
    const customer = await createCustomerWithAddress();
    await creditWallet(customer.userId, 500_000);

    const quote = await call(createQuote, "POST", "/api/v1/quotes", {
      token: customer.token,
      body: {
        restaurantId: SEED_IDS.restaurant1Id,
        deliveryAddressId: customer.addressId,
        items: [{ menuItemId: MENU.paneerTikka, quantity: 1 }],
      },
    });
    expect(quote.status).toBe(200);
    const payable = quote.body.data.breakdown.payablePaise as number;

    const checkout = await call(createCheckout, "POST", "/api/v1/checkouts", {
      token: customer.token,
      body: {
        quoteId: quote.body.data.quoteId,
        deliveryAddressId: customer.addressId,
        idempotencyKey: `wallet_${randomUUID()}`,
        paymentMethod: "WALLET",
      },
    });
    expect(checkout.status).toBe(201);
    expect(checkout.body.data.paymentStatus).toBe("CAPTURED");
    expect(checkout.body.data.paymentMethod).toBe("WALLET");
    expect(checkout.body.data.paymentAttemptId).toBeUndefined();

    const afterPay = await call(getWallet, "GET", "/w", { token: customer.token });
    expect(afterPay.body.data.account.balancePaise).toBe(500_000 - payable);

    const db = await getDbPool().query(`SELECT payment_method, payment_status, fulfillment_state FROM orders WHERE id = $1`, [
      checkout.body.data.orderId,
    ]);
    expect(db.rows[0]).toEqual({ payment_method: "WALLET", payment_status: "CAPTURED", fulfillment_state: "AWAITING_MERCHANT" });

    const cancelled = await call(cancelOrder, "POST", "/c", {
      token: customer.token,
      params: { orderId: checkout.body.data.orderId },
      body: { reason: "Changed my mind" },
    });
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.data.refundedPaise).toBe(payable);
    const afterRefund = await call(getWallet, "GET", "/w", { token: customer.token });
    expect(afterRefund.body.data.account.balancePaise).toBe(500_000);
    const refund = await getDbPool().query(`SELECT status, provider_refund_id FROM refunds WHERE order_id = $1`, [
      checkout.body.data.orderId,
    ]);
    expect(refund.rows[0].status).toBe("PROCESSED");
    expect(refund.rows[0].provider_refund_id).toMatch(/^wallet-refund:/);
  });

  it("confirms cash-on-delivery without creating a gateway attempt", async () => {
    const customer = await createCustomerWithAddress();
    const quote = await call(createQuote, "POST", "/api/v1/quotes", {
      token: customer.token,
      body: {
        restaurantId: SEED_IDS.restaurant1Id,
        deliveryAddressId: customer.addressId,
        items: [{ menuItemId: MENU.paneerTikka, quantity: 1 }],
      },
    });
    const checkout = await call(createCheckout, "POST", "/api/v1/checkouts", {
      token: customer.token,
      body: {
        quoteId: quote.body.data.quoteId,
        deliveryAddressId: customer.addressId,
        idempotencyKey: `cod_${randomUUID()}`,
        paymentMethod: "COD",
      },
    });
    expect(checkout.status).toBe(201);
    expect(checkout.body.data.paymentStatus).toBe("PENDING");
    const db = await getDbPool().query(
      `SELECT o.payment_method, o.fulfillment_state, COUNT(pa.id)::int AS attempts
         FROM orders o LEFT JOIN payment_attempts pa ON pa.order_id = o.id
        WHERE o.id = $1 GROUP BY o.id`,
      [checkout.body.data.orderId]
    );
    expect(db.rows[0]).toEqual({ payment_method: "COD", fulfillment_state: "AWAITING_MERCHANT", attempts: 0 });
  });
});

describe("Contactless delivery, proof, COD collection and chat", () => {
  it("requires a doorstep photo, records cash, closes chat and increments the rider's deliveries", async () => {
    const customer = await createCustomerWithAddress();
    const rider = await createRider();
    const breakdown = {
      subtotalPaise: 28000,
      packagingPaise: 2000,
      deliveryFeePaise: 3000,
      platformFeePaise: 500,
      surgePaise: 0,
      taxPaise: 1400 + 990,
      discountPaise: 0,
      tipPaise: 0,
      foodTaxPaise: 1400,
      foodDiscountPaise: 0,
      payablePaise: 28000 + 2000 + 3000 + 500 + 2390,
    };
    const created = await OrderRepository.createWithIdempotency({
      idempotencyKey: `codproof_${randomUUID()}`,
      principalId: customer.userId,
      requestHash: "h",
      customerId: customer.userId,
      restaurantId: SEED_IDS.restaurant1Id,
      deliveryAddressId: customer.addressId,
      orderNumber: `ORD-P-${randomUUID().slice(0, 8).toUpperCase()}`,
      items: [
        {
          menuItemId: MENU.paneerTikka,
          name: "Paneer Tikka Shashlik",
          quantity: 1,
          basePricePaise: 28000,
          optionsPricePaise: 0,
          lineTotalPaise: 28000,
          selectedOptionNames: [],
        },
      ],
      breakdown,
      payablePaise: breakdown.payablePaise,
      deliveryOtp: "4321",
      pickupOtp: "8765",
      estimatedDeliveryMinutes: 30,
      paymentMethod: PaymentMethod.COD,
      contactless: true,
    });
    expect(created.paymentStatus).toBe("PENDING");
    const orderId = created.orderId;

    await OrderRepository.updateFulfillmentState({
      orderId,
      fromState: FulfillmentState.AWAITING_MERCHANT,
      toState: FulfillmentState.ACCEPTED,
      actorType: "MERCHANT",
    });
    await OrderRepository.updateFulfillmentState({
      orderId,
      fromState: FulfillmentState.ACCEPTED,
      toState: FulfillmentState.READY_FOR_PICKUP,
      actorType: "MERCHANT",
    });
    const { assignmentId } = await RiderRepository.assignManually({
      orderId,
      riderId: rider.riderId,
      adminId: customer.userId,
      reason: "test",
    });
    await RiderRepository.advanceTrip({ assignmentId, riderId: rider.riderId, nextStatus: DeliveryTripStatus.AT_PICKUP });
    await RiderRepository.advanceTrip({ assignmentId, riderId: rider.riderId, nextStatus: DeliveryTripStatus.PICKED_UP });
    await RiderRepository.advanceTrip({ assignmentId, riderId: rider.riderId, nextStatus: DeliveryTripStatus.AT_DROPOFF });

    // Chat works while the trip is active
    const sent = await call(sendMessage, "POST", "/m", {
      token: customer.token,
      params: { orderId },
      body: { channel: "CUSTOMER_RIDER", body: "Please leave it at the door" },
    });
    expect(sent.status).toBe(201);
    const riderReply = await call(sendMessage, "POST", "/m", {
      token: rider.token,
      params: { orderId },
      body: { channel: "CUSTOMER_RIDER", body: "On it — adding a photo now" },
    });
    expect(riderReply.status).toBe(201);
    const messages = await call(getMessages, "GET", `/m?channel=CUSTOMER_RIDER`, {
      token: customer.token,
      params: { orderId },
    });
    expect(messages.body.data.messages).toHaveLength(2);

    // Contactless completion is blocked until a photo exists
    const blocked = await call(riderMilestone, "POST", "/t", {
      token: rider.token,
      body: { assignmentId, nextStatus: "COMPLETED", challengeCode: "4321" },
    });
    expect(blocked.status).toBe(400);
    expect(blocked.body.error?.message).toMatch(/photo/i);

    const proof = await call(saveProof, "POST", `/p?orderId=${orderId}`, {
      token: rider.token,
      body: { photoUrl: "https://images.example.test/proof.jpg", latitude: 28.6315, longitude: 77.2167 },
    });
    expect(proof.status).toBe(201);

    const completed = await call(riderMilestone, "POST", "/t", {
      token: rider.token,
      body: { assignmentId, nextStatus: "COMPLETED", challengeCode: "4321" },
    });
    expect(completed.status).toBe(200);
    expect(completed.body.data.fulfillmentState).toBe("DELIVERED");

    const paid = await getDbPool().query(
      `SELECT o.payment_status, o.delivery_proof_url, (SELECT provider_payment_id FROM payments WHERE order_id = o.id) AS provider,
              r.delivery_count
         FROM orders o JOIN delivery_assignments da ON da.order_id = o.id JOIN riders r ON r.id = da.rider_id
        WHERE o.id = $1`,
      [orderId]
    );
    expect(paid.rows[0].payment_status).toBe("CAPTURED");
    expect(paid.rows[0].provider).toBe(`cod:${orderId}`);
    expect(paid.rows[0].delivery_proof_url).toBe("https://images.example.test/proof.jpg");
    const cash = await getDbPool().query(
      `SELECT 1 FROM ledger_entries le JOIN ledger_transactions lt ON lt.id = le.transaction_id
        WHERE lt.order_id = $1 AND le.account = 'CASH_IN_TRANSIT'`,
      [orderId]
    );
    expect(cash.rows.length).toBe(1);

    // Chat closes after delivery
    const closed = await call(sendMessage, "POST", "/m", {
      token: customer.token,
      params: { orderId },
      body: { channel: "CUSTOMER_RIDER", body: "Thanks!" },
    });
    expect(closed.status).toBe(409);
  });
});

describe("Rider KYC", () => {
  it("keeps a pending rider offline, then verifies documents and allows going online", async () => {
    const riderUser = await createUser("RIDER");
    const rider = await getDbPool().query(
      `INSERT INTO riders (user_id, name, phone, is_approved, is_online, verification_status)
       VALUES ($1, 'KYC Rider', '+919811111111', true, false, 'PENDING') RETURNING id`,
      [riderUser.userId]
    );
    const riderId = rider.rows[0].id as string;

    const onlineBefore = await call(riderStatus, "POST", "/s", { token: riderUser.token, body: { isOnline: true } });
    expect(onlineBefore.status).toBe(403);
    expect(onlineBefore.body.error?.message).toMatch(/KYC/i);

    for (const docType of ["PROFILE_PHOTO", "AADHAAR", "DRIVING_LICENSE", "VEHICLE_RC"]) {
      const uploaded = await call(uploadDocument, "POST", "/d", {
        token: riderUser.token,
        body: { docType, fileUrl: `https://images.example.test/kyc/${docType.toLowerCase()}.jpg` },
      });
      expect(uploaded.status).toBe(201);
    }
    const submitted = await call(submitVerification, "POST", "/sub", {
      token: riderUser.token,
      body: { aadhaarLast4: "1234", consentBackgroundCheck: true },
    });
    expect(submitted.status).toBe(200);
    expect(submitted.body.data.status).toBe("IN_REVIEW");

    const admin = await createUser("ADMIN");
    const queue = await call(adminKycList, "GET", "/k?status=IN_REVIEW", { token: admin.token });
    expect(queue.body.data.some((r: { riderId: string }) => r.riderId === riderId)).toBe(true);

    const approved = await call(reviewKyc, "POST", "/k/review", {
      token: admin.token,
      params: { riderId },
      body: { decision: "APPROVE", note: "Documents verified" },
    });
    expect(approved.status).toBe(200);
    expect(approved.body.data.status).toBe("VERIFIED");

    const onlineAfter = await call(riderStatus, "POST", "/s", { token: riderUser.token, body: { isOnline: true } });
    expect(onlineAfter.status).toBe(200);
    expect(onlineAfter.body.data.isOnline).toBe(true);

    const profile = await call(riderVerification, "GET", "/v", { token: riderUser.token });
    expect(profile.body.data.missingDocs).toHaveLength(0);
  });
});

describe("Loyalty and BiteBox Gold", () => {
  it("credits 2% cashback on every delivery, unlocks Gold at five, then waives delivery fees", async () => {
    const customer = await createCustomerWithAddress();
    const rider = await createRider();
    for (let i = 0; i < 5; i++) await deliverOrder({ customer, rider });

    const wallet = await call(getWallet, "GET", "/w", { token: customer.token });
    expect(wallet.body.data.account.balancePaise).toBe(5 * 1_120);
    const cashback = await getDbPool().query(
      `SELECT COUNT(*)::int AS count, SUM(amount_paise)::int AS total
         FROM wallet_transactions WHERE user_id = $1 AND kind = 'CASHBACK'`,
      [customer.userId]
    );
    expect(cashback.rows[0]).toEqual({ count: 5, total: 5_600 });

    const membership = await call(getMembership, "GET", "/m", { token: customer.token });
    expect(membership.status).toBe(200);
    expect(membership.body.data.active.planCode).toBe("GOLD");
    expect(membership.body.data.deliveredOrders).toBe(5);
    expect(membership.body.data.ordersToGold).toBe(0);

    const quote = await call(createQuote, "POST", "/api/v1/quotes", {
      token: customer.token,
      body: {
        restaurantId: SEED_IDS.restaurant1Id,
        deliveryAddressId: customer.addressId,
        items: [{ menuItemId: MENU.paneerTikka, quantity: 1 }],
      },
    });
    expect(quote.status).toBe(200);
    expect(quote.body.data.breakdown.deliveryFeePaise).toBe(0);
    expect(quote.body.data.membership).toMatchObject({ name: "BiteBox Gold", freeDeliveryApplied: true });
  });
});

describe("Paid BiteBox Gold", () => {
  it("buys Gold through Razorpay, activates it once and records membership revenue", async () => {
    const customer = await createUser("CUSTOMER");
    const overview = await call(getMembership, "GET", "/m", { token: customer.token });
    const plan = overview.body.data.plans.find((p: { code: string }) => p.code === "GOLD");
    expect(plan.pricePaise).toBe(9_900);

    const purchase = await call(purchaseMembership, "POST", "/m/purchase", {
      token: customer.token,
      body: { planId: plan.id },
    });
    expect(purchase.status).toBe(201);
    expect(purchase.body.data.simulatedPayment).toBe(true);

    const verifyBody = {
      purchaseId: purchase.body.data.purchaseId,
      razorpayOrderId: purchase.body.data.razorpayOrderId,
      razorpayPaymentId: `pay_gold_${randomUUID().slice(0, 12)}`,
      razorpaySignature: "mock_valid_sig_verification_token",
    };
    const verified = await call(verifyMembership, "POST", "/m/verify", { token: customer.token, body: verifyBody });
    expect(verified.status).toBe(200);
    expect(verified.body.data.membership.planCode).toBe("GOLD");
    const firstEnd = verified.body.data.membership.endsAt;

    // Replaying verification must not extend the membership twice
    const replay = await call(verifyMembership, "POST", "/m/verify", { token: customer.token, body: verifyBody });
    expect(replay.status).toBe(200);
    expect(replay.body.data.alreadyProcessed).toBe(true);
    expect(replay.body.data.membership.endsAt).toBe(firstEnd);

    const stored = await getDbPool().query(
      `SELECT mp.status, mp.amount_paise,
              (SELECT source FROM user_memberships WHERE user_id = mp.user_id AND status = 'ACTIVE') AS source
         FROM membership_purchases mp WHERE mp.id = $1`,
      [purchase.body.data.purchaseId]
    );
    expect(stored.rows[0]).toEqual({ status: "PAID", amount_paise: 9_900, source: "PURCHASED" });
    const ledger = await getDbPool().query(
      `SELECT SUM(debit_paise)::int AS d, SUM(credit_paise)::int AS c FROM ledger_entries`
    );
    expect(ledger.rows[0].d).toBe(ledger.rows[0].c);
  });
});

describe("Merchant promotions", () => {
  it("creates an outlet coupon that reaches checkout, applies in quoting and can be paused", async () => {
    const merchant = await createMerchantStaff(SEED_IDS.restaurant1Id);
    const code = `TEST${randomUUID().replace(/[^a-z0-9]/gi, "").slice(0, 6).toUpperCase()}`;
    const created = await call(createMerchantCoupon, "POST", "/c", {
      token: merchant.token,
      params: { restaurantId: SEED_IDS.restaurant1Id },
      body: {
        code,
        type: "PERCENTAGE",
        discountValue: 15,
        maxDiscountPaise: 7_500,
        minOrderPaise: 19_900,
        description: "15% off the signature menu",
        usageLimitTotal: 10,
      },
    });
    expect(created.status).toBe(201);
    expect(created.body.data.restaurantId).toBe(SEED_IDS.restaurant1Id);
    expect(created.body.data.fundedBy).toBe("MERCHANT");

    const list = await call(merchantCoupons, "GET", "/c", {
      token: merchant.token,
      params: { restaurantId: SEED_IDS.restaurant1Id },
    });
    const saved = list.body.data.find((c: { code: string }) => c.code === code);
    expect(saved).toMatchObject({ redeemedCount: 0, isActive: true });

    const publicList = await call(publicCoupons, "GET", `/coupons?restaurantId=${SEED_IDS.restaurant1Id}`);
    expect(publicList.body.data.some((c: { code: string }) => c.code === code)).toBe(true);

    const customer = await createCustomerWithAddress();
    const quote = await call(createQuote, "POST", "/api/v1/quotes", {
      token: customer.token,
      body: {
        restaurantId: SEED_IDS.restaurant1Id,
        deliveryAddressId: customer.addressId,
        items: [{ menuItemId: MENU.paneerTikka, quantity: 1 }],
        couponCode: code,
      },
    });
    expect(quote.body.data.appliedCouponCode).toBe(code);
    expect(quote.body.data.breakdown.discountPaise).toBe(4_200);

    await creditWallet(customer.userId, 100000);
    const checkout = await call(createCheckout, "POST", "/co", {
      token: customer.token,
      body: {
        quoteId: quote.body.data.quoteId,
        deliveryAddressId: customer.addressId,
        idempotencyKey: `merchant_funded_${randomUUID()}`,
        paymentMethod: "WALLET",
      },
    });
    expect(checkout.status).toBe(201);
    const orderId = checkout.body.data.orderId as string;
    const order = await getDbPool().query(
      `SELECT merchant_funded_discount_paise, merchant_net_payout_paise FROM orders WHERE id = $1`,
      [orderId]
    );
    expect(order.rows[0].merchant_funded_discount_paise).toBe(4200);
    const ledger = await getDbPool().query(
      `SELECT le.account, le.debit_paise, le.credit_paise
         FROM ledger_entries le JOIN ledger_transactions lt ON lt.id = le.transaction_id
        WHERE lt.order_id = $1 AND le.account IN ('DISCOUNT_EXPENSE', 'MERCHANT_PAYABLE')`,
      [orderId]
    );
    expect(ledger.rows.some((r: any) => r.account === "DISCOUNT_EXPENSE")).toBe(false);
    expect(ledger.rows.find((r: any) => r.account === "MERCHANT_PAYABLE")?.credit_paise).toBe(
      order.rows[0].merchant_net_payout_paise
    );
    const report = await call(merchantCoupons, "GET", "/c", {
      token: merchant.token,
      params: { restaurantId: SEED_IDS.restaurant1Id },
    });
    expect(report.body.data.find((c: any) => c.code === code)).toMatchObject({
      fundedSpendPaise: 4200,
      attributedRevenuePaise: 0,
    });

    const paused = await call(setCouponActive, "PATCH", "/c", {
      token: merchant.token,
      params: { restaurantId: SEED_IDS.restaurant1Id, couponId: saved.id },
      body: { isActive: false },
    });
    expect(paused.status).toBe(200);
    const after = await call(publicCoupons, "GET", `/coupons?restaurantId=${SEED_IDS.restaurant1Id}`);
    expect(after.body.data.some((c: { code: string }) => c.code === code)).toBe(false);
  });
});

describe("Rescue bags", () => {
  it("buys a surplus bag with credits, keeps stock atomic and closes it with the pickup code", async () => {
    const customer = await createCustomerWithAddress();
    const merchant = await createMerchantStaff(SEED_IDS.restaurant1Id);
    const listing = await SurplusRepository.createListing({
      restaurantId: SEED_IDS.restaurant1Id,
      title: "Parity Rescue Bag",
      originalValuePaise: 30_000,
      platformFlatFeePaise: 2_000,
      quantity: 2,
      pickupWindowStart: new Date(Date.now() - 5 * 60_000),
      pickupWindowEnd: new Date(Date.now() + 60 * 60_000),
    });
    await creditWallet(customer.userId, 100_000);

    const list = await call(surplusBags, "GET", "/s");
    expect(list.status).toBe(200);
    const listed = list.body.data.listings.find((l: { id: string }) => l.id === listing.listing.id);
    expect(listed).toMatchObject({ title: "Parity Rescue Bag", quantityAvailable: 2 });
    expect(listed.discountPercent).toBeGreaterThan(0);

    const bought = await call(purchaseSurplus, "POST", "/s/purchase", {
      token: customer.token,
      params: { listingId: listing.listing.id },
      body: {},
    });
    expect(bought.status).toBe(201);
    expect(bought.body.data.paymentMethod).toBe("WALLET");
    const orderId = bought.body.data.orderId as string;

    const after = await getDbPool().query(
      `SELECT o.order_mode, o.fulfillment_state, o.payment_status, o.pickup_otp, sl.quantity_available
         FROM orders o JOIN surplus_listings sl ON sl.id = o.surplus_listing_id
        WHERE o.id = $1`,
      [orderId]
    );
    expect(after.rows[0]).toMatchObject({
      order_mode: "PICKUP",
      fulfillment_state: "READY_FOR_PICKUP",
      payment_status: "CAPTURED",
      quantity_available: 1,
    });
    const paid = await getDbPool().query(`SELECT provider_payment_id FROM payments WHERE order_id = $1`, [orderId]);
    expect(paid.rows[0].provider_payment_id).toBe(`wallet:${orderId}`);
    const wallet = await call(getWallet, "GET", "/w", { token: customer.token });
    expect(wallet.body.data.account.balancePaise).toBe(100_000 - listing.priced.salePricePaise);

    const handover = await call(merchantHandover, "POST", "/h", {
      token: merchant.token,
      params: { orderId },
      body: { pickupCode: after.rows[0].pickup_otp },
    });
    expect(handover.status).toBe(200);
    expect(handover.body.data.fulfillmentState).toBe("DELIVERED");
  });
});

describe("Post-delivery tips", () => {
  it("debits credits, records a rider payable and carries the tip into the next payout", async () => {
    const delivered = await deliverOrder();
    await creditWallet(delivered.customer.userId, 100_000);
    const tipped = await call(tipOrder, "POST", "/tip", {
      token: delivered.customer.token,
      params: { orderId: delivered.orderId },
      body: { amountPaise: 5_000 },
    });
    expect(tipped.status).toBe(201);
    expect(tipped.body.data.amountPaise).toBe(5_000);

    const wallet = await call(getWallet, "GET", "/w", { token: delivered.customer.token });
    expect(wallet.body.data.account.balancePaise).toBe(100_000 + 1_120 - 5_000);
    const walletTx = await getDbPool().query(
      `SELECT direction, amount_paise FROM wallet_transactions WHERE user_id = $1 AND kind = 'RIDER_TIP'`,
      [delivered.customer.userId]
    );
    expect(walletTx.rows).toEqual([{ direction: "DEBIT", amount_paise: 5_000 }]);

    const detail = await call(getOrder, "GET", "/o", { token: delivered.customer.token, params: { orderId: delivered.orderId } });
    expect(detail.body.data.tipPaise).toBe(5_000);

    const duplicate = await call(tipOrder, "POST", "/tip", {
      token: delivered.customer.token,
      params: { orderId: delivered.orderId },
      body: { amountPaise: 2_000 },
    });
    expect(duplicate.status).toBe(409);

    await PayoutRepository.runSettlement(new Date(Date.now() + 1000), { automaticTransfers: false });
    const payoutItem = await getDbPool().query(
      `SELECT amount_paise FROM payout_items WHERE tip_id = (SELECT id FROM order_tips WHERE order_id = $1) AND owner_type = 'RIDER'`,
      [delivered.orderId]
    );
    expect(payoutItem.rows).toEqual([{ amount_paise: 5_000 }]);
    const ledger = await getDbPool().query(
      `SELECT SUM(debit_paise)::int AS d, SUM(credit_paise)::int AS c FROM ledger_entries`
    );
    expect(ledger.rows[0].d).toBe(ledger.rows[0].c);
  });
});

describe("Order for someone else", () => {
  it("stores the gift details and routes masked calls to the recipient without exposing the number to riders", async () => {
    const customer = await createCustomerWithAddress();
    const rider = await createRider();
    const recipientPhone = "+919812345677";
    const quote = await call(createQuote, "POST", "/api/v1/quotes", {
      token: customer.token,
      body: {
        restaurantId: SEED_IDS.restaurant1Id,
        deliveryAddressId: customer.addressId,
        items: [{ menuItemId: MENU.paneerTikka, quantity: 1 }],
      },
    });
    const checkout = await call(createCheckout, "POST", "/api/v1/checkouts", {
      token: customer.token,
      body: {
        quoteId: quote.body.data.quoteId,
        deliveryAddressId: customer.addressId,
        idempotencyKey: `gift_${randomUUID()}`,
        paymentMethod: "COD",
        recipientName: "Priya Sharma",
        recipientPhone,
        giftMessage: "Happy birthday! Dinner is on me.",
      },
    });
    expect(checkout.status).toBe(201);
    const orderId = checkout.body.data.orderId as string;

    const detail = await call(getOrder, "GET", "/o", { token: customer.token, params: { orderId } });
    expect(detail.body.data.recipientName).toBe("Priya Sharma");
    expect(detail.body.data.recipientPhone).toBe(recipientPhone);
    expect(detail.body.data.giftMessage).toBe("Happy birthday! Dinner is on me.");

    await OrderRepository.updateFulfillmentState({
      orderId,
      fromState: FulfillmentState.AWAITING_MERCHANT,
      toState: FulfillmentState.ACCEPTED,
      actorType: "MERCHANT",
    });
    await RiderRepository.assignManually({ orderId, riderId: rider.riderId, adminId: customer.userId, reason: "test" });

    const riderView = await call(getOrder, "GET", "/o", { token: rider.token, params: { orderId } });
    expect(riderView.body.data.recipientName).toBe("Priya Sharma");
    expect(riderView.body.data.recipientPhone).toBeUndefined();

    const bridged = await call(placeCall, "POST", "/c", {
      token: rider.token,
      params: { orderId },
      body: { target: "CUSTOMER" },
    });
    expect(bridged.status).toBe(200);
    expect(bridged.body.data).toEqual({ mode: "DIRECT", phone: recipientPhone });
  });

  it("rejects gift details on pickup orders", async () => {
    const customer = await createUser("CUSTOMER");
    const quote = await call(createQuote, "POST", "/api/v1/quotes", {
      token: customer.token,
      body: { restaurantId: SEED_IDS.restaurant1Id, orderMode: "PICKUP", items: [{ menuItemId: MENU.paneerTikka, quantity: 1 }] },
    });
    const checkout = await call(createCheckout, "POST", "/api/v1/checkouts", {
      token: customer.token,
      body: {
        quoteId: quote.body.data.quoteId,
        idempotencyKey: `gift_pickup_${randomUUID()}`,
        paymentMethod: "RAZORPAY",
        recipientName: "Priya",
        recipientPhone: "+919812345677",
      },
    });
    expect(checkout.status).toBe(400);
    expect(checkout.body.error?.message).toMatch(/pickup/i);
  });
});

describe("Menu and restaurant detail", () => {
  it("exposes seed allergens, nutrition, serves, amenities and gallery, and saves new dish details", async () => {
    const seeded = await RestaurantRepository.findBySlug("punjabi-angithi");
    expect(seeded?.amenities).toContain("Outdoor seating");
    expect(seeded?.gallery.length).toBeGreaterThan(0);
    const paneer = seeded?.categories.flatMap((c) => c.items).find((i) => i.name === "Paneer Tikka Shashlik");
    expect(paneer).toMatchObject({ allergens: ["Milk"], spiceLevel: 2, serves: 1 });
    expect(paneer?.nutrition?.calories).toBe(320);

    const menu = await MenuEditorRepository.getEditableMenu(SEED_IDS.restaurant1Id);
    const category = menu.categories[0]!;
    const saved = await MenuEditorRepository.saveItem(SEED_IDS.restaurant1Id, null, {
      categoryId: category.id,
      name: "Allergen Test Dish",
      description: "Created by the parity test",
      pricePaise: 10_000,
      dietaryTag: "VEG",
      isBestseller: false,
      isAvailable: true,
      displayOrder: 99,
      allergens: ["Milk", "Nuts"],
      nutrition: { calories: 250, proteinG: 9, carbsG: 22, fatG: 12 },
      spiceLevel: 3,
      serves: 2,
      variants: [],
      modifierGroups: [],
    });
    const after = await RestaurantRepository.findBySlug("punjabi-angithi");
    const savedItem = after?.categories.flatMap((c) => c.items).find((i) => i.id === saved.id);
    expect(savedItem).toMatchObject({
      allergens: ["Milk", "Nuts"],
      spiceLevel: 3,
      serves: 2,
      nutrition: { calories: 250, proteinG: 9, carbsG: 22, fatG: 12 },
    });
    await MenuEditorRepository.archiveItem(SEED_IDS.restaurant1Id, saved.id);
  });
});

describe("Rich reviews", () => {
  it("stores review photos and dish ratings and publishes a merchant reply", async () => {
    const delivered = await deliverOrder();
    const rated = await call(rateOrder, "POST", "/r", {
      token: delivered.customer.token,
      params: { orderId: delivered.orderId },
      body: {
        foodRating: 5,
        deliveryRating: 4,
        comment: "The paneer was smoky and perfect.",
        photos: ["https://images.example.test/review-paneer.jpg"],
        dishRatings: [{ menuItemId: MENU.paneerTikka, rating: 5 }],
      },
    });
    expect(rated.status).toBe(201);

    const reviews = await call(restaurantReviews, "GET", "/reviews", { params: { slug: "punjabi-angithi" } });
    expect(reviews.status).toBe(200);
    const review = reviews.body.data.find((r: { comment?: string }) => r.comment === "The paneer was smoky and perfect.");
    expect(review.photos).toEqual(["https://images.example.test/review-paneer.jpg"]);
    expect(review.dishRatings[0]).toMatchObject({ menuItemId: MENU.paneerTikka, name: "Paneer Tikka Shashlik", rating: 5 });

    const merchant = await createMerchantStaff(SEED_IDS.restaurant1Id);
    const replied = await call(replyReview, "POST", "/reply", {
      token: merchant.token,
      params: { restaurantId: SEED_IDS.restaurant1Id, ratingId: review.id },
      body: { reply: "Thank you! The kitchen will be delighted." },
    });
    expect(replied.status).toBe(200);

    const after = await call(restaurantReviews, "GET", "/reviews", { params: { slug: "punjabi-angithi" } });
    const withReply = after.body.data.find((r: { id: string }) => r.id === review.id);
    expect(withReply.restaurantReply).toBe("Thank you! The kitchen will be delighted.");
    expect(withReply.restaurantRepliedAt).toBeTruthy();
  });
});

describe("Problem reports", () => {
  it("auto-credits missing items, blocks duplicates and escalates non-delivery", async () => {
    const customer = await createCustomerWithAddress();
    const rider = await createRider();
    const first = await deliverOrder({ customer, rider });
    const created = await call(createIssue, "POST", "/i", {
      token: customer.token,
      params: { orderId: first.orderId },
      body: {
        category: "MISSING_ITEM",
        description: "The paneer tikka was missing from the bag",
        itemIds: [MENU.paneerTikka],
        photos: [],
      },
    });
    expect(created.status).toBe(201);
    expect(created.body.data.status).toBe("RESOLVED");
    expect(created.body.data.walletCreditPaise).toBe(50_000);
    const wallet = await call(getWallet, "GET", "/w", { token: customer.token });
    // Instant remedy plus 2% cashback on the first delivered order
    expect(wallet.body.data.account.balancePaise).toBe(50_000 + 1_120);

    const duplicate = await call(createIssue, "POST", "/i", {
      token: customer.token,
      params: { orderId: first.orderId },
      body: { category: "MISSING_ITEM", description: "Again", itemIds: [MENU.paneerTikka], photos: [] },
    });
    expect(duplicate.status).toBe(409);

    const second = await deliverOrder({ customer, rider });
    const escalated = await call(createIssue, "POST", "/i", {
      token: customer.token,
      params: { orderId: second.orderId },
      body: { category: "NOT_DELIVERED", description: "Marked delivered but nothing arrived", itemIds: [], photos: [] },
    });
    expect(escalated.status).toBe(201);
    expect(escalated.body.data.status).toBe("UNDER_REVIEW");
    expect(escalated.body.data.supportTicketId).toBeTruthy();

    const list = await call(getIssues, "GET", "/i", { token: customer.token, params: { orderId: second.orderId } });
    expect(list.body.data).toHaveLength(1);
  });
});

describe("Dining out", () => {
  it("shows real-time slots, books a table and cancels it", async () => {
    const customer = await createUser("CUSTOMER");
    const restaurants = await call(diningRestaurants, "GET", "/d");
    expect(restaurants.status).toBe(200);
    const restaurant = restaurants.body.data[0] as { id: string; maxPartySize: number };

    const date = istDate(15);
    const availability = await call(diningAvailability, "GET", `/d?date=${date}`, {
      params: { restaurantId: restaurant.id },
    });
    expect(availability.status).toBe(200);
    const slot = availability.body.data.slots.find((s: { isAvailable: boolean }) => s.isAvailable) as { slot: string };
    expect(slot).toBeTruthy();

    const booking = await call(reserve, "POST", "/r", {
      token: customer.token,
      body: { restaurantId: restaurant.id, date, slot: slot.slot, partySize: 2, occasion: "DATE_NIGHT", specialRequest: "Window table" },
    });
    expect(booking.status).toBe(201);
    expect(booking.body.data.status).toBe("CONFIRMED");
    expect(booking.body.data.confirmationCode).toMatch(/^BB\d{6}$/);

    const mine = await call(myReservations, "GET", "/r", { token: customer.token });
    expect(mine.body.data.some((r: { id: string }) => r.id === booking.body.data.id)).toBe(true);

    const cancelled = await call(cancelReservation, "DELETE", "/r", {
      token: customer.token,
      params: { reservationId: booking.body.data.id },
    });
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.data.status).toBe("CANCELLED");
  });
});

describe("Self-pickup", () => {
  it("prices pickup without a delivery fee, closes it with the counter code and never assigns a rider", async () => {
    const customer = await createUser("CUSTOMER");
    const quote = await call(createQuote, "POST", "/api/v1/quotes", {
      token: customer.token,
      body: {
        restaurantId: SEED_IDS.restaurant1Id,
        orderMode: "PICKUP",
        items: [{ menuItemId: MENU.paneerTikka, quantity: 1 }],
      },
    });
    expect(quote.status).toBe(200);
    expect(quote.body.data.breakdown.deliveryFeePaise).toBe(0);
    expect(quote.body.data.breakdown.surgePaise).toBe(0);

    const checkout = await call(createCheckout, "POST", "/api/v1/checkouts", {
      token: customer.token,
      body: {
        quoteId: quote.body.data.quoteId,
        idempotencyKey: `pickup_${randomUUID()}`,
        paymentMethod: "RAZORPAY",
      },
    });
    expect(checkout.status).toBe(201);
    expect(checkout.body.data.razorpayOrderId).toBeTruthy();
    const orderId = checkout.body.data.orderId as string;

    const stored = await getDbPool().query(
      `SELECT delivery_address_id, order_mode, payment_status FROM orders WHERE id = $1`,
      [orderId]
    );
    expect(stored.rows[0]).toEqual({ delivery_address_id: null, order_mode: "PICKUP", payment_status: "PENDING" });

    const paid = await call(verifyPayment, "POST", "/p", {
      token: customer.token,
      body: {
        orderId,
        razorpayOrderId: checkout.body.data.razorpayOrderId,
        razorpayPaymentId: `pay_${randomUUID().slice(0, 14)}`,
        razorpaySignature: "mock_valid_sig_verification_token",
      },
    });
    expect(paid.status).toBe(200);

    const merchant = await createMerchantStaff(SEED_IDS.restaurant1Id);
    expect((await call(merchantAccept, "POST", "/a", { token: merchant.token, params: { orderId }, body: { preparationTimeMinutes: 10 } })).status).toBe(200);
    expect((await call(merchantReady, "POST", "/r", { token: merchant.token, params: { orderId } })).status).toBe(200);

    const code = (
      await getDbPool().query(`SELECT pickup_otp FROM orders WHERE id = $1`, [orderId])
    ).rows[0].pickup_otp as string;
    const wrong = await call(merchantHandover, "POST", "/h", {
      token: merchant.token,
      params: { orderId },
      body: { pickupCode: code === "0000" ? "1111" : "0000" },
    });
    expect(wrong.status).toBe(400);
    const handover = await call(merchantHandover, "POST", "/h", {
      token: merchant.token,
      params: { orderId },
      body: { pickupCode: code },
    });
    expect(handover.status).toBe(200);
    expect(handover.body.data.fulfillmentState).toBe("DELIVERED");

    const detail = await call(getOrder, "GET", "/o", { token: customer.token, params: { orderId } });
    expect(detail.body.data.orderMode).toBe("PICKUP");
    expect(detail.body.data.pickupCode).toBe(code);
    expect(detail.body.data.deliveryAddress.building).toBe("Punjabi Angithi");
    const final = await getDbPool().query(
      `SELECT o.fulfillment_state, o.pickup_verified_at,
              (SELECT COUNT(*)::int FROM delivery_assignments da WHERE da.order_id = o.id) AS trips
         FROM orders o WHERE o.id = $1`,
      [orderId]
    );
    expect(final.rows[0].fulfillment_state).toBe("DELIVERED");
    expect(final.rows[0].pickup_verified_at).not.toBeNull();
    expect(final.rows[0].trips).toBe(0);

    // Pickup invoices work without a customer_addresses row
    const invoice = await InvoiceRepository.issueForOrder(orderId, platformEntity());
    expect(invoice.created).toBe(true);
    const invoiceData = await getDbPool().query(`SELECT data_json FROM invoices WHERE order_id = $1`, [orderId]);
    expect(invoiceData.rows[0].data_json.customer.address).toContain("Punjabi Angithi");
  });

  it("refuses cash on delivery for pickup", async () => {
    const customer = await createUser("CUSTOMER");
    const quote = await call(createQuote, "POST", "/api/v1/quotes", {
      token: customer.token,
      body: {
        restaurantId: SEED_IDS.restaurant1Id,
        orderMode: "PICKUP",
        items: [{ menuItemId: MENU.paneerTikka, quantity: 1 }],
      },
    });
    const checkout = await call(createCheckout, "POST", "/api/v1/checkouts", {
      token: customer.token,
      body: {
        quoteId: quote.body.data.quoteId,
        idempotencyKey: `pickup_cod_${randomUUID()}`,
        paymentMethod: "COD",
      },
    });
    expect(checkout.status).toBe(400);
    expect(checkout.body.error?.message).toMatch(/pickup/i);
  });
});

describe("Search autocomplete", () => {
  it("suggests matching dishes and restaurants for the typed prefix", async () => {
    const res = await call(searchSuggestions, "GET", "/api/v1/search/suggestions?q=paneer");
    expect(res.status).toBe(200);
    expect(res.body.data.some((s: { type: string; text: string }) => s.type === "dish" && /paneer/i.test(s.text))).toBe(true);
    expect(res.body.data.length).toBeLessThanOrEqual(9);
    const short = await call(searchSuggestions, "GET", "/api/v1/search/suggestions?q=p");
    expect(short.body.data).toEqual([]);
  });
});

describe("Privacy-safe tracking links", () => {
  it("shares live status without exposing addresses or OTPs", async () => {
    const delivered = await deliverOrder();
    const share = await call(shareOrder, "POST", "/s", {
      token: delivered.customer.token,
      params: { orderId: delivered.orderId },
    });
    expect(share.status).toBe(201);
    const token = share.body.data.token as string;
    expect(share.body.data.url).toContain(`/track/${token}`);

    const publicView = await call(publicTrack, "GET", `/t/${token}`, { params: { token } });
    expect(publicView.status).toBe(200);
    expect(publicView.body.data.orderNumber).toBeTruthy();
    expect(publicView.body.data).not.toHaveProperty("deliveryAddress");
    expect(publicView.body.data).not.toHaveProperty("deliveryOtp");
    expect(publicView.body.data).not.toHaveProperty("breakdown");

    const invalid = await call(publicTrack, "GET", "/t/nope", { params: { token: "nope" } });
    expect(invalid.status).toBe(404);
  });
});

describe("In-app notifications", () => {
  it("lists durable notifications, dedupes repeats and marks them read", async () => {
    const customer = await createUser("CUSTOMER");
    await NotificationRepository.create(customer.userId, {
      kind: "order.accepted",
      title: "Order confirmed",
      body: "Your food is being prepared.",
      url: "/orders/example",
      dedupeKey: "order.accepted:example",
    });
    // A retried outbox handler must not duplicate the notification
    await NotificationRepository.create(customer.userId, {
      kind: "order.accepted",
      title: "Order confirmed",
      body: "Your food is being prepared.",
      url: "/orders/example",
      dedupeKey: "order.accepted:example",
    });
    await NotificationRepository.create(customer.userId, {
      kind: "loyalty.cashback",
      title: "2% back",
      body: "₹11 credited.",
      url: "/account?tab=wallet",
      dedupeKey: "loyalty.cashback:example",
    });

    const list = await call(getNotifications, "GET", "/n", { token: customer.token });
    expect(list.status).toBe(200);
    expect(list.body.data.notifications).toHaveLength(2);
    expect(list.body.data.unreadCount).toBe(2);

    const firstId = list.body.data.notifications[0].id as string;
    const readOne = await call(markNotificationsRead, "POST", "/n/read", {
      token: customer.token,
      body: { ids: [firstId] },
    });
    expect(readOne.body.data.updated).toBe(1);
    const partial = await call(getNotifications, "GET", "/n", { token: customer.token });
    expect(partial.body.data.unreadCount).toBe(1);

    await call(markNotificationsRead, "POST", "/n/read", { token: customer.token, body: {} });
    const allRead = await call(getNotifications, "GET", "/n", { token: customer.token });
    expect(allRead.body.data.unreadCount).toBe(0);
  });
});

describe("Notification preferences and SOS", () => {
  it("stores preferences and opens a priority safety conversation on SOS", async () => {
    const customer = await createUser("CUSTOMER");
    const updated = await call(updateNotificationPrefs, "PATCH", "/n", {
      token: customer.token,
      body: { offers: false, smsEnabled: false },
    });
    expect(updated.status).toBe(200);
    expect(updated.body.data.offers).toBe(false);
    const prefs = await call(notificationPrefs, "GET", "/n", { token: customer.token });
    expect(prefs.body.data.smsEnabled).toBe(false);

    const sos = await call(safetyEvent, "POST", "/s", {
      token: customer.token,
      body: { eventType: "SOS", latitude: 28.63, longitude: 77.21, note: "Test SOS" },
    });
    expect(sos.status).toBe(201);
    const ticket = await getDbPool().query(
      `SELECT t.id, t.status, (SELECT COUNT(*)::int FROM support_messages m WHERE m.ticket_id = t.id) AS messages
         FROM support_tickets t WHERE t.customer_id = $1`,
      [customer.userId]
    );
    expect(ticket.rows).toHaveLength(1);
    expect(ticket.rows[0].status).toBe("OPEN");
    expect(ticket.rows[0].messages).toBeGreaterThan(0);
  });
});

describe("Rider rewards and shifts", () => {
  it("unlocks a delivery quest, posts the bonus payable once, and protects shift capacity", async () => {
    const rider = await createRider();
    await deliverOrder({ rider });
    const title = `Test sprint ${randomUUID().slice(0, 8)}`;
    const incentive = await getDbPool().query(
      `INSERT INTO rider_incentives (code, title, description, target_deliveries, reward_paise, starts_at, ends_at)
       VALUES ($1, $2, 'Complete one delivery', 1, 7500, NOW() - interval '1 hour', NOW() + interval '10 minutes')
       RETURNING id`,
      [`TEST-${randomUUID().slice(0, 8)}`, title]
    );
    const incentiveId = incentive.rows[0].id as string;

    const overview = await call(riderRewards, "GET", "/rr", { token: rider.token });
    expect(overview.status).toBe(200);
    const quest = overview.body.data.incentives.find((i: any) => i.id === incentiveId);
    expect(quest.progressDeliveries).toBe(1);
    expect(quest.canClaim).toBe(true);

    const claimed = await call(claimIncentive, "POST", "/rr/claim", {
      token: rider.token,
      params: { incentiveId },
    });
    expect(claimed.status).toBe(201);
    expect(claimed.body.data.rewardPaise).toBe(7500);
    const duplicate = await call(claimIncentive, "POST", "/rr/claim", {
      token: rider.token,
      params: { incentiveId },
    });
    expect(duplicate.status).toBe(409);

    const earnings = await PayoutRepository.earningsSummary("RIDER", rider.riderId);
    expect(earnings.unsettledPaise).toBeGreaterThanOrEqual(7500 + 5000);
    const ledger = await getDbPool().query(
      `SELECT account, COALESCE(SUM(debit_paise), 0)::int AS debit, COALESCE(SUM(credit_paise), 0)::int AS credit
         FROM ledger_entries WHERE description LIKE $1 GROUP BY account`,
      [`${title}%`]
    );
    const expense = ledger.rows.find((r) => r.account === "RIDER_INCENTIVE_EXPENSE");
    const payable = ledger.rows.find((r) => r.account === "RIDER_PAYABLE");
    expect(expense.debit).toBe(7500);
    expect(payable.credit).toBe(7500);

    const shift = await getDbPool().query(
      `INSERT INTO rider_shifts (label, starts_at, ends_at, capacity)
       VALUES ('Test lunch shift', NOW() + interval '1 day', NOW() + interval '1 day 4 hours', 1)
       RETURNING id`
    );
    const shiftId = shift.rows[0].id as string;
    const other = await createRider();
    expect((await call(bookShift, "POST", "/rr/book", { token: rider.token, params: { shiftId } })).status).toBe(201);
    expect((await call(bookShift, "POST", "/rr/book", { token: other.token, params: { shiftId } })).status).toBe(409);
    expect((await call(cancelShift, "POST", "/rr/cancel", { token: rider.token, params: { shiftId } })).status).toBe(200);
    expect((await call(bookShift, "POST", "/rr/book", { token: other.token, params: { shiftId } })).status).toBe(201);

    const overlap = await getDbPool().query(
      `INSERT INTO rider_shifts (label, starts_at, ends_at, capacity)
       VALUES ('Overlapping shift', NOW() + interval '1 day 2 hours', NOW() + interval '1 day 6 hours', 4)
       RETURNING id`
    );
    const overlapBooking = await call(bookShift, "POST", "/rr/book", {
      token: other.token,
      params: { shiftId: overlap.rows[0].id },
    });
    expect(overlapBooking.status).toBe(409);
  });
});

describe("Meal passes", () => {
  it("charges credits, schedules weekday meals and skips early without losing the meal", async () => {
    const customer = await createUser("CUSTOMER");
    await creditWallet(customer.userId, 40000);
    const plans = await call(getMealPlans, "GET", "/mp", { token: customer.token });
    expect(plans.status).toBe(200);
    const plan = plans.body.data.plans.find((p: any) => p.name === "3-meal trial lunch pass");
    expect(plan).toBeTruthy();
    expect(plan.kitchenContractPayoutPaise).toBeUndefined();

    const bought = await call(purchaseMealPass, "POST", "/mp", {
      token: customer.token,
      body: { planId: plan.id },
    });
    expect(bought.status).toBe(201);
    expect(bought.body.data.paymentMethod).toBe("WALLET");
    expect(bought.body.data.scheduledDeliveries).toBeGreaterThan(0);

    const wallet = await getDbPool().query(`SELECT balance_paise FROM wallet_accounts WHERE user_id = $1`, [customer.userId]);
    expect(wallet.rows[0].balance_paise).toBe(40000 - plan.pricePaise);

    const passes = await call(getMealPasses, "GET", "/mp", { token: customer.token });
    const pass = passes.body.data.passes.find((p: any) => p.id === bought.body.data.pass.id);
    expect(pass.mealsRemaining).toBe(plan.totalMeals);
    expect(pass.totalMeals).toBe(plan.totalMeals);

    const ledger = await getDbPool().query(
      `SELECT account, COALESCE(SUM(debit_paise), 0)::int AS debit, COALESCE(SUM(credit_paise), 0)::int AS credit
         FROM ledger_entries WHERE description LIKE $1 GROUP BY account`,
      [`%(${bought.body.data.pass.id})`]
    );
    const deferred = ledger.rows.find((r) => r.account === "MEAL_PASS_DEFERRED_REVENUE");
    const gateway = ledger.rows.find((r) => r.account === "GATEWAY_CLEARING");
    expect(deferred.credit).toBe(plan.pricePaise);
    expect(gateway.debit).toBe(plan.pricePaise);
    const walletTxn = await getDbPool().query(
      `SELECT kind, direction, amount_paise FROM wallet_transactions WHERE reference_id = $1`,
      [bought.body.data.pass.id]
    );
    expect(walletTxn.rows[0]).toMatchObject({ kind: "MEAL_PASS_PAYMENT", direction: "DEBIT", amount_paise: plan.pricePaise });

    const deliveries = await call(getMealDeliveries, "GET", "/mp", { token: customer.token });
    const scheduled = deliveries.body.data.deliveries.filter((d: any) => d.status === "SCHEDULED");
    expect(scheduled.length).toBeGreaterThan(0);
    const skipped = await call(skipMeal, "POST", "/mp/skip", {
      token: customer.token,
      params: { deliveryId: scheduled[0].id },
    });
    expect(skipped.status).toBe(200);
    expect(skipped.body.data.status).toBe("SKIPPED_EARLY");
    expect(skipped.body.data.mealsRemaining).toBe(plan.totalMeals);

    const broke = await createUser("CUSTOMER");
    const rejected = await call(purchaseMealPass, "POST", "/mp", {
      token: broke.token,
      body: { planId: plan.id },
    });
    expect(rejected.status).toBe(402);
    const noPass = await getDbPool().query(`SELECT COUNT(*)::int AS count FROM user_meal_passes WHERE user_id = $1`, [broke.userId]);
    expect(noPass.rows[0].count).toBe(0);
  });
});

describe("Corporate lunch club", () => {
  it("shows membership and allowance, then charges the overage to credits", async () => {
    const customer = await createCustomerWithAddress();
    const cluster = await BatchRepository.createCluster({
      cityId: SEED_IDS.cityId,
      name: `Parity Corporate ${randomUUID().slice(0, 6)}`,
      polygonGeojson: [
        { latitude: 28.61, longitude: 77.2 },
        { latitude: 28.62, longitude: 77.2 },
        { latitude: 28.62, longitude: 77.22 },
      ],
    });
    const drop = await BatchRepository.createDropPoint({
      clusterId: cluster.id,
      name: "Parity Tech Park",
      latitude: 28.614,
      longitude: 77.2095,
    });
    const account = await CorporateRepository.createAccount({
      companyName: "Parity Labs",
      gstin: "29ABCDE1234F1Z5",
      billingAddress: "Tech Park, Noida",
      dropPointId: drop.id,
      dailyAllowancePerEmployeePaise: 15000,
      subsidyPercentageBp: 10000,
      corporateManagementFeeBp: 500,
    });
    await CorporateRepository.addEmployee({
      corporateAccountId: account.id,
      userId: customer.userId,
      costCenterCode: "ENG-02",
      emailDomain: "parity.test",
    });

    const membership = await call(getCorporateMe, "GET", "/c", { token: customer.token });
    expect(membership.status).toBe(200);
    expect(membership.body.data).toMatchObject({
      member: true,
      companyName: "Parity Labs",
      costCenterCode: "ENG-02",
      dailyAllowancePaise: 15000,
      remainingAllowancePaise: 15000,
      dropPointName: "Parity Tech Park",
    });

    const quote = await call(createQuote, "POST", "/q", {
      token: customer.token,
      body: {
        restaurantId: SEED_IDS.restaurant1Id,
        deliveryAddressId: customer.addressId,
        items: [{ menuItemId: MENU.paneerTikka, quantity: 2 }],
      },
    });
    const payable = quote.body.data.breakdown.payablePaise as number;
    const split = await call(
      getCorporateSplit,
      "GET",
      `/c/split?accountId=${account.id}&orderTotalPaise=${payable}`,
      { token: customer.token }
    );
    expect(split.status).toBe(200);
    expect(split.body.data.coveredPaise).toBe(15000);
    expect(split.body.data.employeePayablePaise).toBe(payable - 15000);

    await creditWallet(customer.userId, payable + 10000);
    const before = await getDbPool().query(`SELECT balance_paise FROM wallet_accounts WHERE user_id = $1`, [customer.userId]);
    const order = await CorporateRepository.createCorporateOrder({
      userId: customer.userId,
      quoteId: quote.body.data.quoteId,
      corporateAccountId: account.id,
    });
    const after = await getDbPool().query(`SELECT balance_paise FROM wallet_accounts WHERE user_id = $1`, [customer.userId]);
    expect(before.rows[0].balance_paise - after.rows[0].balance_paise).toBe(order.split.employeePayablePaise);
    const payment = await getDbPool().query(`SELECT provider_payment_id, amount_paise FROM payments WHERE order_id = $1`, [
      order.order.id,
    ]);
    expect(payment.rows[0]).toMatchObject({
      provider_payment_id: `wallet:${order.order.id}`,
      amount_paise: order.split.employeePayablePaise,
    });

    const afterMembership = await call(getCorporateMe, "GET", "/c", { token: customer.token });
    expect(afterMembership.body.data.usedTodayPaise).toBe(15000);
    expect(afterMembership.body.data.ordersToday).toBe(1);
    expect(afterMembership.body.data.remainingAllowancePaise).toBe(0);
    expect(afterMembership.body.data.unbilledBalancePaise).toBe(order.split.corporateBilledPaise);

    const outsider = await createUser("CUSTOMER");
    const noMembership = await call(getCorporateMe, "GET", "/c", { token: outsider.token });
    expect(noMembership.body.data).toEqual({ member: false });
  });
});

describe("Gift cards", () => {
  it("issues a card from credits and moves the liability until a one-time redemption", async () => {
    const buyer = await createUser("CUSTOMER");
    const recipient = await createUser("CUSTOMER");
    await creditWallet(buyer.userId, 100000);

    const bought = await call(buyGiftCard, "POST", "/g", {
      token: buyer.token,
      body: {
        amountPaise: 25000,
        recipientName: "Priya",
        recipientContact: "priya@example.test",
        message: "Lunch is on me",
      },
    });
    expect(bought.status).toBe(201);
    const card = bought.body.data.card;
    expect(card.code).toMatch(/^BXG-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    expect(card).toMatchObject({ amountPaise: 25000, status: "ACTIVE", recipientName: "Priya" });

    const buyerWallet = await getDbPool().query(`SELECT balance_paise FROM wallet_accounts WHERE user_id = $1`, [buyer.userId]);
    expect(buyerWallet.rows[0].balance_paise).toBe(75000);

    const purchaseLedger = await getDbPool().query(
      `SELECT account, credit_paise, debit_paise FROM ledger_entries WHERE description LIKE $1`,
      [`%${card.code}%`]
    );
    expect(purchaseLedger.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ account: "GIFT_CARD_LIABILITY", credit_paise: 25000 }),
        expect.objectContaining({ account: "WALLET_LIABILITY", debit_paise: 25000 }),
      ])
    );

    const selfRedeem = await call(redeemGiftCard, "POST", "/g/redeem", {
      token: buyer.token,
      body: { code: card.code },
    });
    expect(selfRedeem.status).toBe(403);

    const redeemed = await call(redeemGiftCard, "POST", "/g/redeem", {
      token: recipient.token,
      body: { code: card.code },
    });
    expect(redeemed.status).toBe(200);
    expect(redeemed.body.data.balancePaise).toBe(25000);
    expect(redeemed.body.data.card.status).toBe("REDEEMED");

    const duplicate = await call(redeemGiftCard, "POST", "/g/redeem", {
      token: recipient.token,
      body: { code: card.code },
    });
    expect(duplicate.status).toBe(409);

    const redemptionLedger = await getDbPool().query(
      `SELECT account, credit_paise, debit_paise FROM ledger_entries WHERE description LIKE $1`,
      [`%${card.code}%`]
    );
    expect(redemptionLedger.rows).toEqual(
      expect.arrayContaining([expect.objectContaining({ account: "GIFT_CARD_LIABILITY", debit_paise: 25000 })])
    );

    const list = await call(getGiftCards, "GET", "/g", { token: buyer.token });
    expect(list.body.data.cards.find((c: any) => c.id === card.id)?.status).toBe("REDEEMED");

    const expired = await getDbPool().query(
      `INSERT INTO gift_cards (code, purchaser_id, recipient_name, amount_paise, status, expires_at)
       VALUES ($1, $2, 'Late Ravi', 10000, 'ACTIVE', NOW() - interval '1 day') RETURNING code`,
      [`BXG-TEST-${randomUUID().slice(0, 4).toUpperCase()}`, buyer.userId]
    );
    const expiredRedeem = await call(redeemGiftCard, "POST", "/g/redeem", {
      token: recipient.token,
      body: { code: expired.rows[0].code },
    });
    expect(expiredRedeem.status).toBe(409);
  });
});

describe("Merchant chat", () => {
  it("lets restaurant staff message the customer only on the restaurant channel", async () => {
    const customer = await createCustomerWithAddress();
    const merchant = await createMerchantStaff(SEED_IDS.restaurant1Id);
    const quote = await call(createQuote, "POST", "/q", {
      token: customer.token,
      body: {
        restaurantId: SEED_IDS.restaurant1Id,
        deliveryAddressId: customer.addressId,
        items: [{ menuItemId: MENU.paneerTikka, quantity: 1 }],
      },
    });
    const checkout = await call(createCheckout, "POST", "/c", {
      token: customer.token,
      body: {
        quoteId: quote.body.data.quoteId,
        deliveryAddressId: customer.addressId,
        idempotencyKey: `merchant_chat_${randomUUID()}`,
        paymentMethod: "COD",
      },
    });
    const orderId = checkout.body.data.orderId as string;

    const wrongChannel = await call(getMessages, "GET", "/m?channel=CUSTOMER_RIDER", {
      token: merchant.token,
      params: { orderId },
    });
    expect(wrongChannel.status).toBe(403);

    const sent = await call(sendMessage, "POST", "/m", {
      token: merchant.token,
      params: { orderId },
      body: { channel: "CUSTOMER_MERCHANT", body: "Your order is being prepared" },
    });
    expect(sent.status).toBe(201);
    expect(sent.body.data.senderType).toBe("MERCHANT");

    const merchantView = await call(getMessages, "GET", "/m?channel=CUSTOMER_MERCHANT", {
      token: merchant.token,
      params: { orderId },
    });
    expect(merchantView.body.data.viewer).toBe("MERCHANT");
    expect(merchantView.body.data.messages.some((m: any) => m.body === "Your order is being prepared")).toBe(true);

    const customerView = await call(getMessages, "GET", "/m?channel=CUSTOMER_MERCHANT", {
      token: customer.token,
      params: { orderId },
    });
    expect(customerView.body.data.messages.some((m: any) => m.body === "Your order is being prepared")).toBe(true);
  });
});

describe("Admin operations", () => {
  it("shows queue health and zones, then retries a failed job with an audit entry", async () => {
    const admin = await createUser("ADMIN");
    const customer = await createUser("CUSTOMER");
    const cluster = await BatchRepository.createCluster({
      cityId: SEED_IDS.cityId,
      name: `Ops Zone ${randomUUID().slice(0, 6)}`,
      polygonGeojson: [
        { latitude: 28.61, longitude: 77.2 },
        { latitude: 28.62, longitude: 77.2 },
        { latitude: 28.62, longitude: 77.22 },
      ],
    });
    const jobId = await JobRepository.enqueue("TEST_JOB", { probe: true });
    expect(jobId).toBeTruthy();
    if (!jobId) throw new Error("job was not enqueued");
    await getDbPool().query(
      `UPDATE jobs SET status = 'FAILED', attempt_count = max_attempts, last_error = 'Simulated failure' WHERE id = $1`,
      [jobId]
    );

    const forbidden = await call(getAdminOperations, "GET", "/ops", { token: customer.token });
    expect(forbidden.status).toBe(403);

    const ops = await call(getAdminOperations, "GET", "/ops", { token: admin.token });
    expect(ops.status).toBe(200);
    expect(ops.body.data.failedJobs.some((j: any) => j.id === jobId)).toBe(true);
    expect(ops.body.data.jobs.find((j: any) => j.id === jobId)).toMatchObject({ status: "FAILED", lastError: "Simulated failure" });
    expect(ops.body.data.clusters.some((c: any) => c.id === cluster.id && c.isActive)).toBe(true);

    const retried = await call(retryAdminJob, "POST", "/ops/retry", {
      token: admin.token,
      params: { jobId },
    });
    expect(retried.status).toBe(200);
    const job = await getDbPool().query(`SELECT status, attempt_count, last_error FROM jobs WHERE id = $1`, [jobId]);
    expect(job.rows[0]).toEqual({ status: "PENDING", attempt_count: 0, last_error: null });

    const audits = await AuditRepository.listRecent(20);
    expect(audits.some((a) => a.action === "JOB_RETRY" && a.targetId === jobId)).toBe(true);

    const secondRetry = await call(retryAdminJob, "POST", "/ops/retry", {
      token: admin.token,
      params: { jobId },
    });
    expect(secondRetry.status).toBe(409);
  });
});

describe("Donations", () => {
  it("moves credits into the donation payable fund and records a receipt", async () => {
    const donor = await createUser("CUSTOMER");
    await creditWallet(donor.userId, 5000);
    const before = await call(getDonations, "GET", "/d", { token: donor.token });
    expect(before.body.data.totalPaise).toBe(0);

    const given = await call(giveDonation, "POST", "/d", { token: donor.token, body: { amountPaise: 1000 } });
    expect(given.status).toBe(201);
    const donation = given.body.data.donation;
    expect(donation.receiptCode).toMatch(/^DON-[A-Z0-9]{8}$/);

    const wallet = await getDbPool().query(`SELECT balance_paise FROM wallet_accounts WHERE user_id = $1`, [donor.userId]);
    expect(wallet.rows[0].balance_paise).toBe(4000);
    const txn = await getDbPool().query(
      `SELECT kind, direction, amount_paise FROM wallet_transactions WHERE reference_id = $1`,
      [donation.id]
    );
    expect(txn.rows[0]).toMatchObject({ kind: "DONATION", direction: "DEBIT", amount_paise: 1000 });

    const ledger = await getDbPool().query(
      `SELECT account, credit_paise, debit_paise FROM ledger_entries WHERE description LIKE $1`,
      [`%${donation.receiptCode}%`]
    );
    expect(ledger.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ account: "DONATION_PAYABLE", credit_paise: 1000 }),
        expect.objectContaining({ account: "WALLET_LIABILITY", debit_paise: 1000 }),
      ])
    );

    const after = await call(getDonations, "GET", "/d", { token: donor.token });
    expect(after.body.data.totalPaise).toBe(1000);
    expect(after.body.data.donations[0].receiptCode).toBe(donation.receiptCode);

    const broke = await createUser("CUSTOMER");
    const rejected = await call(giveDonation, "POST", "/d", { token: broke.token, body: { amountPaise: 1000 } });
    expect(rejected.status).toBe(402);
    const none = await getDbPool().query(`SELECT COUNT(*)::int AS count FROM donations WHERE user_id = $1`, [broke.userId]);
    expect(none.rows[0].count).toBe(0);
  });
});

describe("Merchant rescue bags", () => {
  it("publishes, hides and restores a surplus listing for its own outlet", async () => {
    const merchant = await createMerchantStaff(SEED_IDS.restaurant1Id);
    const outsider = await createMerchantStaff(SEED_IDS.restaurant2Id);
    const start = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
    const end = new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString();
    const title = `Merchant rescue ${randomUUID().slice(0, 6)}`;

    const created = await call(createMerchantSurplus, "POST", "/s", {
      token: merchant.token,
      params: { restaurantId: SEED_IDS.restaurant1Id },
      body: {
        title,
        originalValuePaise: 50000,
        discountBp: 6000,
        platformFlatFeePaise: 2000,
        quantity: 4,
        pickupWindowStart: start,
        pickupWindowEnd: end,
      },
    });
    expect(created.status).toBe(201);
    const listing = created.body.data.listing;
    expect(listing).toMatchObject({ title, salePricePaise: 20000, quantityAvailable: 4, status: "ACTIVE" });

    const preview = await call(surplusBags, "GET", "/s");
    expect(preview.body.data.listings.some((l: any) => l.id === listing.id)).toBe(true);

    const foreign = await call(getMerchantSurplus, "GET", "/s", {
      token: outsider.token,
      params: { restaurantId: SEED_IDS.restaurant1Id },
    });
    expect(foreign.status).toBe(403);

    const paused = await call(patchMerchantSurplus, "PATCH", "/s/x", {
      token: merchant.token,
      params: { restaurantId: SEED_IDS.restaurant1Id, listingId: listing.id },
      body: { status: "CANCELLED" },
    });
    expect(paused.status).toBe(200);
    const hidden = await call(surplusBags, "GET", "/s");
    expect(hidden.body.data.listings.some((l: any) => l.id === listing.id)).toBe(false);

    const resumed = await call(patchMerchantSurplus, "PATCH", "/s/x", {
      token: merchant.token,
      params: { restaurantId: SEED_IDS.restaurant1Id, listingId: listing.id },
      body: { status: "ACTIVE" },
    });
    expect(resumed.status).toBe(200);
    const visible = await call(surplusBags, "GET", "/s");
    expect(visible.body.data.listings.some((l: any) => l.id === listing.id)).toBe(true);
  });
});

describe("Order add-ons", () => {
  it("offers one-tap extras and charges them to credits without extra fees", async () => {
    const customer = await createCustomerWithAddress();
    const quote = await call(createQuote, "POST", "/q", {
      token: customer.token,
      body: {
        restaurantId: SEED_IDS.restaurant1Id,
        deliveryAddressId: customer.addressId,
        items: [{ menuItemId: MENU.paneerTikka, quantity: 1 }],
      },
    });
    const checkout = await call(createCheckout, "POST", "/c", {
      token: customer.token,
      body: {
        quoteId: quote.body.data.quoteId,
        deliveryAddressId: customer.addressId,
        idempotencyKey: `addon_${randomUUID()}`,
        paymentMethod: "COD",
      },
    });
    const parentOrderId = checkout.body.data.orderId as string;
    await getDbPool().query(`UPDATE orders SET slot_cutoff_at = NOW() + interval '1 hour' WHERE id = $1`, [parentOrderId]);
    const sku = await AddonRepository.createSku({
      restaurantId: SEED_IDS.restaurant1Id,
      name: `Addon ${randomUUID().slice(0, 5)}`,
      pricePaise: 100,
      cogsPaise: 50,
      stockCount: 1,
    });
    await creditWallet(customer.userId, 10000);

    const upsell = await call(getAddonUpsell, "GET", `/a?parentOrderId=${parentOrderId}`, { token: customer.token });
    expect(upsell.status).toBe(200);
    expect(upsell.body.data.skus.some((s: any) => s.id === sku.id)).toBe(true);

    const added = await call(addOneTapAddon, "POST", "/a", {
      token: customer.token,
      body: { parentOrderId, addonSkuId: sku.id },
    });
    expect(added.status).toBe(201);
    expect(added.body.data.paymentMethod).toBe("WALLET");
    expect(added.body.data.payablePaise).toBeGreaterThan(0);
    const childId = added.body.data.orderId as string;
    const childRow = await getDbPool().query(`SELECT payment_method, payment_status, parent_order_id, order_type FROM orders WHERE id = $1`, [childId]);
    expect(childRow.rows[0]).toMatchObject({
      payment_method: "WALLET",
      payment_status: "CAPTURED",
      parent_order_id: parentOrderId,
      order_type: "ADDON",
    });
    const txn = await getDbPool().query(`SELECT kind, direction, amount_paise FROM wallet_transactions WHERE reference_id = $1`, [childId]);
    expect(txn.rows[0]).toMatchObject({ kind: "ORDER_PAYMENT", direction: "DEBIT", amount_paise: added.body.data.payablePaise });
    const payment = await getDbPool().query(`SELECT provider_payment_id FROM payments WHERE order_id = $1`, [childId]);
    expect(payment.rows[0].provider_payment_id).toBe(`wallet:${childId}`);

    const after = await call(getAddonUpsell, "GET", `/a?parentOrderId=${parentOrderId}`, { token: customer.token });
    expect(after.body.data.skus.some((s: any) => s.id === sku.id)).toBe(false);
  });
});

describe("Personalized feed", () => {
  it("derives cuisine affinity, reorder kitchens and new recommendations from delivered orders", async () => {
    const customer = await createCustomerWithAddress();
    await deliverOrder({ customer, restaurantId: SEED_IDS.restaurant1Id });
    await deliverOrder({ customer, restaurantId: SEED_IDS.restaurant1Id });
    await deliverOrder({ customer, restaurantId: SEED_IDS.restaurant2Id });

    const feed = await call(
      getPersonalizedFeed,
      "GET",
      "/f?latitude=28.6315&longitude=77.2167",
      { token: customer.token }
    );
    expect(feed.status).toBe(200);
    expect(feed.body.data.affinity).toEqual(
      expect.arrayContaining([expect.objectContaining({ cuisine: "North Indian", orders: 3 })])
    );
    expect(feed.body.data.headline).toBe("Because you ordered North Indian");
    const reorderIds = feed.body.data.reorder.map((r: any) => r.id);
    expect(reorderIds).toEqual(expect.arrayContaining([SEED_IDS.restaurant1Id, SEED_IDS.restaurant2Id]));
    expect(feed.body.data.recommended.length).toBeGreaterThan(0);
    for (const r of feed.body.data.recommended) {
      expect(reorderIds).not.toContain(r.id);
    }

    const newcomer = await createUser("CUSTOMER");
    const generic = await call(getPersonalizedFeed, "GET", "/f", { token: newcomer.token });
    expect(generic.body.data.reorder).toEqual([]);
    expect(generic.body.data.recommended.length).toBeGreaterThan(0);
    expect(generic.body.data.headline).toBe("Popular near you");
  });
});

describe("Corporate admin console", () => {
  it("creates a company, enrols a member by email and lists it for admins only", async () => {
    const admin = await createUser("ADMIN");
    const customer = await createCustomerWithAddress();
    const cluster = await BatchRepository.createCluster({
      cityId: SEED_IDS.cityId,
      name: `Admin Corporate ${randomUUID().slice(0, 6)}`,
      polygonGeojson: [
        { latitude: 28.61, longitude: 77.2 },
        { latitude: 28.62, longitude: 77.2 },
        { latitude: 28.62, longitude: 77.22 },
      ],
    });
    const drop = await BatchRepository.createDropPoint({
      clusterId: cluster.id,
      name: "Admin Tower Lobby",
      latitude: 28.614,
      longitude: 77.2095,
    });

    const points = await call(getCorporateDropPoints, "GET", "/c", { token: admin.token });
    expect(points.status).toBe(200);
    expect(points.body.data.dropPoints.some((p: any) => p.id === drop.id && p.clusterName === cluster.name)).toBe(true);

    const created = await call(createCorporateAccountRoute, "POST", "/c", {
      token: admin.token,
      body: {
        companyName: "Admin Corp",
        gstin: "29ABCDE1234F1Z5",
        billingAddress: "Admin Tower, Noida",
        dropPointId: drop.id,
        dailyAllowancePerEmployeePaise: 18000,
        subsidyPercentageBp: 10000,
        corporateManagementFeeBp: 500,
        creditLimitPaise: 300000,
      },
    });
    expect(created.status).toBe(201);
    const accountId = created.body.data.account.id as string;

    const enrolled = await call(addCorporateEmployeeRoute, "POST", "/c", {
      token: admin.token,
      params: { accountId },
      body: { email: `missing-${randomUUID()}@example.test`, costCenterCode: "ENG-09" },
    });
    expect(enrolled.status).toBe(404);

    const email = (await getDbPool().query(`SELECT email FROM app_users WHERE id = $1`, [customer.userId])).rows[0].email as string;
    const employee = await call(addCorporateEmployeeRoute, "POST", "/c", {
      token: admin.token,
      params: { accountId },
      body: { email, costCenterCode: "ENG-09" },
    });
    expect(employee.status).toBe(201);

    const list = await call(getCorporateAccounts, "GET", "/c", { token: admin.token });
    const row = list.body.data.accounts.find((a: any) => a.id === accountId);
    expect(row).toMatchObject({ companyName: "Admin Corp", employees: 1, creditLimitPaise: 300000 });

    const forbidden = await call(getCorporateAccounts, "GET", "/c", { token: customer.token });
    expect(forbidden.status).toBe(403);
  });
});

describe("Rider insurance", () => {
  it("activates cover, files a claim, approves it into payouts and blocks unverified riders", async () => {
    const rider = await createRider();
    const before = await call(getRiderInsurance, "GET", "/ri", { token: rider.token });
    expect(before.body.data.policy).toBeNull();

    const enrolled = await call(enrollRiderInsurance, "POST", "/ri", { token: rider.token });
    expect(enrolled.status).toBe(201);
    expect(enrolled.body.data.policy).toMatchObject({
      status: "ACTIVE",
      coveragePaise: 50000000,
      hospitalCashPaise: 5000000,
    });

    const claim = await call(fileInsuranceClaim, "POST", "/ri/claims", {
      token: rider.token,
      body: {
        incidentType: "ACCIDENT",
        incidentDate: new Date().toISOString().slice(0, 10),
        description: "Skidded near the market and injured my right arm while on a delivery.",
        claimedPaise: 50000,
      },
    });
    expect(claim.status).toBe(201);
    const claimId = claim.body.data.claim.id as string;
    expect(claim.body.data.claim.status).toBe("PENDING");

    const admin = await createUser("ADMIN");
    const queue = await call(getAdminInsuranceClaims, "GET", "/ai", { token: admin.token });
    expect(queue.body.data.claims.some((c: any) => c.id === claimId && c.riderName === "Test Rider")).toBe(true);

    const missingNote = await call(reviewInsuranceClaim, "POST", "/ai/review", {
      token: admin.token,
      params: { claimId },
      body: { status: "REJECTED" },
    });
    expect(missingNote.status).toBe(400);

    const approved = await call(reviewInsuranceClaim, "POST", "/ai/review", {
      token: admin.token,
      params: { claimId },
      body: { status: "APPROVED", approvedPaise: 30000, note: "Bills verified" },
    });
    expect(approved.status).toBe(200);
    expect(approved.body.data.claim).toMatchObject({ status: "APPROVED", approvedPaise: 30000 });

    const earnings = await PayoutRepository.earningsSummary("RIDER", rider.riderId);
    expect(earnings.unsettledPaise).toBeGreaterThanOrEqual(30000);
    const ledger = await getDbPool().query(
      `SELECT account, debit_paise, credit_paise FROM ledger_entries WHERE description = $1`,
      [`Insurance claim ${claimId} approved`]
    );
    expect(ledger.rows[0]).toMatchObject({ account: "RIDER_INSURANCE_EXPENSE", debit_paise: 30000 });
    const payable = await getDbPool().query(
      `SELECT credit_paise FROM ledger_entries WHERE description = 'Insurance claim payable to rider' AND transaction_id = (
         SELECT transaction_id FROM ledger_entries WHERE description = $1
       )`,
      [`Insurance claim ${claimId} approved`]
    );
    expect(payable.rows[0].credit_paise).toBe(30000);

    const again = await call(reviewInsuranceClaim, "POST", "/ai/review", {
      token: admin.token,
      params: { claimId },
      body: { status: "APPROVED", approvedPaise: 30000 },
    });
    expect(again.status).toBe(409);

    const pendingUser = await createUser("RIDER");
    await getDbPool().query(
      `INSERT INTO riders (user_id, name, phone, is_approved, verification_status)
       VALUES ($1, 'Pending Rider', '+919800000001', false, 'PENDING')`,
      [pendingUser.userId]
    );
    const blocked = await call(enrollRiderInsurance, "POST", "/ri", { token: pendingUser.token });
    expect(blocked.status).toBe(403);
  });
});

describe("Zone management", () => {
  it("creates a zone and drop point from admin ops, then pauses the zone", async () => {
    const admin = await createUser("ADMIN");
    const customer = await createUser("CUSTOMER");
    const zoneName = `Zone ${randomUUID().slice(0, 6)}`;
    const created = await call(createAdminZone, "POST", "/z", {
      token: admin.token,
      body: {
        name: zoneName,
        cityId: SEED_IDS.cityId,
        centerLatitude: 28.6315,
        centerLongitude: 77.2167,
        radiusMeters: 2500,
      },
    });
    expect(created.status).toBe(201);
    const zoneId = created.body.data.zone.id as string;

    const drop = await call(createAdminDropPoint, "POST", "/z/drop", {
      token: admin.token,
      params: { zoneId },
      body: { name: "Metro Gate 2", latitude: 28.633, longitude: 77.218 },
    });
    expect(drop.status).toBe(201);

    const list = await call(getAdminZones, "GET", "/z", { token: admin.token });
    expect(list.status).toBe(200);
    const zone = list.body.data.zones.find((z: any) => z.id === zoneId);
    expect(zone).toMatchObject({ name: zoneName, isActive: true });
    expect(zone.dropPoints.some((p: any) => p.name === "Metro Gate 2")).toBe(true);
    expect(list.body.data.cities.some((c: any) => c.id === SEED_IDS.cityId)).toBe(true);

    const paused = await call(patchAdminZone, "PATCH", "/z", {
      token: admin.token,
      params: { zoneId },
      body: { isActive: false },
    });
    expect(paused.status).toBe(200);
    expect(paused.body.data.zone.isActive).toBe(false);

    const audited = await AuditRepository.listRecent(30);
    expect(audited.some((a) => a.action === "ZONE_CREATED" && a.targetId === zoneId)).toBe(true);
    expect(audited.some((a) => a.action === "DROP_POINT_CREATED" && a.details?.clusterId === zoneId)).toBe(true);

    const forbidden = await call(getAdminZones, "GET", "/z", { token: customer.token });
    expect(forbidden.status).toBe(403);
  });
});

describe("Batch operations", () => {
  it("lists paid drops for a zone and locks them into one manifest batch", async () => {
    const admin = await createUser("ADMIN");
    const customer = await createCustomerWithAddress();
    const zone = await BatchRepository.createCluster({
      cityId: SEED_IDS.cityId,
      name: `Batch Zone ${randomUUID().slice(0, 6)}`,
      polygonGeojson: [
        { latitude: 28.61, longitude: 77.2 },
        { latitude: 28.62, longitude: 77.2 },
        { latitude: 28.62, longitude: 77.22 },
      ],
    });
    const drop = await BatchRepository.createDropPoint({
      clusterId: zone.id,
      name: "Batch Tower",
      latitude: 28.614,
      longitude: 77.2095,
    });
    const quote = await call(createQuote, "POST", "/q", {
      token: customer.token,
      body: {
        restaurantId: SEED_IDS.restaurant1Id,
        deliveryAddressId: customer.addressId,
        items: [{ menuItemId: MENU.paneerTikka, quantity: 1 }],
      },
    });
    const checkout = await call(createCheckout, "POST", "/c", {
      token: customer.token,
      body: {
        quoteId: quote.body.data.quoteId,
        deliveryAddressId: customer.addressId,
        idempotencyKey: `batch_${randomUUID()}`,
        paymentMethod: "COD",
      },
    });
    const orderId = checkout.body.data.orderId as string;
    await getDbPool().query(
      `UPDATE orders SET payment_status = 'CAPTURED', drop_point_id = $2, slot_window = '12:30-13:30', batch_id = NULL WHERE id = $1`,
      [orderId, drop.id]
    );

    const before = await call(getZoneBatches, "GET", "/z", { token: admin.token, params: { zoneId: zone.id } });
    expect(before.status).toBe(200);
    expect(before.body.data.candidates).toEqual(
      expect.arrayContaining([expect.objectContaining({ slotWindow: "12:30-13:30", orders: 1, drops: 1 })])
    );

    const locked = await call(lockZoneBatch, "POST", "/z/lock", {
      token: admin.token,
      params: { zoneId: zone.id },
      body: {
        slotWindow: "12:30-13:30",
        slotStart: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        slotEnd: new Date(Date.now() + 90 * 60 * 1000).toISOString(),
      },
    });
    expect(locked.status).toBe(201);
    expect(locked.body.data).toMatchObject({ status: "LOCKED", orders: 1, totalDrops: 1 });
    expect(locked.body.data.manifest.drops[0]).toMatchObject({ dropPointId: drop.id, bagCount: 1 });

    const after = await call(getZoneBatches, "GET", "/z", { token: admin.token, params: { zoneId: zone.id } });
    expect(after.body.data.candidates).toEqual([]);
    expect(after.body.data.batches.some((b: any) => b.id === locked.body.data.batchId && b.orderCount === 1)).toBe(true);

    const rider = await createRider();
    const assigned = await call(assignBatchRider, "PATCH", "/z/b", {
      token: admin.token,
      params: { zoneId: zone.id, batchId: locked.body.data.batchId },
      body: { riderId: rider.riderId },
    });
    expect(assigned.status).toBe(200);
    const withRider = await call(getZoneBatches, "GET", "/z", { token: admin.token, params: { zoneId: zone.id } });
    expect(withRider.body.data.batches.find((b: any) => b.id === locked.body.data.batchId)).toMatchObject({
      riderId: rider.riderId,
      riderName: "Test Rider",
    });
    const cleared = await call(assignBatchRider, "PATCH", "/z/b", {
      token: admin.token,
      params: { zoneId: zone.id, batchId: locked.body.data.batchId },
      body: { riderId: null },
    });
    expect(cleared.body.data.riderId).toBeNull();

    const audited = await AuditRepository.listRecent(30);
    expect(audited.some((a) => a.action === "BATCH_LOCKED" && a.targetId === locked.body.data.batchId)).toBe(true);

    const forbidden = await call(getZoneBatches, "GET", "/z", { token: customer.token, params: { zoneId: zone.id } });
    expect(forbidden.status).toBe(403);
  });
});

describe("Language preference", () => {
  it("stores English/Hindi on the account and exposes it on /me", async () => {
    const user = await createUser("CUSTOMER");
    const initial = await call(getMe, "GET", "/me", { token: user.token });
    expect(initial.body.data.language).toBe("en");

    const updated = await call(updateLanguage, "PATCH", "/me/language", {
      token: user.token,
      body: { language: "hi" },
    });
    expect(updated.status).toBe(200);
    expect(updated.body.data.language).toBe("hi");

    const after = await call(getMe, "GET", "/me", { token: user.token });
    expect(after.body.data.language).toBe("hi");

    const invalid = await call(updateLanguage, "PATCH", "/me/language", {
      token: user.token,
      body: { language: "fr" },
    });
    expect(invalid.status).toBe(400);

    const anonymous = await call(updateLanguage, "PATCH", "/me/language", { body: { language: "hi" } });
    expect(anonymous.status).toBe(401);
  });
});

describe("Rider equipment", () => {
  it("issues kit to a rider and updates the same item instead of duplicating it", async () => {
    const rider = await createRider();
    const admin = await createUser("ADMIN");
    const before = await call(getRiderEquipment, "GET", "/re", { token: rider.token });
    expect(before.body.data.equipment).toEqual([]);

    const issued = await call(issueRiderEquipment, "POST", "/re", {
      token: admin.token,
      body: { riderId: rider.riderId, itemType: "HELMET", size: "M" },
    });
    expect(issued.status).toBe(201);
    expect(issued.body.data.equipment).toMatchObject({ itemType: "HELMET", size: "M", status: "ISSUED" });

    const again = await call(issueRiderEquipment, "POST", "/re", {
      token: admin.token,
      body: { riderId: rider.riderId, itemType: "HELMET", size: "L" },
    });
    expect(again.status).toBe(201);
    const list = await call(getRiderEquipment, "GET", "/re", { token: rider.token });
    expect(list.body.data.equipment).toHaveLength(1);
    expect(list.body.data.equipment[0]).toMatchObject({ itemType: "HELMET", size: "L" });

    const returned = await call(updateRiderEquipmentStatus, "PATCH", "/re/x", {
      token: admin.token,
      params: { riderId: rider.riderId },
      body: { itemType: "HELMET", status: "RETURNED" },
    });
    expect(returned.status).toBe(200);
    expect(returned.body.data.equipment.status).toBe("RETURNED");
    const afterReturn = await call(getRiderEquipment, "GET", "/re", { token: rider.token });
    expect(afterReturn.body.data.equipment[0].status).toBe("RETURNED");

    const audited = await AuditRepository.listRecent(20);
    expect(audited.some((a) => a.action === "RIDER_KIT_ISSUED" && a.targetId === rider.riderId)).toBe(true);

    const forbidden = await call(issueRiderEquipment, "POST", "/re", {
      token: rider.token,
      body: { riderId: rider.riderId, itemType: "DELIVERY_BAG" },
    });
    expect(forbidden.status).toBe(403);
  });
});

describe("Campus meals", () => {
  it("lists campus drop points and plans, keeps them out of the general pass list, and buys with a drop point", async () => {
    const campuses = await call(getCampuses, "GET", "/campus");
    expect(campuses.status).toBe(200);
    const campus = campuses.body.data.campuses.find((c: any) => c.name === "IIT Delhi campus");
    expect(campus).toBeTruthy();
    expect(campus.dropPoints).toEqual(expect.arrayContaining([expect.objectContaining({ name: "Hostel Gate 1" })]));
    const plan = campus.plans.find((p: any) => p.name === "Campus 5-lunch pass");
    expect(plan).toMatchObject({ totalMeals: 5, pricePaise: 39900 });

    const general = await call(getMealPlans, "GET", "/mp");
    expect(general.body.data.plans.some((p: any) => p.id === plan.id)).toBe(false);

    const customer = await createUser("CUSTOMER");
    await creditWallet(customer.userId, 50000);
    const bought = await call(purchaseMealPass, "POST", "/mp", {
      token: customer.token,
      body: { planId: plan.id, dropPointId: campus.dropPoints[0].id },
    });
    expect(bought.status).toBe(201);
    expect(bought.body.data.scheduledDeliveries).toBeGreaterThan(0);
    const pass = await getDbPool().query(
      `SELECT default_drop_point_id FROM user_meal_passes WHERE id = $1`,
      [bought.body.data.pass.id]
    );
    expect(pass.rows[0].default_drop_point_id).toBe(campus.dropPoints[0].id);
  });
});

describe("Sponsored placements", () => {
  it("buys a placement from merchant credits, marks the restaurant sponsored and extends future buys", async () => {
    const merchant = await createMerchantStaff(SEED_IDS.restaurant1Id);
    const customer = await createUser("CUSTOMER");
    await creditWallet(merchant.userId, 100000);
    await getDbPool().query(`UPDATE restaurant_sponsorships SET status = 'EXPIRED' WHERE restaurant_id = $1`, [
      SEED_IDS.restaurant1Id,
    ]);

    const before = await call(getSponsorship, "GET", "/s", {
      token: merchant.token,
      params: { restaurantId: SEED_IDS.restaurant1Id },
    });
    expect(before.body.data.active).toBe(false);

    const bought = await call(buySponsorship, "POST", "/s", {
      token: merchant.token,
      params: { restaurantId: SEED_IDS.restaurant1Id },
      body: { days: 3 },
    });
    expect(bought.status).toBe(201);
    expect(bought.body.data.sponsorship.amountPaise).toBe(29700);

    const state = await call(getSponsorship, "GET", "/s", {
      token: merchant.token,
      params: { restaurantId: SEED_IDS.restaurant1Id },
    });
    expect(state.body.data.active).toBe(true);
    expect(state.body.data.daysRemaining).toBeGreaterThanOrEqual(3);

    const summaries = await RestaurantRepository.listSummaries({ limit: 50 });
    expect(summaries.restaurants.find((r) => r.id === SEED_IDS.restaurant1Id)?.isSponsored).toBe(true);

    const txn = await getDbPool().query(
      `SELECT kind, direction, amount_paise FROM wallet_transactions WHERE reference_id = $1`,
      [bought.body.data.sponsorship.id]
    );
    expect(txn.rows[0]).toMatchObject({ kind: "SPONSORSHIP_PAYMENT", direction: "DEBIT", amount_paise: 29700 });
    const revenue = await getDbPool().query(
      `SELECT credit_paise FROM ledger_entries WHERE description LIKE $1`,
      [`%${bought.body.data.sponsorship.id}%`]
    );
    expect(revenue.rows.some((r: any) => r.credit_paise === 29700)).toBe(true);

    const second = await call(buySponsorship, "POST", "/s", {
      token: merchant.token,
      params: { restaurantId: SEED_IDS.restaurant1Id },
      body: { days: 7 },
    });
    expect(second.status).toBe(201);
    expect(new Date(second.body.data.sponsorship.endsAt).getTime()).toBeGreaterThan(
      new Date(bought.body.data.sponsorship.endsAt).getTime()
    );

    const forbidden = await call(buySponsorship, "POST", "/s", {
      token: customer.token,
      params: { restaurantId: SEED_IDS.restaurant1Id },
      body: { days: 3 },
    });
    expect(forbidden.status).toBe(403);
  });
});

describe("Split the bill", () => {
  it("creates equal shares, lets friends pay from credits into the host wallet and settles", async () => {
    const host = await createCustomerWithAddress();
    const delivered = await deliverOrder({ customer: host });
    const payable = delivered.breakdown.payablePaise;
    const created = await call(createOrderSplit, "POST", "/split", {
      token: host.token,
      params: { orderId: delivered.orderId },
      body: { parts: 3 },
    });
    expect(created.status).toBe(201);
    const split = created.body.data.split;
    expect(split.shares).toHaveLength(3);
    expect(split.shares.reduce((sum: number, s: any) => sum + s.amountPaise, 0)).toBe(payable);

    const publicView = await call(getSharedSplit, "GET", "/splits/t", { params: { token: split.token } });
    expect(publicView.status).toBe(200);
    expect(publicView.body.data.split).toMatchObject({ orderNumber: expect.any(String), status: "OPEN" });

    const hostPay = await call(paySplit, "POST", "/splits/t", { token: host.token, params: { token: split.token } });
    expect(hostPay.status).toBe(403);

    await WalletRepository.getOrCreate(host.userId);
    const hostBefore = await getDbPool().query(`SELECT COALESCE(balance_paise, 0)::int AS balance FROM wallet_accounts WHERE user_id = $1`, [host.userId]);
    const shares = split.shares.map((s: any) => s.amountPaise);
    for (let i = 0; i < 3; i += 1) {
      const friend = await createUser("CUSTOMER");
      await creditWallet(friend.userId, shares[i] + 5000);
      const paid = await call(paySplit, "POST", "/splits/t", { token: friend.token, params: { token: split.token } });
      expect(paid.status).toBe(200);
      expect(paid.body.data.paidShare).toMatchObject({ status: "PAID", amountPaise: shares[i] });
      if (i === 0) {
        const duplicate = await call(paySplit, "POST", "/splits/t", { token: friend.token, params: { token: split.token } });
        expect(duplicate.status).toBe(409);
      }
    }
    const settled = await call(getSharedSplit, "GET", "/splits/t", { params: { token: split.token } });
    expect(settled.body.data.split.status).toBe("SETTLED");
    const hostAfter = await getDbPool().query(`SELECT balance_paise FROM wallet_accounts WHERE user_id = $1`, [host.userId]);
    expect(hostAfter.rows[0].balance_paise - hostBefore.rows[0].balance).toBe(payable);

    const second = await call(createOrderSplit, "POST", "/split", {
      token: host.token,
      params: { orderId: delivered.orderId },
      body: { parts: 2 },
    });
    expect(second.status).toBe(409);

    const outsider = await createUser("CUSTOMER");
    const forbidden = await call(createOrderSplit, "POST", "/split", {
      token: outsider.token,
      params: { orderId: delivered.orderId },
      body: { parts: 2 },
    });
    expect(forbidden.status).toBe(404);
  });
});

describe("Hygiene rating", () => {
  it("stores a 1–5 hygiene rating from outlet settings and exposes it on the restaurant detail", async () => {
    const merchant = await createMerchantStaff(SEED_IDS.restaurant1Id);
    const updated = await call(updateRestaurantSettings, "PATCH", "/settings", {
      token: merchant.token,
      params: { restaurantId: SEED_IDS.restaurant1Id },
      body: { hygieneRating: 5 },
    });
    expect(updated.status).toBe(200);
    const detail = await RestaurantRepository.findBySlug("punjabi-angithi");
    expect(detail?.hygieneRating).toBe(5);

    const invalid = await call(updateRestaurantSettings, "PATCH", "/settings", {
      token: merchant.token,
      params: { restaurantId: SEED_IDS.restaurant1Id },
      body: { hygieneRating: 6 },
    });
    expect(invalid.status).toBe(400);
  });
});

describe("Group ordering", () => {
  it("lets members add their own dishes to one shared bill, then locks and closes it on checkout", async () => {
    const host = await createCustomerWithAddress();
    const created = await call(createGroupCart, "POST", "/group-carts", {
      token: host.token,
      body: { restaurantId: SEED_IDS.restaurant1Id },
    });
    expect(created.status).toBe(201);
    const group = created.body.data.groupCart;
    expect(group).toMatchObject({
      status: "OPEN",
      isHost: true,
      viewerId: host.userId,
      participantCount: 1,
    });
    const code = group.code as string;

    const friend = await createUser("CUSTOMER");
    const joined = await call(getGroupCart, "GET", "/group-carts/c", {
      token: friend.token,
      params: { code },
    });
    expect(joined.status).toBe(200);
    expect(joined.body.data.groupCart).toMatchObject({ isParticipant: true, participantCount: 2 });

    const detail = await RestaurantRepository.findBySlug("punjabi-angithi");
    const paneerPrice = detail!.categories
      .flatMap((category) => category.items)
      .find((item) => item.id === MENU.paneerTikka)!.pricePaise;

    const friendAdd = await call(addGroupCartItem, "POST", "/items", {
      token: friend.token,
      params: { code },
      body: { menuItemId: MENU.paneerTikka, quantity: 2 },
    });
    expect(friendAdd.status).toBe(201);
    expect(friendAdd.body.data.groupCart.subtotalPaise).toBe(paneerPrice * 2);
    const friendLine = friendAdd.body.data.groupCart.lines.find(
      (line: any) => line.participantId === friend.userId
    );
    expect(friendLine).toMatchObject({ quantity: 2, lineTotalPaise: paneerPrice * 2, canEdit: true });

    const hostAdd = await call(addGroupCartItem, "POST", "/items", {
      token: host.token,
      params: { code },
      body: { menuItemId: MENU.paneerTikka, quantity: 1 },
    });
    expect(hostAdd.status).toBe(201);
    const hostLine = hostAdd.body.data.groupCart.lines.find((line: any) => line.participantId === host.userId);
    expect(hostAdd.body.data.groupCart.subtotalPaise).toBe(paneerPrice * 3);

    const crossEdit = await call(updateGroupCartItem, "PATCH", "/items", {
      token: friend.token,
      params: { code, itemId: hostLine.id },
      body: { quantity: 5 },
    });
    expect(crossEdit.status).toBe(403);

    const ownEdit = await call(updateGroupCartItem, "PATCH", "/items", {
      token: friend.token,
      params: { code, itemId: friendLine.id },
      body: { quantity: 3 },
    });
    expect(ownEdit.status).toBe(200);
    expect(ownEdit.body.data.groupCart.lines.find((line: any) => line.id === friendLine.id).quantity).toBe(3);

    const missingDip = await call(addGroupCartItem, "POST", "/items", {
      token: friend.token,
      params: { code },
      body: { menuItemId: MENU.malaiTikka, quantity: 1 },
    });
    expect(missingDip.status).toBe(400);

    const withDip = await call(addGroupCartItem, "POST", "/items", {
      token: friend.token,
      params: { code },
      body: { menuItemId: MENU.malaiTikka, selectedOptionIds: [MENU.mintDip], quantity: 1 },
    });
    expect(withDip.status).toBe(201);
    const dipLine = withDip.body.data.groupCart.lines.find((line: any) => line.participantId === friend.userId && line.menuItemId === MENU.malaiTikka);
    expect(dipLine.selectedOptions).toEqual([
      { id: MENU.mintDip, name: expect.any(String), pricePaise: 0 },
    ]);

    const locked = await call(lockGroupCart, "POST", "/lock", { token: host.token, params: { code } });
    expect(locked.status).toBe(200);
    expect(locked.body.data.groupCart.status).toBe("LOCKED");

    const lateAdd = await call(addGroupCartItem, "POST", "/items", {
      token: friend.token,
      params: { code },
      body: { menuItemId: MENU.paneerTikka, quantity: 1 },
    });
    expect(lateAdd.status).toBe(409);

    const reopened = await call(reopenGroupCart, "POST", "/reopen", { token: host.token, params: { code } });
    expect(reopened.status).toBe(200);
    expect(reopened.body.data.groupCart.status).toBe("OPEN");
    await call(lockGroupCart, "POST", "/lock", { token: host.token, params: { code } });

    const delivered = await deliverOrder({ customer: host });
    const notHost = await call(completeGroupCart, "POST", "/complete", {
      token: friend.token,
      params: { code },
      body: { orderId: delivered.orderId },
    });
    expect(notHost.status).toBe(403);

    const completed = await call(completeGroupCart, "POST", "/complete", {
      token: host.token,
      params: { code },
      body: { orderId: delivered.orderId },
    });
    expect(completed.status).toBe(200);
    expect(completed.body.data.groupCart).toMatchObject({ status: "COMPLETED", orderId: delivered.orderId });

    const replay = await call(completeGroupCart, "POST", "/complete", {
      token: host.token,
      params: { code },
      body: { orderId: delivered.orderId },
    });
    expect(replay.status).toBe(200);
    expect(replay.body.data.groupCart.status).toBe("COMPLETED");
  });
});

describe("Dining events", () => {
  it("lists ticketed experiences, books seats from credits and refunds a cancellation once", async () => {
    const listed = await call(listDiningEvents, "GET", "/events");
    expect(listed.status).toBe(200);
    expect(listed.body.data.events.length).toBeGreaterThanOrEqual(3);
    const event = listed.body.data.events[0];
    expect(event).toMatchObject({
      title: expect.any(String),
      capacity: expect.any(Number),
      startsAt: expect.any(String),
    });
    expect(event.seatsLeft).toBe(event.capacity - event.bookedCount);

    const detail = await call(getDiningEvent, "GET", "/events/e", { params: { eventId: event.id } });
    expect(detail.status).toBe(200);
    expect(detail.body.data.event.id).toBe(event.id);

    const customer = await createUser("CUSTOMER");
    await creditWallet(customer.userId, event.pricePaise * 2 + 10_000);
    const before = await getDbPool().query(`SELECT balance_paise FROM wallet_accounts WHERE user_id = $1`, [customer.userId]);

    const booked = await call(bookDiningEvent, "POST", "/events/e/book", {
      token: customer.token,
      params: { eventId: event.id },
      body: { quantity: 2 },
    });
    expect(booked.status).toBe(201);
    const booking = booked.body.data.booking;
    expect(booking).toMatchObject({
      eventId: event.id,
      quantity: 2,
      totalPaise: event.pricePaise * 2,
      status: "CONFIRMED",
      canCancel: true,
    });
    expect(booking.bookingCode).toMatch(/^EV[A-Z2-9]{8}$/);

    const afterBook = await getDbPool().query(`SELECT balance_paise FROM wallet_accounts WHERE user_id = $1`, [customer.userId]);
    expect(before.rows[0].balance_paise - afterBook.rows[0].balance_paise).toBe(event.pricePaise * 2);
    const eventAfterBook = await getDbPool().query(`SELECT booked_count FROM dining_events WHERE id = $1`, [event.id]);
    expect(eventAfterBook.rows[0].booked_count).toBe(event.bookedCount + 2);

    const mine = await call(listDiningEventBookings, "GET", "/events/bookings", { token: customer.token });
    expect(mine.status).toBe(200);
    expect(mine.body.data.bookings.find((item: any) => item.id === booking.id)).toMatchObject({ status: "CONFIRMED" });

    const invalidQuantity = await call(bookDiningEvent, "POST", "/events/e/book", {
      token: customer.token,
      params: { eventId: event.id },
      body: { quantity: 7 },
    });
    expect(invalidQuantity.status).toBe(400);

    const cancelled = await call(cancelDiningEventBooking, "POST", "/events/bookings/b/cancel", {
      token: customer.token,
      params: { bookingId: booking.id },
    });
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.data.booking.status).toBe("CANCELLED");
    const afterCancel = await getDbPool().query(`SELECT balance_paise FROM wallet_accounts WHERE user_id = $1`, [customer.userId]);
    expect(afterCancel.rows[0].balance_paise).toBe(before.rows[0].balance_paise);
    const eventAfterCancel = await getDbPool().query(`SELECT booked_count FROM dining_events WHERE id = $1`, [event.id]);
    expect(eventAfterCancel.rows[0].booked_count).toBe(event.bookedCount);

    // Replaying the cancellation must not credit the wallet twice.
    const replay = await call(cancelDiningEventBooking, "POST", "/events/bookings/b/cancel", {
      token: customer.token,
      params: { bookingId: booking.id },
    });
    expect(replay.status).toBe(200);
    expect(replay.body.data.booking.status).toBe("CANCELLED");
    const afterReplay = await getDbPool().query(`SELECT balance_paise FROM wallet_accounts WHERE user_id = $1`, [customer.userId]);
    expect(afterReplay.rows[0].balance_paise).toBe(before.rows[0].balance_paise);

    const outsider = await createUser("CUSTOMER");
    const forbidden = await call(cancelDiningEventBooking, "POST", "/events/bookings/b/cancel", {
      token: outsider.token,
      params: { bookingId: booking.id },
    });
    expect(forbidden.status).toBe(404);
  });
});

describe("Curated collections", () => {
  it("lists editorial collections and resolves their ranked restaurants", async () => {
    const listed = await call(listCollections, "GET", "/collections");
    expect(listed.status).toBe(200);
    expect(listed.body.data.collections.length).toBeGreaterThanOrEqual(3);
    const biryani = listed.body.data.collections.find((collection: any) => collection.slug === "biryani-trail");
    expect(biryani).toMatchObject({ title: expect.any(String), restaurantCount: 3 });

    const detail = await call(getCollection, "GET", "/collections/biryani-trail", {
      params: { slug: "biryani-trail" },
    });
    expect(detail.status).toBe(200);
    expect(detail.body.data.collection.restaurants).toHaveLength(3);
    expect(detail.body.data.collection.restaurants[0]).toMatchObject({
      slug: "punjabi-angithi",
      name: "Punjabi Angithi",
      rating: expect.any(Number),
    });
    expect(detail.body.data.collection.description).toEqual(expect.any(String));

    const missing = await call(getCollection, "GET", "/collections/nope", { params: { slug: "nope" } });
    expect(missing.status).toBe(404);
  });
});

describe("Ads depth and campaign performance analytics", () => {
  it("tracks impressions, clicks, conversions and updates campaign bidding", async () => {
    const merchant = await createMerchantStaff(SEED_IDS.restaurant1Id);

    // Update campaign settings via PATCH
    const patchRes = await call(
      updateSponsorshipCampaign,
      "PATCH",
      `/merchant/restaurants/${SEED_IDS.restaurant1Id}/sponsorship`,
      {
        token: merchant.token,
        params: { restaurantId: SEED_IDS.restaurant1Id },
        body: { maxDailyBudgetPaise: 15000, bidPerClickPaise: 800 },
      }
    );
    expect(patchRes.status).toBe(200);

    // Record ad events
    const impRes = await call(recordSponsorshipEvent, "POST", "/sponsorship/events", {
      body: {
        restaurantId: SEED_IDS.restaurant1Id,
        eventType: "IMPRESSION",
        source: "SEARCH",
      },
    });
    expect(impRes.status).toBe(201);

    const clickRes = await call(recordSponsorshipEvent, "POST", "/sponsorship/events", {
      body: {
        restaurantId: SEED_IDS.restaurant1Id,
        eventType: "CLICK",
        source: "SEARCH",
      },
    });
    expect(clickRes.status).toBe(201);

    const convRes = await call(recordSponsorshipEvent, "POST", "/sponsorship/events", {
      body: {
        restaurantId: SEED_IDS.restaurant1Id,
        eventType: "CONVERSION",
        orderAmountPaise: 45000,
      },
    });
    expect(convRes.status).toBe(201);

    // Fetch analytics
    const analyticsRes = await call(
      getSponsorshipAnalytics,
      "GET",
      `/merchant/restaurants/${SEED_IDS.restaurant1Id}/sponsorship/analytics`,
      {
        token: merchant.token,
        params: { restaurantId: SEED_IDS.restaurant1Id },
      }
    );
    expect(analyticsRes.status).toBe(200);
    expect(analyticsRes.body.data.totalImpressions).toBeGreaterThanOrEqual(1);
    expect(analyticsRes.body.data.totalClicks).toBeGreaterThanOrEqual(1);
    expect(analyticsRes.body.data.conversions).toBeGreaterThanOrEqual(1);
    expect(analyticsRes.body.data.ctrPercent).toBeGreaterThan(0);
    expect(analyticsRes.body.data.maxDailyBudgetPaise).toBe(15000);
    expect(analyticsRes.body.data.bidPerClickPaise).toBe(800);
  });
});

describe("Rider equipment renewals and replacement fee deductions", () => {
  it("schedules kit renewals and deducts replacement fees when kit is lost", async () => {
    const admin = await createUser("ADMIN");
    const rider = await createRider();

    // Issue kit items first
    await call(issueRiderEquipment, "POST", "/admin/rider-equipment", {
      token: admin.token,
      body: { riderId: rider.riderId, itemType: "HELMET", size: "M" },
    });
    await call(issueRiderEquipment, "POST", "/admin/rider-equipment", {
      token: admin.token,
      body: { riderId: rider.riderId, itemType: "DELIVERY_BAG", size: "Standard" },
    });

    // Rider requests renewal
    const renewReq = await call(requestEquipmentRenewal, "POST", "/rider/equipment", {
      token: rider.token,
      body: { itemType: "HELMET" },
    });
    expect(renewReq.status).toBe(200);
    expect(renewReq.body.data.scheduled).toBe(true);

    // Credit rider wallet so fee deduction can occur
    await creditWallet(rider.userId, 100_000);

    // Admin marks delivery bag lost and charges rider
    const lostRes = await call(
      updateEquipmentStatus,
      "PATCH",
      `/admin/rider-equipment/${rider.riderId}`,
      {
        token: admin.token,
        params: { riderId: rider.riderId },
        body: { itemType: "DELIVERY_BAG", status: "LOST", chargeRider: true },
      }
    );
    expect(lostRes.status).toBe(200);
    expect(lostRes.body.data.equipment.status).toBe("LOST");
    expect(lostRes.body.data.equipment.replacementFeePaise).toBe(80_000);
    expect(lostRes.body.data.equipment.replacementFeeDeducted).toBe(true);

    // Verify wallet debit
    const walletRes = await call(getWallet, "GET", "/wallet", { token: rider.token });
    expect(walletRes.status).toBe(200);
    expect(walletRes.body.data.account.balancePaise).toBe(20_000); // 100_000 - 80_000
  });
});

describe("Editable platform config and custom zone polygons", () => {
  it("updates platform configuration and creates zones with custom polygons", async () => {
    const admin = await createUser("ADMIN");

    // Admin reads platform config
    const configRes = await call(getAdminConfig, "GET", "/admin/config", { token: admin.token });
    expect(configRes.status).toBe(200);
    expect(configRes.body.data.settings["pricing:platform_fee_paise"]).toBeDefined();

    // Admin updates platform config
    const updateRes = await call(updateAdminConfig, "PUT", "/admin/config", {
      token: admin.token,
      body: {
        settings: {
          "pricing:platform_fee_paise": 750,
          "system:announcement": { enabled: true, message: "Rain surge active" },
        },
      },
    });
    expect(updateRes.status).toBe(200);
    expect(updateRes.body.data.settings["pricing:platform_fee_paise"]).toBe(750);

    // Public config reflects dynamic settings
    const publicRes = await call(getPublicConfig, "GET", "/config");
    expect(publicRes.status).toBe(200);
    expect(publicRes.body.data.platformConfig["pricing:platform_fee_paise"]).toBe(750);

    // Admin creates custom polygon zone
    const zoneRes = await call(createAdminZone, "POST", "/admin/zones", {
      token: admin.token,
      body: {
        name: "Connaught Outer Polygon",
        cityId: SEED_IDS.cityId,
        centerLatitude: 28.6315,
        centerLongitude: 77.2167,
        polygon: [
          { latitude: 28.635, longitude: 77.215 },
          { latitude: 28.64, longitude: 77.225 },
          { latitude: 28.625, longitude: 77.23 },
          { latitude: 28.62, longitude: 77.218 },
        ],
      },
    });
    expect(zoneRes.status).toBe(201);
    expect(zoneRes.body.data.zone.name).toBe("Connaught Outer Polygon");
  });
});

describe("Multi-language localization depth", () => {
  it("resolves English and Hindi messages across checkout, tracking and support", () => {
    expect(translate("hi", "checkout.title")).toBe("चेकआउट");
    expect(translate("hi", "checkout.deliveryAddress")).toBe("डिलीवरी का पता");
    expect(translate("hi", "tracking.otp")).toBe("डिलीवरी ओटीपी");
    expect(translate("hi", "issues.coldFood")).toBe("खाना ठंडा पहुँचा");
    expect(translate("en", "checkout.title")).toBe("Checkout");
    expect(translate("en", "tracking.otp")).toBe("Delivery OTP");
  });
});

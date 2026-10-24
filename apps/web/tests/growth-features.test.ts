import { beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { AcquisitionChannel, FaultCode } from "@startup/contracts";
import { signAttributionToken } from "@startup/core";
import {
  AddonRepository,
  AttributionRepository,
  BatchRepository,
  CorporateRepository,
  MealPassRepository,
  MerchantAnalyticsRepository,
  OrderRepository,
  RefundRepository,
  SEED_IDS,
  SurplusRepository,
  getDbPool,
  withTransaction,
} from "@startup/database";
import { MENU, call, createCustomerWithAddress, deliverOrder } from "./helpers.js";

import { POST as createQuote } from "../src/app/api/v1/quotes/route.js";
import { POST as createCheckout } from "../src/app/api/v1/checkouts/route.js";

async function createUnpaidOrder(customer: Awaited<ReturnType<typeof createCustomerWithAddress>>, token?: string) {
  const quote = await call(createQuote, "POST", "/q", {
    token: customer.token,
    body: {
      restaurantId: SEED_IDS.restaurant1Id,
      deliveryAddressId: customer.addressId,
      items: [{ menuItemId: MENU.paneerTikka, quantity: 2 }],
    },
  });
  expect(quote.status).toBe(200);
  const checkout = await call(createCheckout, "POST", "/c", {
    token: customer.token,
    headers: token ? { cookie: `mp_attr=${encodeURIComponent(token)}` } : undefined,
    body: { quoteId: quote.body.data.quoteId, deliveryAddressId: customer.addressId, idempotencyKey: `idem_${randomUUID()}` },
  });
  expect(checkout.status).toBe(201);
  return { ...checkout.body.data, quote: quote.body.data };
}

async function orderAttribution(orderId: string) {
  return (
    await getDbPool().query(
      `SELECT acquisition_channel, commission_paise, merchant_order_fee_paise, merchant_net_payout_paise
         FROM orders WHERE id = $1`,
      [orderId]
    )
  ).rows[0];
}

function nextMonday(): Date {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  while (date.getUTCDay() !== 1) date.setUTCDate(date.getUTCDate() + 1);
  if (date.getTime() <= Date.now()) date.setUTCDate(date.getUTCDate() + 7);
  return date;
}

describe("Growth feature integration", () => {
  let customer: Awaited<ReturnType<typeof createCustomerWithAddress>>;

  beforeAll(async () => {
    customer = await createCustomerWithAddress();
  });

  it("attributes a signed QR order, locks the commission snapshot and tags lifetime first origin", async () => {
    const link = await AttributionRepository.getOrCreateLink(SEED_IDS.restaurant1Id);
    const now = Date.now();
    const token = signAttributionToken(
      {
        restaurantId: SEED_IDS.restaurant1Id,
        slug: link.slug,
        channel: AcquisitionChannel.MERCHANT_DIRECT_SESSION,
        exp: Math.floor(now / 1000) + 24 * 60 * 60,
      },
      link.hmacSecret
    );
    const order = await createUnpaidOrder(customer, token);
    expect(await orderAttribution(order.orderId)).toMatchObject({
      acquisition_channel: "MERCHANT_DIRECT_SESSION",
      commission_paise: 0,
      merchant_order_fee_paise: 1500,
    });

    await OrderRepository.recordPaymentCapture({
      orderId: order.orderId,
      providerPaymentId: `pay_${randomUUID().slice(0, 14)}`,
      amountPaise: order.amountPaise,
      paymentAttemptId: order.paymentAttemptId,
    });
    const user = await getDbPool().query(`SELECT first_origin_restaurant_id FROM app_users WHERE id = $1`, [customer.userId]);
    expect(user.rows[0].first_origin_restaurant_id).toBe(SEED_IDS.restaurant1Id);

    expect(
      await AttributionRepository.resolveCheckoutAttribution({
        customerId: customer.userId,
        restaurantId: SEED_IDS.restaurant1Id,
        now: new Date(now + 25 * 60 * 60 * 1000),
      })
    ).toBe(AcquisitionChannel.MERCHANT_FIRST_ORIGIN);
    expect(
      await AttributionRepository.resolveCheckoutAttribution({
        customerId: customer.userId,
        restaurantId: randomUUID(),
        now: new Date(now + 25 * 60 * 60 * 1000),
      })
    ).toBe(AcquisitionChannel.MARKETPLACE);
    expect(
      await AttributionRepository.resolveCheckoutAttribution({
        customerId: customer.userId,
        restaurantId: SEED_IDS.restaurant1Id,
        token,
        now: new Date(now + 25 * 60 * 60 * 1000),
      })
    ).toBe(AcquisitionChannel.MERCHANT_FIRST_ORIGIN);
  });

  it("keeps the merchant net payout snapshot and applies a quality refund deduction", async () => {
    const delivered = await deliverOrder();
    await getDbPool().query(`UPDATE orders SET merchant_net_payout_paise = 5000 WHERE id = $1`, [delivered.orderId]);
    const refund = await withTransaction(async (client) => {
      await OrderRepository.lockForUpdate(client, delivered.orderId);
      return RefundRepository.issueWithClient(client, {
        orderId: delivered.orderId,
        amountPaise: 1000,
        reason: "Cold food quality issue",
        initiatedBy: "ADMIN:test",
        faultCode: FaultCode.MERCHANT_QUALITY,
      });
    });
    const row = (
      await getDbPool().query(
        `SELECT fault_code, merchant_recovery_bp, merchant_deduction_paise FROM refunds WHERE id = $1`,
        [refund!.refundId]
      )
    ).rows[0];
    expect(row).toMatchObject({ fault_code: "MERCHANT_QUALITY", merchant_recovery_bp: 10000, merchant_deduction_paise: 1000 });
    const allocation = await getDbPool().query(
      `SELECT le.account, le.debit_paise FROM ledger_entries le
         JOIN ledger_transactions lt ON lt.id = le.transaction_id
        WHERE lt.refund_id = $1 AND le.account IN ('MERCHANT_PAYABLE', 'PLATFORM_REFUND_EXPENSE')`,
      [refund!.refundId]
    );
    expect(allocation.rows).toEqual(
      expect.arrayContaining([expect.objectContaining({ account: "MERCHANT_PAYABLE", debit_paise: 1000 })])
    );
  });

  it("generates pass deliveries and applies early vs late skip rules", async () => {
    const date = nextMonday();
    const plan = await MealPassRepository.createPlan({
      kitchenRestaurantId: SEED_IDS.restaurant1Id,
      name: `Test Lunch ${randomUUID().slice(0, 6)}`,
      skuType: "STANDARD_LUNCH",
      totalMeals: 20,
      pricePaise: 258000,
      validityDays: 30,
      kitchenContractPayoutPaise: 7800,
      slotWindow: "12:30-13:30",
    });
    const earlyPass = await MealPassRepository.purchasePass({ userId: customer.userId, planId: plan.id });
    await MealPassRepository.generateDailyDeliveries(date);
    const deliveries = await MealPassRepository.listDeliveries(customer.userId);
    const earlyDelivery = deliveries.find((d: any) => d.pass_id === earlyPass.pass.id);
    expect(earlyDelivery).toBeTruthy();
    const early = await MealPassRepository.skipDelivery({
      deliveryId: earlyDelivery.id,
      userId: customer.userId,
      now: new Date(date.getTime() - 2 * 24 * 60 * 60 * 1000),
    });
    expect(early).toMatchObject({ status: "SKIPPED_EARLY", mealsRemaining: 20 });

    const latePass = await MealPassRepository.purchasePass({ userId: customer.userId, planId: plan.id });
    await MealPassRepository.generateDailyDeliveries(date);
    const allDeliveries = await MealPassRepository.listDeliveries(customer.userId);
    const lateDelivery = allDeliveries.find((d: any) => d.pass_id === latePass.pass.id);
    const late = await MealPassRepository.skipDelivery({
      deliveryId: lateDelivery.id,
      userId: customer.userId,
      now: new Date(date.getTime() + 2.5 * 60 * 60 * 1000), // 08:00 IST, inside the prep window
    });
    expect(late).toMatchObject({ status: "CONVERTED_TO_SURPLUS", mealsRemaining: 19 });
    const surplus = await getDbPool().query(`SELECT status, quantity_available FROM surplus_listings WHERE id = $1`, [
      late.surplusListingId,
    ]);
    expect(surplus.rows[0]).toMatchObject({ status: "ACTIVE", quantity_available: 1 });
  });

  it("appends a one-tap add-on to the parent crate without delivery or platform fees", async () => {
    const parent = await createUnpaidOrder(customer);
    await getDbPool().query(`UPDATE orders SET slot_cutoff_at = NOW() + interval '1 hour' WHERE id = $1`, [parent.orderId]);
    const sku = await AddonRepository.createSku({
      restaurantId: SEED_IDS.restaurant1Id,
      name: `Chaas ${randomUUID().slice(0, 4)}`,
      pricePaise: 3500,
      cogsPaise: 1800,
      stockCount: 5,
    });
    const result = await AddonRepository.appendOneTapAddon({
      parentOrderId: parent.orderId,
      addonSkuId: sku.id,
      customerId: customer.userId,
    });
    expect(result.order.order_type).toBe("ADDON");
    expect(result.order.parent_order_id).toBe(parent.orderId);
    expect(result.order.breakdown_json.deliveryFeePaise).toBe(0);
    expect(result.order.breakdown_json.platformFeePaise).toBe(0);
    expect(result.order.addon_gross_margin_paise).toBe(1700);
    const stock = await getDbPool().query(`SELECT stock_count FROM addon_skus WHERE id = $1`, [sku.id]);
    expect(stock.rows[0].stock_count).toBe(4);
  });

  it("locks a six-order drop into one batch with a captain manifest", async () => {
    const cluster = await BatchRepository.createCluster({
      cityId: SEED_IDS.cityId,
      name: `Test Cluster ${randomUUID().slice(0, 6)}`,
      polygonGeojson: [
        { latitude: 28.61, longitude: 77.2 },
        { latitude: 28.62, longitude: 77.2 },
        { latitude: 28.62, longitude: 77.22 },
      ],
    });
    const drop = await BatchRepository.createDropPoint({
      clusterId: cluster.id,
      name: "Hostel Gate 1",
      latitude: 28.614,
      longitude: 77.2095,
      captainFeePerBagPaise: 300,
    });
    const orderIds: string[] = [];
    for (let i = 0; i < 6; i++) {
      const id = randomUUID();
      await getDbPool().query(
        `INSERT INTO orders
           (id, order_number, customer_id, restaurant_id, delivery_address_id, items_json, breakdown_json,
            fulfillment_state, payment_status, payable_paise, delivery_otp, pickup_otp,
            drop_point_id, slot_window, acquisition_channel)
         VALUES ($1, $2, $3, $4, $5, '[]', '{}', 'AWAITING_MERCHANT', 'CAPTURED', 0, '1234', '5678', $6, '12:30-13:30', 'MARKETPLACE')`,
        [id, `ORD-B-${randomUUID().slice(0, 8)}`, customer.userId, SEED_IDS.restaurant1Id, customer.addressId, drop.id]
      );
      orderIds.push(id);
    }
    const locked = await BatchRepository.lockBatch({
      clusterId: cluster.id,
      slotWindow: "12:30-13:30",
      slotStart: new Date(Date.now() + 60 * 60 * 1000),
      slotEnd: new Date(Date.now() + 120 * 60 * 1000),
    });
    expect(locked?.manifest.totalBags).toBe(6);
    expect(locked?.manifest.drops[0]?.captainFeePaise).toBe(1800);
    expect(locked?.batch.total_drops).toBe(1);
    const batched = await getDbPool().query(`SELECT COUNT(*)::int AS n FROM orders WHERE batch_id = $1 AND id = ANY($2::uuid[])`, [
      locked!.batch.id,
      orderIds,
    ]);
    expect(batched.rows[0].n).toBe(6);
  });

  it("prevents surplus overselling and records D2C sampling revenue", async () => {
    const cluster = await BatchRepository.createCluster({
      cityId: SEED_IDS.cityId,
      name: `Surplus Cluster ${randomUUID().slice(0, 6)}`,
      polygonGeojson: [
        { latitude: 28.61, longitude: 77.2 },
        { latitude: 28.62, longitude: 77.2 },
        { latitude: 28.62, longitude: 77.22 },
      ],
    });
    const listing = await SurplusRepository.createListing({
      restaurantId: SEED_IDS.restaurant1Id,
      clusterId: cluster.id,
      title: "Test Rescue Bag",
      originalValuePaise: 15000,
      platformFlatFeePaise: 2000,
      quantity: 1,
      pickupWindowStart: new Date(Date.now() - 10 * 60 * 1000),
      pickupWindowEnd: new Date(Date.now() + 60 * 60 * 1000),
    });
    const first = await SurplusRepository.reserveListing({ listingId: listing.listing.id, userId: customer.userId });
    expect(first.listing.status).toBe("SOLD_OUT");
    await expect(
      SurplusRepository.reserveListing({ listingId: listing.listing.id, userId: customer.userId })
    ).rejects.toThrow();

    const purchaseListing = await SurplusRepository.createListing({
      restaurantId: SEED_IDS.restaurant1Id,
      clusterId: cluster.id,
      title: "Purchase Rescue Bag",
      originalValuePaise: 15000,
      platformFlatFeePaise: 2000,
      quantity: 1,
      pickupWindowStart: new Date(Date.now() - 10 * 60 * 1000),
      pickupWindowEnd: new Date(Date.now() + 60 * 60 * 1000),
    });
    const purchase = await SurplusRepository.purchaseListing({
      listingId: purchaseListing.listing.id,
      userId: customer.userId,
      addressId: customer.addressId,
    });
    expect(purchase.order.order_type).toBe("SURPLUS");
    expect(purchase.order.payable_paise).toBe(purchaseListing.priced.salePricePaise);
    expect(purchase.order.acquisition_channel).toBe("SURPLUS_BAG");

    const campaign = await SurplusRepository.createCampaign({
      brandName: "Acme Snacks",
      clusterId: cluster.id,
      targetAudience: "CAMPUS",
      bountyPerBoxPaise: 350,
      remainingUnits: 10,
    });
    const parent = await createUnpaidOrder(customer);
    const attached = await SurplusRepository.attachSampling({
      orderId: parent.orderId,
      clusterId: cluster.id,
      units: 1,
    });
    expect(attached).toMatchObject({ campaignId: campaign.id, unitsToAttach: 1, bountyPaise: 350 });
  });

  it("computes a corporate split and issues one consolidated monthly invoice", async () => {
    const cluster = await BatchRepository.createCluster({
      cityId: SEED_IDS.cityId,
      name: `Corporate Cluster ${randomUUID().slice(0, 6)}`,
      polygonGeojson: [
        { latitude: 28.61, longitude: 77.2 },
        { latitude: 28.62, longitude: 77.2 },
        { latitude: 28.62, longitude: 77.22 },
      ],
    });
    const drop = await BatchRepository.createDropPoint({
      clusterId: cluster.id,
      name: "Tech Park Lobby",
      latitude: 28.614,
      longitude: 77.2095,
    });
    const account = await CorporateRepository.createAccount({
      companyName: "Acme Corp",
      gstin: "29ABCDE1234F1Z5",
      billingAddress: "Tech Park, Noida",
      dropPointId: drop.id,
      dailyAllowancePerEmployeePaise: 13000,
      subsidyPercentageBp: 10000,
      corporateManagementFeeBp: 500,
    });
    await CorporateRepository.addEmployee({
      corporateAccountId: account.id,
      userId: customer.userId,
      costCenterCode: "ENG-01",
      emailDomain: "acme.test",
    });
    const split = await CorporateRepository.splitForUser({
      userId: customer.userId,
      corporateAccountId: account.id,
      orderTotalPaise: 20000,
    });
    expect(split.split).toMatchObject({ coveredPaise: 13000, overagePaise: 7000, employeePayablePaise: 7000 });

    const quote = await call(createQuote, "POST", "/q", {
      token: customer.token,
      body: {
        restaurantId: SEED_IDS.restaurant1Id,
        deliveryAddressId: customer.addressId,
        items: [{ menuItemId: MENU.paneerTikka, quantity: 2 }],
      },
    });
    const corporateOrder = await CorporateRepository.createCorporateOrder({
      userId: customer.userId,
      quoteId: quote.body.data.quoteId,
      corporateAccountId: account.id,
    });
    expect(corporateOrder.order.acquisition_channel).toBe("CORPORATE_CLUB");
    expect(corporateOrder.order.order_type).toBe("CORPORATE");
    expect(corporateOrder.order.corporate_covered_paise).toBe(13000);
    expect(corporateOrder.order.corporate_overage_paise).toBeGreaterThan(0);
    expect(corporateOrder.split.employeePayablePaise).toBe(corporateOrder.order.payable_paise);

    const invoice = await CorporateRepository.generateMonthlyInvoice({ corporateAccountId: account.id });
    expect(invoice.total_paise).toBeGreaterThan(0);
    expect(invoice.data_json.costCenters[0]).toMatchObject({ costCenterCode: "ENG-01", hsnSac: { food: "996331" } });
    expect(invoice.data_json.costCenters[0].orders).toBeGreaterThanOrEqual(1);
  });

  it("produces the merchant savings proof from attribution data", async () => {
    const report = await MerchantAnalyticsRepository.savingsReport({
      restaurantId: SEED_IDS.restaurant1Id,
      startDate: new Date(Date.now() - 24 * 60 * 60 * 1000),
      endDate: new Date(Date.now() + 60 * 60 * 1000),
    });
    expect(report.totalOrders).toBeGreaterThan(0);
    expect(report.channels.some((c) => c.channel === AcquisitionChannel.MERCHANT_DIRECT_SESSION)).toBe(true);
    expect(report.incumbentBenchmarkPaise).toBeGreaterThanOrEqual(report.totalGmvPaise * 0.3 - 1);
  });
});

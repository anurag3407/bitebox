import { beforeAll, describe, expect, it } from "vitest";
import {
  AddressRepository,
  JobRepository,
  LedgerRepository,
  OrderRepository,
  RestaurantRepository,
  SEED_IDS,
} from "../src/index.js";
import { LedgerEngine } from "@startup/core";

describe("Database Integration Tests", () => {
  it("fetches restaurant summaries and detailed menu hierarchy", async () => {
    const restaurants = await RestaurantRepository.listSummaries({ limit: 10 });
    expect(restaurants.length).toBeGreaterThanOrEqual(1);

    const punjabiAngithi = await RestaurantRepository.findBySlug("punjabi-angithi");
    expect(punjabiAngithi).not.toBeNull();
    expect(punjabiAngithi?.name).toBe("Punjabi Angithi");
    expect(punjabiAngithi?.categories.length).toBeGreaterThanOrEqual(2);

    const firstCat = punjabiAngithi?.categories[0];
    expect(firstCat?.items.length).toBeGreaterThanOrEqual(1);
    expect(firstCat?.items[0]?.name).toBeDefined();
  });

  it("handles customer address creation and default switching", async () => {
    const newAddress = await AddressRepository.create(SEED_IDS.customerUserId, {
      label: "Office",
      building: "Tower B, Cyber City",
      street: "DLF Phase 2",
      latitude: 28.49,
      longitude: 77.08,
      isDefault: true,
    });

    expect(newAddress.id).toBeDefined();
    expect(newAddress.isDefault).toBe(true);

    const addresses = await AddressRepository.listByUser(SEED_IDS.customerUserId);
    expect(addresses.length).toBeGreaterThanOrEqual(2);
    // The newly created one is default, previous should not be default
    const defaultAddr = addresses.find((a) => a.isDefault);
    expect(defaultAddr?.id).toBe(newAddress.id);
  });

  it("creates order idempotently and prevents duplicate orders", async () => {
    const idemKey = `test_idem_${Date.now()}`;
    const orderInput = {
      idempotencyKey: idemKey,
      principalId: SEED_IDS.customerUserId,
      requestHash: "hash_xyz_123",
      customerId: SEED_IDS.customerUserId,
      restaurantId: SEED_IDS.restaurant1Id,
      deliveryAddressId: SEED_IDS.customerAddressId,
      orderNumber: `ORD-TEST-${Date.now().toString(36).toUpperCase()}`,
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
      deliveryOtp: "456789",
      pickupOtp: "123456",
      estimatedDeliveryMinutes: 30,
      razorpayOrderId: "order_mock_rzp_12345",
    };

    // First attempt: creates order
    const firstCall = await OrderRepository.createWithIdempotency(orderInput);
    expect(firstCall.orderId).toBeDefined();
    expect(firstCall.isDuplicate).toBe(false);

    // Second attempt with exact same idempotency key: returns duplicate safely
    const secondCall = await OrderRepository.createWithIdempotency(orderInput);
    expect(secondCall.orderId).toBe(firstCall.orderId);
    expect(secondCall.isDuplicate).toBe(true);

    // Record payment capture
    await OrderRepository.recordPaymentCapture({
      orderId: firstCall.orderId,
      providerPaymentId: `pay_mock_${Date.now()}`,
      amountPaise: 35890,
      paymentAttemptId: firstCall.paymentAttemptId,
    });

    const updatedOrder = await OrderRepository.findById(firstCall.orderId);
    expect(updatedOrder?.paymentStatus).toBe("CAPTURED");
    expect(updatedOrder?.fulfillmentState).toBe("AWAITING_MERCHANT");
    expect(updatedOrder?.merchantResponseDeadlineAt).toBeDefined();
  });

  it("claims and processes jobs using SKIP LOCKED", async () => {
    const jobId = await JobRepository.enqueue(
      "TEST_JOB_KIND",
      { test: true },
      new Date(Date.now() - 3600000)
    );
    expect(jobId).toBeDefined();

    const claimed = await JobRepository.claimRunnableJobs("worker_test_1", 50, 30);
    expect(claimed.length).toBeGreaterThanOrEqual(1);

    const targetJob = claimed.find((j) => j.id === jobId);
    expect(targetJob).toBeDefined();
    expect(targetJob?.kind).toBe("TEST_JOB_KIND");

    // Complete the job
    await JobRepository.completeJob(jobId, "worker_test_1");
  });

  it("posts and verifies balanced ledger entries", async () => {
    const entries = LedgerEngine.buildOrderCaptureEntries({
      payablePaise: 35890,
      subtotalPaise: 28000,
      deliveryFeePaise: 3000,
      platformFeePaise: 500,
      packagingPaise: 2000,
      taxPaise: 2390,
    });

    const txId = await LedgerRepository.postTransaction({
      effectType: "CAPTURE",
      entries,
    });
    expect(txId).toBeDefined();

    const balances = await LedgerRepository.getAccountBalances();
    expect(balances.length).toBeGreaterThanOrEqual(3);
  });
});

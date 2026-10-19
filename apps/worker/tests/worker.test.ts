import { describe, expect, it } from "vitest";
import { FulfillmentState } from "@startup/contracts";
import {
  JobRepository,
  OrderRepository,
  SEED_IDS,
} from "@startup/database";
import { WorkerRunner } from "../src/runner.js";

describe("Worker Processing Tests", () => {
  it("processes merchant acceptance timeout and cancels expired orders", async () => {
    // 1. Create order
    const orderNum = `ORD-EXPIRE-${Date.now().toString(36).toUpperCase()}`;
    const order = await OrderRepository.createWithIdempotency({
      idempotencyKey: `idem_expire_${Date.now()}`,
      principalId: SEED_IDS.customerUserId,
      requestHash: "hash_expire",
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
      deliveryOtp: "112233",
      pickupOtp: "445566",
      estimatedDeliveryMinutes: 30,
      razorpayOrderId: "order_mock_exp",
    });

    // Capture payment so it enters AWAITING_MERCHANT
    await OrderRepository.recordPaymentCapture({
      orderId: order.orderId,
      providerPaymentId: `pay_mock_exp_${Date.now()}`,
      amountPaise: 35890,
    });

    // Enqueue an immediate timeout job (past run_at)
    await JobRepository.enqueue(
      "MERCHANT_ACCEPTANCE_TIMEOUT",
      { orderId: order.orderId },
      new Date(Date.now() - 1000)
    );

    // Run worker single pass
    const runner = new WorkerRunner("test_worker_runner");
    const processedCount = await runner.runOnce();
    expect(processedCount).toBeGreaterThanOrEqual(1);

    // Verify order is now CANCELLED
    const cancelledOrder = await OrderRepository.findById(order.orderId);
    expect(cancelledOrder?.fulfillmentState).toBe(FulfillmentState.CANCELLED);
  });
});

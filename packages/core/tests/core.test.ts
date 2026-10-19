import { describe, expect, it } from "vitest";
import {
  Currency,
  DietaryTag,
  FulfillmentState,
  PaymentAttemptStatus,
  PaymentStatus,
  StockPolicy,
} from "@startup/contracts";
import {
  DispatchEngine,
  EtaCalculator,
  LedgerEngine,
  ModifierValidator,
  Money,
  OrderFundingGuard,
  OrderStateMachine,
  PaymentStateMachine,
  PricingCalculator,
  ServiceabilityPolicy,
  TestClock,
  generateOrderNumber,
  isValidUuid,
} from "../src/index.js";

describe("Core Domain Units", () => {
  describe("Money Value Object", () => {
    it("converts correctly between rupees and paise", () => {
      const m1 = Money.fromRupees(249.5);
      expect(m1.paise).toBe(24950);
      expect(m1.toRupeesDecimal()).toBe(249.5);
      expect(m1.formatInr()).toBe("₹249.50");

      const m2 = Money.fromRupees(500);
      expect(m2.formatInr()).toBe("₹500");
    });

    it("applies basis points and math correctly", () => {
      const base = Money.fromPaise(10000); // ₹100
      const gst = base.applyBasisPoints(500); // 5%
      expect(gst.paise).toBe(500);

      const total = base.add(gst);
      expect(total.paise).toBe(10500);
    });

    it("throws on non-safe-integer paise", () => {
      expect(() => Money.fromPaise(123.45)).toThrow();
    });
  });

  describe("IDs & Clock", () => {
    it("generates and validates order numbers and test clocks", () => {
      const clock = new TestClock(new Date("2026-10-19T10:00:00Z"));
      const orderNum = generateOrderNumber(clock.now());
      expect(orderNum).toMatch(/^ORD-20261019-[A-Z0-9]{4}$/);

      clock.advanceMinutes(30);
      expect(clock.now().toISOString()).toBe("2026-10-19T10:30:00.000Z");
    });
  });

  describe("Pricing Engine", () => {
    it("computes canonical breakdown with distance, surge, taxes and coupon discount", () => {
      const breakdown = PricingCalculator.calculate({
        lines: [
          { basePricePaise: 25000, optionsPricePaise: 5000, quantity: 2 }, // (250+50)*2 = 60000 paise (₹600)
        ],
        distanceMeters: 4500, // 4.5km -> 3km base (3000p) + 2 extra km (2000p) = 5000 paise (₹50)
        packagingFeePaise: 2500, // ₹25
        platformFeePaise: 500, // ₹5
        surgeMultiplier: 1.2, // 20% surge on delivery = 1000 paise (₹10)
        coupon: {
          type: "PERCENTAGE",
          discountValue: 10, // 10% off on subtotal = 6000 paise
          maxDiscountPaise: 10000,
        },
      });

      expect(breakdown.subtotalPaise).toBe(60000);
      expect(breakdown.deliveryFeePaise).toBe(5000);
      expect(breakdown.surgePaise).toBe(1000);
      expect(breakdown.packagingPaise).toBe(2500);
      expect(breakdown.platformFeePaise).toBe(500);
      expect(breakdown.discountPaise).toBe(6000);

      // Verify balanced payable total equation:
      // payable = subtotal + packaging + deliveryFee + platformFee + surge + tax - discount
      const expectedPayable =
        breakdown.subtotalPaise +
        breakdown.packagingPaise +
        breakdown.deliveryFeePaise +
        breakdown.platformFeePaise +
        breakdown.surgePaise +
        breakdown.taxPaise -
        breakdown.discountPaise;

      expect(breakdown.payablePaise).toBe(expectedPayable);
      expect(breakdown.payablePaise).toBeGreaterThan(0);
    });
  });

  describe("Serviceability & Geospatial", () => {
    it("computes accurate haversine distances", () => {
      // Connaught Place to India Gate in New Delhi: ~2.3 km
      const cp = { latitude: 28.6315, longitude: 77.2167 };
      const indiaGate = { latitude: 28.6129, longitude: 77.2295 };

      const dist = ServiceabilityPolicy.calculateDistanceMeters(cp, indiaGate);
      expect(dist).toBeGreaterThan(2000);
      expect(dist).toBeLessThan(2600);
    });

    it("determines point in polygon accurately", () => {
      const polygon = [
        { latitude: 28.60, longitude: 77.20 },
        { latitude: 28.60, longitude: 77.30 },
        { latitude: 28.70, longitude: 77.30 },
        { latitude: 28.70, longitude: 77.20 },
      ];

      const insidePoint = { latitude: 28.65, longitude: 77.25 };
      const outsidePoint = { latitude: 28.80, longitude: 77.25 };

      expect(ServiceabilityPolicy.isPointInPolygon(insidePoint, polygon)).toBe(true);
      expect(ServiceabilityPolicy.isPointInPolygon(outsidePoint, polygon)).toBe(false);
    });
  });

  describe("Modifier Validator", () => {
    const modifierGroups = [
      {
        id: "g1",
        name: "Choose Crust",
        minSelect: 1,
        maxSelect: 1,
        isRequired: true,
        options: [
          { id: "opt-thin", name: "Thin Crust", pricePaise: 0, isAvailable: true },
          { id: "opt-cheese", name: "Cheese Burst", pricePaise: 7500, isAvailable: true },
        ],
      },
      {
        id: "g2",
        name: "Extra Toppings",
        minSelect: 0,
        maxSelect: 2,
        isRequired: false,
        options: [
          { id: "opt-olives", name: "Olives", pricePaise: 3000, isAvailable: true },
          { id: "opt-mushrooms", name: "Mushrooms", pricePaise: 3500, isAvailable: false },
        ],
      },
    ];

    it("passes on valid required choices", () => {
      const res = ModifierValidator.validate(modifierGroups, ["opt-cheese", "opt-olives"]);
      expect(res.isValid).toBe(true);
      expect(res.optionsTotalPaise).toBe(10500);
      expect(res.selectedOptionNames).toEqual(["Cheese Burst", "Olives"]);
    });

    it("fails when required group has no choice", () => {
      const res = ModifierValidator.validate(modifierGroups, ["opt-olives"]);
      expect(res.isValid).toBe(false);
      expect(res.error).toContain("requires at least 1 selection");
    });

    it("fails when an option is unavailable", () => {
      const res = ModifierValidator.validate(modifierGroups, ["opt-thin", "opt-mushrooms"]);
      expect(res.isValid).toBe(false);
      expect(res.error).toContain("is currently unavailable");
    });
  });

  describe("State Machines & Funding Guards", () => {
    it("verifies order fulfillment transitions", () => {
      expect(
        OrderStateMachine.canTransition(
          FulfillmentState.PENDING_PAYMENT,
          FulfillmentState.AWAITING_MERCHANT
        ).allowed
      ).toBe(true);

      expect(
        OrderStateMachine.canTransition(
          FulfillmentState.AWAITING_MERCHANT,
          FulfillmentState.DELIVERED
        ).allowed
      ).toBe(false);

      expect(OrderStateMachine.isTerminal(FulfillmentState.DELIVERED)).toBe(true);
    });

    it("guards against double payment and terminal order payments", () => {
      // 1. Order already captured
      const resCaptured = OrderFundingGuard.evaluateCanCreateAttempt({
        orderFulfillmentState: FulfillmentState.AWAITING_MERCHANT,
        orderPaymentStatus: PaymentStatus.CAPTURED,
        capturedAmountPaise: 50000,
        orderPayablePaise: 50000,
      });
      expect(resCaptured.canCreate).toBe(false);
      expect(resCaptured.action).toBe("REJECT_ALREADY_PAID");

      // 2. Order cancelled
      const resCancelled = OrderFundingGuard.evaluateCanCreateAttempt({
        orderFulfillmentState: FulfillmentState.CANCELLED,
        orderPaymentStatus: PaymentStatus.PENDING,
        capturedAmountPaise: 0,
        orderPayablePaise: 50000,
      });
      expect(resCancelled.canCreate).toBe(false);
      expect(resCancelled.action).toBe("REJECT_TERMINAL");

      // 3. Existing attempt active
      const resExisting = OrderFundingGuard.evaluateCanCreateAttempt({
        orderFulfillmentState: FulfillmentState.PENDING_PAYMENT,
        orderPaymentStatus: PaymentStatus.PENDING,
        existingAttemptId: "att-123",
        existingAttemptStatus: PaymentAttemptStatus.READY,
        capturedAmountPaise: 0,
        orderPayablePaise: 50000,
      });
      expect(resExisting.canCreate).toBe(false);
      expect(resExisting.action).toBe("REUSE_EXISTING");

      // 4. Fresh attempt allowed
      const resFresh = OrderFundingGuard.evaluateCanCreateAttempt({
        orderFulfillmentState: FulfillmentState.PENDING_PAYMENT,
        orderPaymentStatus: PaymentStatus.PENDING,
        capturedAmountPaise: 0,
        orderPayablePaise: 50000,
      });
      expect(resFresh.canCreate).toBe(true);
      expect(resFresh.action).toBe("ALLOW");
    });
  });

  describe("Dispatch & ETA Calculations", () => {
    it("filters and ranks rider candidates by travel time", () => {
      const now = Date.now();
      const pickupLocation = { latitude: 28.63, longitude: 77.21 };

      const candidates = [
        {
          riderId: "r1",
          name: "Rider 1",
          isApproved: true,
          isOnline: true,
          hasActiveTrip: false,
          currentLocation: { latitude: 28.64, longitude: 77.21 }, // ~1.1km
          lastPingTimeMs: now - 30000, // 30s ago
        },
        {
          riderId: "r2_busy",
          name: "Rider 2",
          isApproved: true,
          isOnline: true,
          hasActiveTrip: true, // Inactive
          currentLocation: { latitude: 28.631, longitude: 77.21 },
          lastPingTimeMs: now,
        },
        {
          riderId: "r3_stale",
          name: "Rider 3",
          isApproved: true,
          isOnline: true,
          hasActiveTrip: false,
          currentLocation: { latitude: 28.631, longitude: 77.21 },
          lastPingTimeMs: now - 300000, // 5 min ago (stale)
        },
        {
          riderId: "r4_farther",
          name: "Rider 4",
          isApproved: true,
          isOnline: true,
          hasActiveTrip: false,
          currentLocation: { latitude: 28.66, longitude: 77.21 }, // ~3.3km
          lastPingTimeMs: now - 10000,
        },
      ];

      const ranked = DispatchEngine.rankCandidates(candidates, pickupLocation, now);
      expect(ranked).toHaveLength(2);
      expect(ranked[0]?.riderId).toBe("r1");
      expect(ranked[1]?.riderId).toBe("r4_farther");
    });

    it("calculates critical-path ETA accounting for prep and travel overlap", () => {
      const eta = EtaCalculator.calculate({
        prepTimeMinutes: 20,
        travelToPickupMinutes: 8,
        dispatchWaitMinutes: 2,
        lastMileTravelMinutes: 12,
      });

      // Rider reaches at: 2 + 8 = 10 min.
      // Food ready at: 20 min.
      // Pickup handoff completes at: max(20, 10) + 2 = 22 min.
      // Total delivery: 22 + 12 + 2 = 36 min.
      expect(eta.estimatedMinutes).toBe(36);
      expect(eta.minEtaMinutes).toBe(31);
      expect(eta.maxEtaMinutes).toBe(43);
    });
  });

  describe("Double-Entry Accounting Ledger", () => {
    it("generates balanced ledger entries for order capture", () => {
      const entries = LedgerEngine.buildOrderCaptureEntries({
        payablePaise: 65000,
        subtotalPaise: 50000,
        deliveryFeePaise: 5000,
        platformFeePaise: 500,
        packagingPaise: 2000,
        taxPaise: 7500,
        commissionRateBasisPoints: 1500, // 15%
      });

      expect(LedgerEngine.validateBalanced(entries)).toBe(true);
      const totalDebit = entries.reduce((s, e) => s + e.debitPaise, 0);
      const totalCredit = entries.reduce((s, e) => s + e.creditPaise, 0);
      expect(totalDebit).toBe(65000);
      expect(totalCredit).toBe(65000);
    });

    it("generates balanced ledger entries for refunds", () => {
      const entries = LedgerEngine.buildRefundEntries(5000, "Customer cancellation");
      expect(LedgerEngine.validateBalanced(entries)).toBe(true);
    });
  });
});

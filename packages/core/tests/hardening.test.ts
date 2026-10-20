import { describe, expect, it } from "vitest";
import { DeliveryTripStatus, FulfillmentState } from "@startup/contracts";
import {
  CancellationPolicy,
  DeliveryTripStateMachine,
  LedgerEngine,
  ModifierValidator,
  OpeningHoursPolicy,
  PricingCalculator,
  generateOrderNumber,
  generateVerificationOtp,
  safeEqual,
} from "../src/index.js";

describe("Ledger balances for every pricing shape", () => {
  const cases = [
    { name: "plain order", coupon: undefined, tip: 0, surge: 1 },
    { name: "percentage coupon", coupon: { type: "PERCENTAGE" as const, discountValue: 50, maxDiscountPaise: 10000 }, tip: 0, surge: 1 },
    { name: "flat coupon + tip", coupon: { type: "FLAT" as const, discountValue: 10000 }, tip: 3000, surge: 1 },
    { name: "free delivery + surge", coupon: { type: "FREE_DELIVERY" as const, discountValue: 0 }, tip: 2000, surge: 1.5 },
  ];

  for (const c of cases) {
    it(`capture entries balance: ${c.name}`, () => {
      const breakdown = PricingCalculator.calculate({
        lines: [{ basePricePaise: 34000, optionsPricePaise: 4000, quantity: 2 }],
        distanceMeters: 5200,
        coupon: c.coupon,
        tipPaise: c.tip,
        surgeMultiplier: c.surge,
      });
      const entries = LedgerEngine.buildOrderCaptureEntries({ ...breakdown, commissionRateBasisPoints: 1800 });
      expect(LedgerEngine.validateBalanced(entries)).toBe(true);
      const debit = entries.reduce((s, e) => s + e.debitPaise, 0);
      expect(debit).toBe(breakdown.payablePaise + breakdown.discountPaise);
    });
  }
});

describe("Pricing edge cases", () => {
  it("explains why a coupon does not apply", () => {
    const result = PricingCalculator.evaluateCoupon({ type: "FLAT", discountValue: 10000, minOrderPaise: 40000 }, 25000, 3000);
    expect(result).toEqual({ applicable: false, reason: expect.stringContaining("₹150 more") });
  });

  it("never discounts more than the food subtotal", () => {
    const b = PricingCalculator.calculate({
      lines: [{ basePricePaise: 5000, optionsPricePaise: 0, quantity: 1 }],
      distanceMeters: 1000,
      coupon: { type: "FLAT", discountValue: 50000 },
    });
    expect(b.discountPaise).toBe(5000);
    expect(b.payablePaise).toBeGreaterThan(0);
  });

  it("free delivery removes only the delivery fee and its GST", () => {
    const withFee = PricingCalculator.calculate({ lines: [{ basePricePaise: 30000, optionsPricePaise: 0, quantity: 1 }], distanceMeters: 2000 });
    const free = PricingCalculator.calculate({
      lines: [{ basePricePaise: 30000, optionsPricePaise: 0, quantity: 1 }],
      distanceMeters: 2000,
      coupon: { type: "FREE_DELIVERY", discountValue: 0 },
    });
    expect(free.discountPaise).toBe(withFee.deliveryFeePaise);
    expect(free.taxPaise).toBe(withFee.taxPaise - Math.round((withFee.deliveryFeePaise * 1800) / 10000));
  });

  it("caps surge and rejects fractional quantities", () => {
    const b = PricingCalculator.calculate({ lines: [{ basePricePaise: 1000, optionsPricePaise: 0, quantity: 1 }], distanceMeters: 1000, surgeMultiplier: 10 });
    expect(b.surgePaise).toBe(b.deliveryFeePaise); // capped at 2x
    expect(() =>
      PricingCalculator.calculate({ lines: [{ basePricePaise: 1000, optionsPricePaise: 0, quantity: 1.5 }], distanceMeters: 0 })
    ).toThrow();
  });

  it("does not tax tips", () => {
    const a = PricingCalculator.calculate({ lines: [{ basePricePaise: 20000, optionsPricePaise: 0, quantity: 1 }], distanceMeters: 1000 });
    const b = PricingCalculator.calculate({ lines: [{ basePricePaise: 20000, optionsPricePaise: 0, quantity: 1 }], distanceMeters: 1000, tipPaise: 2000 });
    expect(b.taxPaise).toBe(a.taxPaise);
    expect(b.payablePaise - a.payablePaise).toBe(2000);
  });
});

describe("Modifier & variant validation", () => {
  const groups = [
    {
      id: "a0000000-0000-4000-8000-000000000001",
      name: "Dip",
      minSelect: 1,
      maxSelect: 1,
      isRequired: true,
      options: [{ id: "b0000000-0000-4000-8000-000000000001", name: "Mint", pricePaise: 3000, isAvailable: true }],
    },
    {
      id: "a0000000-0000-4000-8000-000000000002",
      name: "Extras",
      minSelect: 2,
      maxSelect: 3,
      isRequired: false,
      options: [
        { id: "b0000000-0000-4000-8000-000000000002", name: "Egg", pricePaise: 2000, isAvailable: true },
        { id: "b0000000-0000-4000-8000-000000000003", name: "Raita", pricePaise: 2000, isAvailable: true },
      ],
    },
  ];

  it("rejects duplicate option ids (double charge / count bypass)", () => {
    const r = ModifierValidator.validate(groups, ["b0000000-0000-4000-8000-000000000001", "b0000000-0000-4000-8000-000000000001"]);
    expect(r.isValid).toBe(false);
  });

  it("enforces an optional group's minimum once the customer starts choosing", () => {
    expect(ModifierValidator.validate(groups, ["b0000000-0000-4000-8000-000000000001"]).isValid).toBe(true);
    expect(
      ModifierValidator.validate(groups, ["b0000000-0000-4000-8000-000000000001", "b0000000-0000-4000-8000-000000000002"]).isValid
    ).toBe(false);
  });

  it("requires a portion when an item has variants", () => {
    const variants = [{ id: "c0000000-0000-4000-8000-000000000001", name: "Half", pricePaise: 100, isAvailable: true }];
    expect(ModifierValidator.resolveVariant("Dal", variants, undefined).ok).toBe(false);
    expect(ModifierValidator.resolveVariant("Dal", variants, variants[0]!.id).ok).toBe(true);
    expect(ModifierValidator.resolveVariant("Dal", [{ ...variants[0]!, isAvailable: false }], variants[0]!.id).ok).toBe(false);
  });
});

describe("Opening hours (Asia/Kolkata)", () => {
  // 2026-10-20 is a Tuesday. 06:30 UTC = 12:00 IST; 18:30 UTC = 00:00 IST Wednesday
  const noonIst = new Date("2026-10-20T06:30:00Z");
  const midnightIst = new Date("2026-10-20T18:30:00Z");
  const lunchOnly = { tue: [["11:00", "15:00"]] as [string, string][], wed: [["11:00", "15:00"]] as [string, string][] };
  const lateNight = { tue: [["18:00", "03:00"]] as [string, string][] };

  it("treats missing schedules as always open", () => {
    expect(OpeningHoursPolicy.isOpenAt(null, noonIst)).toBe(true);
  });

  it("evaluates same-day ranges in IST", () => {
    expect(OpeningHoursPolicy.isOpenAt(lunchOnly, noonIst)).toBe(true);
    expect(OpeningHoursPolicy.isOpenAt(lunchOnly, midnightIst)).toBe(false);
    expect(OpeningHoursPolicy.nextOpeningText(lunchOnly, midnightIst)).toBe("Opens at 11:00 AM");
  });

  it("handles ranges that wrap past midnight", () => {
    expect(OpeningHoursPolicy.isOpenAt(lateNight, midnightIst)).toBe(true); // Tue 18:00 → Wed 03:00
    expect(OpeningHoursPolicy.isOpenAt(lateNight, noonIst)).toBe(false);
  });
});

describe("Cancellation policy", () => {
  it("customers cancel free only before the restaurant accepts", () => {
    expect(CancellationPolicy.evaluate("CUSTOMER", FulfillmentState.AWAITING_MERCHANT)).toMatchObject({ allowed: true, refundPolicy: "FULL" });
    expect(CancellationPolicy.evaluate("CUSTOMER", FulfillmentState.PENDING_PAYMENT)).toMatchObject({ allowed: true, refundPolicy: "NONE" });
    expect(CancellationPolicy.evaluate("CUSTOMER", FulfillmentState.PREPARING).allowed).toBe(false);
    expect(CancellationPolicy.evaluate("CUSTOMER", FulfillmentState.OUT_FOR_DELIVERY).allowed).toBe(false);
  });

  it("admins fail (not cancel) orders that are already with the rider", () => {
    expect(CancellationPolicy.evaluate("ADMIN", FulfillmentState.OUT_FOR_DELIVERY)).toMatchObject({
      allowed: true,
      targetState: FulfillmentState.DELIVERY_FAILED,
      refundPolicy: "DISCRETIONARY",
    });
  });

  it("nobody can cancel a terminal order", () => {
    for (const actor of ["CUSTOMER", "MERCHANT", "ADMIN", "SYSTEM"] as const) {
      expect(CancellationPolicy.evaluate(actor, FulfillmentState.DELIVERED).allowed).toBe(false);
    }
  });
});

describe("Delivery trip state machine", () => {
  it("allows the happy path and forbids skipping pickup", () => {
    expect(DeliveryTripStateMachine.canTransition(DeliveryTripStatus.ASSIGNED, DeliveryTripStatus.AT_PICKUP)).toBe(true);
    expect(DeliveryTripStateMachine.canTransition(DeliveryTripStatus.PICKED_UP, DeliveryTripStatus.COMPLETED)).toBe(true);
    expect(DeliveryTripStateMachine.canTransition(DeliveryTripStatus.ASSIGNED, DeliveryTripStatus.COMPLETED)).toBe(false);
    expect(DeliveryTripStateMachine.canTransition(DeliveryTripStatus.COMPLETED, DeliveryTripStatus.FAILED)).toBe(false);
  });
});

describe("Identifiers & secrets", () => {
  it("generates zero-padded numeric OTPs from a CSPRNG", () => {
    for (let i = 0; i < 200; i++) expect(generateVerificationOtp(4)).toMatch(/^\d{4}$/);
    expect(new Set(Array.from({ length: 50 }, () => generateOrderNumber())).size).toBe(50);
  });

  it("compares secrets in constant time and length-safely", () => {
    expect(safeEqual("1234", "1234")).toBe(true);
    expect(safeEqual("1234", "12345")).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { AcquisitionChannel, FaultCode } from "@startup/contracts";
import {
  DEFAULT_COMMISSION_POLICY,
  LedgerEngine,
  SettlementCalculator,
  buildAddonBagLabel,
  buildBatchManifest,
  buildMerchantSavingsReport,
  buildSamplingInstruction,
  calculateCommission,
  calculateCorporateSplit,
  calculatePackagingIssuance,
  calculatePassExpiry,
  calculateRefundAllocation,
  calculateSamplingBounty,
  canAppendAddon,
  canReserveSurplus,
  captainPayable,
  decideAcquisitionChannel,
  decideScheduledMealSkip,
  deriveMerchantDelayFault,
  generateSignedMerchantLink,
  getSlotDeliveryQuote,
  isCorporateLunchSlot,
  priceOneTapAddon,
  priceSurplusBag,
  sequenceDropPoints,
  shouldAttachSampling,
  signAttributionToken,
  verifyAttributionToken,
  deliveryFeeRefundDue,
  selectUpsellSkus,
} from "../src/index.js";

describe("Growth and pricing modules", () => {
  describe("Attribution", () => {
    const secret = "test-link-secret";
    const now = new Date("2026-10-24T10:00:00Z");

    it("signs and verifies a merchant token and rejects tampering/expiry", () => {
      const payload = {
        restaurantId: "60000000-0000-4000-8000-000000000001",
        slug: "burger-club",
        channel: AcquisitionChannel.MERCHANT_DIRECT_SESSION,
        exp: Math.floor(now.getTime() / 1000) + 3600,
      };
      const token = signAttributionToken(payload, secret);
      expect(verifyAttributionToken(token, secret, now.getTime())).toEqual(payload);
      expect(verifyAttributionToken(token, "wrong-secret", now.getTime())).toBeNull();

      const tampered = `${token.slice(0, -1)}${token.endsWith("a") ? "b" : "a"}`;
      expect(verifyAttributionToken(tampered, secret, now.getTime())).toBeNull();

      const expired = signAttributionToken({ ...payload, exp: Math.floor(now.getTime() / 1000) - 1 }, secret);
      expect(verifyAttributionToken(expired, secret, now.getTime())).toBeNull();
    });

    it("builds a storefront URL and applies the 24h session decision", () => {
      const link = generateSignedMerchantLink({
        baseUrl: "https://app.example/",
        restaurantId: "60000000-0000-4000-8000-000000000001",
        slug: "burger-club",
        hmacSecret: secret,
        now,
      });
      expect(link.url).toContain("https://app.example/m/burger-club?token=");
      expect(new Date(link.expiresAt).getTime()).toBe(now.getTime() + 24 * 60 * 60 * 1000);

      expect(decideAcquisitionChannel({ hasValidSession: true, isFirstOrigin: false })).toBe(
        AcquisitionChannel.MERCHANT_DIRECT_SESSION
      );
      expect(decideAcquisitionChannel({ hasValidSession: false, isFirstOrigin: true })).toBe(
        AcquisitionChannel.MERCHANT_FIRST_ORIGIN
      );
      expect(decideAcquisitionChannel({ hasValidSession: false, isFirstOrigin: false })).toBe(
        AcquisitionChannel.MARKETPLACE
      );
    });
  });

  describe("Capped/floored commission", () => {
    const policy = { ...DEFAULT_COMMISSION_POLICY, commissionBp: 1200, commissionMinPaise: 1900, commissionMaxPaise: 4900 };

    it("clamps marketplace commission to the merchant band", () => {
      expect(calculateCommission({ subtotalPaise: 10000, channel: AcquisitionChannel.MARKETPLACE, policy }).commissionPaise).toBe(1900);
      expect(calculateCommission({ subtotalPaise: 40000, channel: AcquisitionChannel.MARKETPLACE, policy }).commissionPaise).toBe(4800);
      expect(calculateCommission({ subtotalPaise: 50000, channel: AcquisitionChannel.MARKETPLACE, policy }).commissionPaise).toBe(4900);
    });

    it("charges a flat fee on direct orders and caps first-origin commission", () => {
      const direct = calculateCommission({
        subtotalPaise: 40000,
        channel: AcquisitionChannel.MERCHANT_DIRECT_SESSION,
        policy: { ...policy, directOrderFlatFeePaise: 1500 },
      });
      expect(direct.commissionPaise).toBe(0);
      expect(direct.merchantOrderFeePaise).toBe(1500);

      const firstOrigin = calculateCommission({
        subtotalPaise: 50000,
        channel: AcquisitionChannel.MERCHANT_FIRST_ORIGIN,
        policy: { ...policy, firstOriginCapPaise: 3000 },
      });
      expect(firstOrigin.commissionPaise).toBe(3000);
    });

    it("keeps meal pass and corporate food free of commission", () => {
      expect(
        calculateCommission({ subtotalPaise: 12900, channel: AcquisitionChannel.MEAL_PASS, policy }).commissionPaise
      ).toBe(0);
      expect(
        calculateCommission({ subtotalPaise: 12900, channel: AcquisitionChannel.CORPORATE_CLUB, policy }).commissionPaise
      ).toBe(0);
    });

    it("deducts commission and flat fees from merchant payout", () => {
      expect(
        SettlementCalculator.merchantEarningAfterFees({ subtotalPaise: 40000, packagingPaise: 2000 }, 4800, 1500)
      ).toBe(35700);
    });
  });

  describe("Fault-attributed refunds", () => {
    it("charges quality/delay faults to the merchant, capped at payout", () => {
      expect(
        calculateRefundAllocation({
          refundAmountPaise: 10000,
          merchantNetPayoutPaise: 20000,
          faultCode: FaultCode.MERCHANT_QUALITY,
        })
      ).toMatchObject({ merchantRecoveryBp: 10000, merchantDeductionPaise: 10000, platformRefundExpensePaise: 0 });

      expect(
        calculateRefundAllocation({
          refundAmountPaise: 10000,
          merchantNetPayoutPaise: 5000,
          faultCode: FaultCode.MERCHANT_QUALITY,
        })
      ).toMatchObject({ merchantDeductionPaise: 5000, platformRefundExpensePaise: 5000 });

      expect(
        calculateRefundAllocation({
          refundAmountPaise: 10000,
          merchantNetPayoutPaise: 20000,
          faultCode: FaultCode.MERCHANT_DELAY,
        }).merchantDeductionPaise
      ).toBe(7000);
      expect(
        calculateRefundAllocation({
          refundAmountPaise: 10000,
          merchantNetPayoutPaise: 20000,
          faultCode: FaultCode.RIDER_DELAY,
        }).merchantDeductionPaise
      ).toBe(0);
    });

    it("detects a merchant delay only after prep + 8 minutes", () => {
      expect(
        deriveMerchantDelayFault({
          acceptedAt: "2026-10-24T10:00:00Z",
          prepTimeMinutes: 15,
          readyAt: "2026-10-24T10:20:00Z",
        })
      ).toBeNull();
      expect(
        deriveMerchantDelayFault({
          acceptedAt: "2026-10-24T10:00:00Z",
          prepTimeMinutes: 15,
          readyAt: "2026-10-24T10:25:00Z",
        })
      ).toBe(FaultCode.MERCHANT_DELAY);
    });

    it("posts a balanced fault allocation ledger", () => {
      const entries = LedgerEngine.buildFaultAllocatedRefundEntries(
        { refundAmountPaise: 10000, merchantDeductionPaise: 7000, platformRefundExpensePaise: 3000 },
        "late kitchen"
      );
      expect(LedgerEngine.validateBalanced(entries)).toBe(true);
      expect(entries.find((e) => e.account === "MERCHANT_PAYABLE")?.debitPaise).toBe(7000);
    });
  });

  describe("Meal pass skip policy", () => {
    const cutoff = new Date("2026-10-24T13:00:00Z");
    const base = { slotCutoffAt: cutoff, lateSkipFeePaise: 2500, kitchenPayoutPaise: 7800 };

    it("gives free early skips, charges late skips and rejects last-hour skips", () => {
      expect(decideScheduledMealSkip({ ...base, now: new Date("2026-10-24T08:00:00Z") })).toMatchObject({
        action: "EARLY_SKIP",
        mealsDelta: 0,
        lateSkipFeePaise: 0,
      });
      expect(decideScheduledMealSkip({ ...base, now: new Date("2026-10-24T10:00:00Z") })).toMatchObject({
        action: "LATE_SKIP",
        mealsDelta: -1,
        lateSkipFeePaise: 2500,
        guaranteeKitchenPayoutPaise: 7800,
        createSurplus: true,
      });
      expect(decideScheduledMealSkip({ ...base, now: new Date("2026-10-24T12:30:00Z") }).action).toBe("REJECT");
    });

    it("expires a pass by validity days", () => {
      expect(calculatePassExpiry(new Date("2026-10-01T00:00:00Z"), 30).toISOString()).toBe("2026-10-31T00:00:00.000Z");
    });
  });

  describe("Batch slot pricing and sequencing", () => {
    it("unlocks zero delivery at six orders and charges express at cost", () => {
      expect(getSlotDeliveryQuote({ currentOrders: 5 })).toMatchObject({
        currentDeliveryFeePaise: 1500,
        unlockedZeroDelivery: false,
      });
      expect(getSlotDeliveryQuote({ currentOrders: 6 })).toMatchObject({
        currentDeliveryFeePaise: 0,
        unlockedZeroDelivery: true,
      });
      expect(getSlotDeliveryQuote({ currentOrders: 1, isExpressPointToPoint: true })).toMatchObject({
        currentDeliveryFeePaise: 4000,
        unlockedZeroDelivery: false,
        express: true,
      });
      expect(deliveryFeeRefundDue({ paidFeePaise: 1500, finalOrders: 6 })).toBe(1500);
      expect(deliveryFeeRefundDue({ paidFeePaise: 1500, finalOrders: 5 })).toBe(0);
    });

    it("sequences drops and builds a captain manifest", () => {
      const pickup = { latitude: 28.6139, longitude: 77.209 };
      const drops = [
        { id: "b", name: "Block B", latitude: 28.614, longitude: 77.211, bagCount: 2 },
        { id: "a", name: "Block A", latitude: 28.614, longitude: 77.2095, bagCount: 1 },
      ];
      const sequenced = sequenceDropPoints(pickup, drops);
      expect(sequenced.map((d) => d.id)).toEqual(["a", "b"]);
      const manifest = buildBatchManifest({ batchId: "batch-1", pickup, drops, captainFeePerBagPaise: 300 });
      expect(manifest.totalBags).toBe(3);
      expect(manifest.captainPayablePaise).toBe(900);
      expect(manifest.drops[0]?.qrPayload).toContain("BATCH:batch-1");
      expect(captainPayable(20, 300)).toBe(6000);
    });
  });

  describe("Add-ons, surplus and sampling", () => {
    it("prices an add-on with zero delivery/platform fee", () => {
      expect(priceOneTapAddon({ pricePaise: 3500, cogsPaise: 1800 })).toEqual({
        unitPricePaise: 3500,
        quantity: 1,
        subtotalPaise: 3500,
        foodTaxPaise: 175,
        payablePaise: 3675,
        grossMarginPaise: 1700,
      });
      expect(canAppendAddon(new Date("2026-10-24T12:00:00Z"), new Date("2026-10-24T12:15:00Z"))).toBe(true);
      expect(canAppendAddon(new Date("2026-10-24T12:20:00Z"), new Date("2026-10-24T12:15:00Z"))).toBe(false);
      expect(selectUpsellSkus([
        { isActive: true, stockCount: 1 },
        { isActive: false, stockCount: 5 },
        { isActive: true, stockCount: 4 },
        { isActive: true, stockCount: 2 },
      ], 2)).toHaveLength(2);
      expect(buildAddonBagLabel("BAG #B14", "Chaas")).toBe("BAG #B14 - +1 CHAAS");
    });

    it("prices rescue bags and prevents overselling", () => {
      expect(priceSurplusBag({ originalValuePaise: 15000, platformFlatFeePaise: 2000, discountBp: 4500 })).toMatchObject({
        salePricePaise: 8250,
        discountPaise: 6750,
        merchantProceedsPaise: 6250,
      });
      expect(canReserveSurplus({ quantityAvailable: 1 })).toBe(true);
      expect(canReserveSurplus({ quantityAvailable: 0 })).toBe(false);
    });

    it("attaches only remaining sampling units and computes packaging cost", () => {
      expect(calculateSamplingBounty({ bountyPerBoxPaise: 350, units: 3, remainingUnits: 2 })).toEqual({
        unitsToAttach: 2,
        bountyPaise: 700,
      });
      expect(
        shouldAttachSampling({
          campaignClusterId: "c1",
          orderClusterId: "c1",
          active: true,
          remainingUnits: 10,
          startsAt: new Date("2026-10-20T00:00:00Z"),
          now: new Date("2026-10-24T00:00:00Z"),
        })
      ).toBe(true);
      expect(calculatePackagingIssuance({ quantity: 100, unitCostPaise: 1200 }).totalCostPaise).toBe(120000);
      expect(buildSamplingInstruction("Acme", 2)).toContain("2 ACME SAMPLES");
    });
  });

  describe("Merchant savings and corporate billing", () => {
    it("computes effective take rate, incumbent savings and reliability rebate", () => {
      const report = buildMerchantSavingsReport(
        [
          {
            channel: AcquisitionChannel.MARKETPLACE,
            orders: 100,
            gmvPaise: 4_000_000,
            platformFeesPaise: 480_000,
            merchantPayoutPaise: 3_520_000,
            onTimeOrders: 98,
            deliveredOrders: 100,
            defectRefunds: 0,
            refundedOrders: 0,
          },
          {
            channel: AcquisitionChannel.MERCHANT_DIRECT_SESSION,
            orders: 20,
            gmvPaise: 800_000,
            platformFeesPaise: 20_000,
            merchantPayoutPaise: 780_000,
            onTimeOrders: 19,
            deliveredOrders: 20,
            defectRefunds: 1,
            refundedOrders: 1,
          },
        ],
        { startDate: "2026-10-01", endDate: "2026-10-31" }
      );
      expect(report.totalOrders).toBe(120);
      expect(report.totalGmvPaise).toBe(4_800_000);
      expect(report.effectiveTakeRatePercent).toBe(10.42);
      expect(report.incumbentBenchmarkPaise).toBe(1_440_000);
      expect(report.netRupeesSavedPaise).toBe(940_000);
      expect(report.onTimeHandoverRatePercent).toBe(97.5);
      expect(report.defectRefundRatePercent).toBe(0.83);
      expect(report.reliabilityRebateEligible).toBe(true);
      expect(report.reliabilityRebatePaise).toBe(7500);
    });

    it("splits corporate allowance and charges only the overage", () => {
      expect(
        calculateCorporateSplit({
          orderTotalPaise: 20000,
          dailyAllowancePaise: 13000,
          subsidyBp: 10000,
          managementFeeBp: 500,
        })
      ).toMatchObject({
        coveredPaise: 13000,
        overagePaise: 7000,
        managementFeePaise: 650,
        corporateBilledPaise: 13650,
        employeePayablePaise: 7000,
      });
      expect(
        calculateCorporateSplit({
          orderTotalPaise: 20000,
          dailyAllowancePaise: 13000,
          subsidyBp: 5000,
          managementFeeBp: 500,
        }).coveredPaise
      ).toBe(6500);
      expect(isCorporateLunchSlot(new Date("2026-10-23T07:00:00Z"))).toBe(true);
      expect(isCorporateLunchSlot(new Date("2026-10-25T07:00:00Z"))).toBe(false);
      expect(isCorporateLunchSlot(new Date("2026-10-23T16:30:00Z"))).toBe(false);
    });
  });
});

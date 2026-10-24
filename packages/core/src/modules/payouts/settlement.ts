import { AcquisitionChannel, FaultCode, QuoteBreakdown } from "@startup/contracts";

export const DEFAULT_COMMISSION_BP = 1500;

export interface CommissionPolicy {
  commissionBp: number;
  commissionMinPaise: number;
  commissionMaxPaise: number;
  directOrderFlatFeePaise: number;
  firstOriginCapPaise: number;
}

export interface CommissionCalculation {
  channel: AcquisitionChannel;
  commissionPaise: number;
  merchantOrderFeePaise: number;
  commissionBpApplied: number;
}

export const DEFAULT_COMMISSION_POLICY: CommissionPolicy = {
  commissionBp: DEFAULT_COMMISSION_BP,
  commissionMinPaise: 1900,
  commissionMaxPaise: 4900,
  directOrderFlatFeePaise: 1500,
  firstOriginCapPaise: 4900,
};

function assertNonNegativeInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 0) throw new Error(`${name} must be a non-negative integer`);
}

/**
 * Exact paise math. Marketplace commission is clamped to the merchant's band;
 * direct orders pay a flat fee instead of a percentage; first-origin orders get
 * the marketplace rate capped at the lifetime-origin cap.
 */
export function calculateCommission(input: {
  subtotalPaise: number;
  channel: AcquisitionChannel;
  policy: CommissionPolicy;
}): CommissionCalculation {
  const { subtotalPaise, channel, policy } = input;
  assertNonNegativeInteger(subtotalPaise, "subtotalPaise");
  assertNonNegativeInteger(policy.commissionBp, "commissionBp");
  assertNonNegativeInteger(policy.commissionMinPaise, "commissionMinPaise");
  assertNonNegativeInteger(policy.commissionMaxPaise, "commissionMaxPaise");
  assertNonNegativeInteger(policy.directOrderFlatFeePaise, "directOrderFlatFeePaise");
  assertNonNegativeInteger(policy.firstOriginCapPaise, "firstOriginCapPaise");

  if (channel === AcquisitionChannel.MERCHANT_DIRECT_SESSION) {
    return {
      channel,
      commissionPaise: 0,
      merchantOrderFeePaise: policy.directOrderFlatFeePaise,
      commissionBpApplied: 0,
    };
  }

  if (
    channel === AcquisitionChannel.MEAL_PASS ||
    channel === AcquisitionChannel.CORPORATE_CLUB ||
    channel === AcquisitionChannel.SURPLUS_BAG
  ) {
    return { channel, commissionPaise: 0, merchantOrderFeePaise: 0, commissionBpApplied: 0 };
  }

  const min = Math.min(policy.commissionMinPaise, policy.commissionMaxPaise);
  const max = Math.max(policy.commissionMinPaise, policy.commissionMaxPaise);
  const bp = Math.min(10000, policy.commissionBp);
  const raw = subtotalPaise === 0 ? 0 : Math.round((subtotalPaise * bp) / 10000);
  let commissionPaise = subtotalPaise === 0 ? 0 : Math.min(Math.max(raw, min), max);

  if (channel === AcquisitionChannel.MERCHANT_FIRST_ORIGIN) {
    commissionPaise = Math.min(commissionPaise, policy.firstOriginCapPaise);
  }

  return {
    channel,
    commissionPaise,
    merchantOrderFeePaise: 0,
    commissionBpApplied: subtotalPaise === 0 ? 0 : Math.round((commissionPaise * 10000) / subtotalPaise),
  };
}

export interface RefundAllocationInput {
  refundAmountPaise: number;
  merchantNetPayoutPaise: number;
  faultCode: FaultCode;
  taxPaise?: number;
  orderPayablePaise?: number;
}

export interface RefundAllocation {
  faultCode: FaultCode;
  merchantRecoveryBp: number;
  merchantDeductionPaise: number;
  platformRefundExpensePaise: number;
  taxAdjustmentPaise: number;
}

/** Who bears the refund. Merchant deductions can never exceed the order's merchant payout. */
export function calculateRefundAllocation(input: RefundAllocationInput): RefundAllocation {
  assertNonNegativeInteger(input.refundAmountPaise, "refundAmountPaise");
  assertNonNegativeInteger(input.merchantNetPayoutPaise, "merchantNetPayoutPaise");
  if (input.refundAmountPaise <= 0) throw new Error("Refund amount must be positive");

  const merchantRecoveryBp =
    input.faultCode === FaultCode.MERCHANT_QUALITY
      ? 10000
      : input.faultCode === FaultCode.MERCHANT_DELAY
        ? 7000
        : 0;

  const requested = Math.round((input.refundAmountPaise * merchantRecoveryBp) / 10000);
  const merchantDeductionPaise = Math.min(requested, input.merchantNetPayoutPaise, input.refundAmountPaise);
  const taxAdjustmentPaise =
    input.taxPaise && input.orderPayablePaise && input.orderPayablePaise > 0
      ? Math.min(input.refundAmountPaise, Math.round((input.refundAmountPaise * input.taxPaise) / input.orderPayablePaise))
      : 0;
  return {
    faultCode: input.faultCode,
    merchantRecoveryBp,
    merchantDeductionPaise,
    platformRefundExpensePaise: input.refundAmountPaise - merchantDeductionPaise,
    taxAdjustmentPaise,
  };
}

/**
 * A kitchen handover later than promised prep + grace is a merchant delay.
 * Returns null when there is not enough evidence to blame the merchant.
 */
export function deriveMerchantDelayFault(input: {
  readyAt?: Date | string | null;
  acceptedAt?: Date | string | null;
  prepTimeMinutes?: number | null;
  promisedPrepAt?: Date | string | null;
  graceMinutes?: number;
}): FaultCode | null {
  const toMs = (value: Date | string | null | undefined): number | null => {
    if (!value) return null;
    const ms = value instanceof Date ? value.getTime() : new Date(value).getTime();
    return Number.isFinite(ms) ? ms : null;
  };
  const readyMs = toMs(input.readyAt);
  if (readyMs === null) return null;
  let promisedMs = toMs(input.promisedPrepAt);
  if (promisedMs === null) {
    const acceptedMs = toMs(input.acceptedAt);
    if (acceptedMs === null || input.prepTimeMinutes === null || input.prepTimeMinutes === undefined) return null;
    promisedMs = acceptedMs + Math.max(0, input.prepTimeMinutes) * 60 * 1000;
  }
  const graceMs = Math.max(0, input.graceMinutes ?? 8) * 60 * 1000;
  return readyMs > promisedMs + graceMs ? FaultCode.MERCHANT_DELAY : null;
}

export interface SettlementBreakdown extends Pick<QuoteBreakdown, "subtotalPaise" | "packagingPaise" | "platformFeePaise"> {}

export class SettlementCalculator {
  static commission(subtotalPaise: number, commissionBp = DEFAULT_COMMISSION_BP): number {
    return Math.round((subtotalPaise * commissionBp) / 10000);
  }

  static calculateCommission(input: {
    subtotalPaise: number;
    channel: AcquisitionChannel;
    policy: CommissionPolicy;
  }): CommissionCalculation {
    return calculateCommission(input);
  }

  /** Food net of platform commission and any flat merchant order fee, plus packaging. */
  static merchantEarning(b: Pick<QuoteBreakdown, "subtotalPaise" | "packagingPaise">, commissionBp = DEFAULT_COMMISSION_BP): number {
    return b.subtotalPaise - SettlementCalculator.commission(b.subtotalPaise, commissionBp) + b.packagingPaise;
  }

  static merchantEarningAfterFees(
    b: Pick<QuoteBreakdown, "subtotalPaise" | "packagingPaise">,
    commissionPaise: number,
    merchantOrderFeePaise = 0
  ): number {
    return b.subtotalPaise - commissionPaise - merchantOrderFeePaise + b.packagingPaise;
  }

  /** Delivery fee, surge and 100% of the tip. */
  static riderEarning(b: Pick<QuoteBreakdown, "deliveryFeePaise" | "surgePaise" | "tipPaise">): number {
    return b.deliveryFeePaise + b.surgePaise + (b.tipPaise ?? 0);
  }

  static platformRevenue(
    b: Pick<QuoteBreakdown, "subtotalPaise" | "platformFeePaise">,
    commissionBp = DEFAULT_COMMISSION_BP
  ): number {
    return SettlementCalculator.commission(b.subtotalPaise, commissionBp) + b.platformFeePaise;
  }

  static platformRevenueAfterFees(
    b: Pick<QuoteBreakdown, "platformFeePaise">,
    commissionPaise: number,
    merchantOrderFeePaise = 0
  ): number {
    return commissionPaise + merchantOrderFeePaise + b.platformFeePaise;
  }
}

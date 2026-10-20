import type { QuoteBreakdown } from "@startup/contracts";

export const DEFAULT_COMMISSION_BP = 1500;

/**
 * Who earns what from one paid order. Shared by the capture ledger and payouts so the
 * amounts we owe and the amounts we pay can never diverge.
 */
export class SettlementCalculator {
  static commission(subtotalPaise: number, commissionBp = DEFAULT_COMMISSION_BP): number {
    return Math.round((subtotalPaise * commissionBp) / 10000);
  }

  /** Food net of platform commission, plus the restaurant's packaging charge. */
  static merchantEarning(b: Pick<QuoteBreakdown, "subtotalPaise" | "packagingPaise">, commissionBp = DEFAULT_COMMISSION_BP): number {
    return b.subtotalPaise - SettlementCalculator.commission(b.subtotalPaise, commissionBp) + b.packagingPaise;
  }

  /** Delivery fee, surge and 100% of the tip. */
  static riderEarning(b: Pick<QuoteBreakdown, "deliveryFeePaise" | "surgePaise" | "tipPaise">): number {
    return b.deliveryFeePaise + b.surgePaise + (b.tipPaise ?? 0);
  }

  static platformRevenue(b: Pick<QuoteBreakdown, "subtotalPaise" | "platformFeePaise">, commissionBp = DEFAULT_COMMISSION_BP): number {
    return SettlementCalculator.commission(b.subtotalPaise, commissionBp) + b.platformFeePaise;
  }
}

import { SettlementCalculator } from "../payouts/settlement.js";

export const LedgerAccountType = {
  GATEWAY_CLEARING: "GATEWAY_CLEARING",
  MERCHANT_PAYABLE: "MERCHANT_PAYABLE",
  RIDER_PAYABLE: "RIDER_PAYABLE",
  PLATFORM_REVENUE: "PLATFORM_REVENUE",
  TAX_PAYABLE: "TAX_PAYABLE",
  REFUND_CLEARING: "REFUND_CLEARING",
  DISCOUNT_EXPENSE: "DISCOUNT_EXPENSE",
  PLATFORM_REFUND_EXPENSE: "PLATFORM_REFUND_EXPENSE",
  PLATFORM_LOGISTICS_EXPENSE: "PLATFORM_LOGISTICS_EXPENSE",
  MEAL_PASS_DEFERRED_REVENUE: "MEAL_PASS_DEFERRED_REVENUE",
  CAPTAIN_PAYABLE: "CAPTAIN_PAYABLE",
  CORPORATE_RECEIVABLE: "CORPORATE_RECEIVABLE",
} as const;
export type LedgerAccountType = (typeof LedgerAccountType)[keyof typeof LedgerAccountType];

export interface LedgerEntry {
  account: LedgerAccountType;
  debitPaise: number;
  creditPaise: number;
  description: string;
}

export interface LedgerTransaction {
  id: string;
  orderId?: string;
  paymentId?: string;
  refundId?: string;
  effectType: "CAPTURE" | "REFUND" | "PAYOUT";
  entries: LedgerEntry[];
  createdAt: string;
}

export class LedgerEngine {
  /**
   * Verifies that the double-entry transaction balances: sum(debit) == sum(credit)
   */
  static validateBalanced(entries: LedgerEntry[]): boolean {
    if (entries.length < 2) return false;
    let totalDebit = 0;
    let totalCredit = 0;

    for (const entry of entries) {
      if (entry.debitPaise < 0 || entry.creditPaise < 0) return false;
      if (entry.debitPaise > 0 && entry.creditPaise > 0) return false; // Entry is either debit or credit
      totalDebit += entry.debitPaise;
      totalCredit += entry.creditPaise;
    }

    return totalDebit === totalCredit && totalDebit > 0;
  }

  /**
   * Builds balanced ledger entries for a captured order.
   *
   * Debits:  gateway clearing (cash received) + platform-funded discount expense.
   * Credits: merchant (food net of commission + packaging), platform (commission + platform fee),
   *          rider (delivery fee + surge + tip) and GST payable.
   * Because payable = gross charges - discount, both sides always agree.
   */
  static buildOrderCaptureEntries(input: {
    payablePaise: number;
    subtotalPaise: number;
    deliveryFeePaise: number;
    platformFeePaise: number;
    packagingPaise: number;
    taxPaise: number;
    discountPaise?: number;
    surgePaise?: number;
    tipPaise?: number;
    commissionRateBasisPoints?: number; // e.g. 1500 = 15%
    merchantOrderFeePaise?: number;
  }): LedgerEntry[] {
    const commissionBp = input.commissionRateBasisPoints ?? 1500;
    const discountPaise = input.discountPaise ?? 0;
    const surgePaise = input.surgePaise ?? 0;
    const tipPaise = input.tipPaise ?? 0;
    const merchantOrderFeePaise = Math.max(0, Math.round(input.merchantOrderFeePaise ?? 0));

    const commissionPaise = SettlementCalculator.commission(input.subtotalPaise, commissionBp);
    const merchantPayable = SettlementCalculator.merchantEarningAfterFees(
      input,
      commissionPaise,
      merchantOrderFeePaise
    );
    const platformRevenue = SettlementCalculator.platformRevenueAfterFees(
      input,
      commissionPaise,
      merchantOrderFeePaise
    );
    const riderPayable = SettlementCalculator.riderEarning({ ...input, surgePaise, tipPaise });

    const entries: LedgerEntry[] = [
      {
        account: LedgerAccountType.GATEWAY_CLEARING,
        debitPaise: input.payablePaise,
        creditPaise: 0,
        description: "Customer capture received via Razorpay",
      },
      {
        account: LedgerAccountType.DISCOUNT_EXPENSE,
        debitPaise: discountPaise,
        creditPaise: 0,
        description: "Platform-funded coupon discount",
      },
      {
        account: LedgerAccountType.MERCHANT_PAYABLE,
        debitPaise: 0,
        creditPaise: merchantPayable,
        description: "Merchant food revenue (net of commission) and packaging",
      },
      {
        account: LedgerAccountType.PLATFORM_REVENUE,
        debitPaise: 0,
        creditPaise: platformRevenue,
        description: "Platform commission and platform fee",
      },
      {
        account: LedgerAccountType.RIDER_PAYABLE,
        debitPaise: 0,
        creditPaise: riderPayable,
        description: "Rider delivery earnings, surge and tip",
      },
      {
        account: LedgerAccountType.TAX_PAYABLE,
        debitPaise: 0,
        creditPaise: input.taxPaise,
        description: "GST payable",
      },
    ].filter((entry) => entry.debitPaise > 0 || entry.creditPaise > 0);

    if (!LedgerEngine.validateBalanced(entries)) {
      throw new Error("Generated order capture ledger entries are not balanced!");
    }

    return entries;
  }

  /**
   * Builds balanced ledger entries for a customer refund.
   */
  static buildRefundEntries(refundPaise: number, reason: string): LedgerEntry[] {
    const entries: LedgerEntry[] = [
      {
        account: LedgerAccountType.REFUND_CLEARING,
        debitPaise: refundPaise,
        creditPaise: 0,
        description: `Customer refund: ${reason}`,
      },
      {
        account: LedgerAccountType.GATEWAY_CLEARING,
        debitPaise: 0,
        creditPaise: refundPaise,
        description: "Deduction from Razorpay settlement",
      },
    ];

    if (!LedgerEngine.validateBalanced(entries)) {
      throw new Error("Generated refund ledger entries are not balanced!");
    }

    return entries;
  }

  /**
   * Splits a refund between the merchant (quality/delay recovery) and the platform
   * (rider delay/goodwill). It plugs into REFUND_CLEARING so the customer-facing
   * refund transaction stays untouched and the two postings net to zero there.
   */
  static buildFaultAllocatedRefundEntries(
    input: {
      refundAmountPaise: number;
      merchantDeductionPaise: number;
      platformRefundExpensePaise: number;
    },
    reason: string
  ): LedgerEntry[] {
    const entries: LedgerEntry[] = [
      {
        account: LedgerAccountType.MERCHANT_PAYABLE,
        debitPaise: input.merchantDeductionPaise,
        creditPaise: 0,
        description: `Merchant recovery: ${reason}`,
      },
      {
        account: LedgerAccountType.PLATFORM_REFUND_EXPENSE,
        debitPaise: input.platformRefundExpensePaise,
        creditPaise: 0,
        description: `Platform refund expense: ${reason}`,
      },
      {
        account: LedgerAccountType.REFUND_CLEARING,
        debitPaise: 0,
        creditPaise: input.refundAmountPaise,
        description: `Refund allocation: ${reason}`,
      },
    ].filter((entry) => entry.debitPaise > 0 || entry.creditPaise > 0);

    if (!LedgerEngine.validateBalanced(entries)) {
      throw new Error("Generated fault-allocated refund entries are not balanced!");
    }
    return entries;
  }

  /** Splits a paid order between the employee's gateway payment and the company's receivable. */
  static buildCorporateOrderCaptureEntries(input: {
    payablePaise: number;
    corporateCoveredPaise: number;
    subtotalPaise: number;
    deliveryFeePaise: number;
    platformFeePaise: number;
    packagingPaise: number;
    taxPaise: number;
    discountPaise?: number;
    surgePaise?: number;
    tipPaise?: number;
  }): LedgerEntry[] {
    const discountPaise = input.discountPaise ?? 0;
    const surgePaise = input.surgePaise ?? 0;
    const tipPaise = input.tipPaise ?? 0;
    const merchantPayable = SettlementCalculator.merchantEarningAfterFees(input, 0, 0);
    const platformRevenue = input.platformFeePaise;
    const riderPayable = SettlementCalculator.riderEarning({ ...input, surgePaise, tipPaise });
    const entries: LedgerEntry[] = [
      {
        account: LedgerAccountType.GATEWAY_CLEARING,
        debitPaise: input.payablePaise,
        creditPaise: 0,
        description: "Employee corporate overage collected",
      },
      {
        account: LedgerAccountType.CORPORATE_RECEIVABLE,
        debitPaise: input.corporateCoveredPaise,
        creditPaise: 0,
        description: "Corporate allowance receivable",
      },
      {
        account: LedgerAccountType.DISCOUNT_EXPENSE,
        debitPaise: discountPaise,
        creditPaise: 0,
        description: "Corporate order discount",
      },
      {
        account: LedgerAccountType.MERCHANT_PAYABLE,
        debitPaise: 0,
        creditPaise: merchantPayable,
        description: "Corporate order merchant payable",
      },
      {
        account: LedgerAccountType.PLATFORM_REVENUE,
        debitPaise: 0,
        creditPaise: platformRevenue,
        description: "Corporate order platform fee",
      },
      {
        account: LedgerAccountType.RIDER_PAYABLE,
        debitPaise: 0,
        creditPaise: riderPayable,
        description: "Corporate order rider payable",
      },
      {
        account: LedgerAccountType.TAX_PAYABLE,
        debitPaise: 0,
        creditPaise: input.taxPaise,
        description: "Corporate order GST",
      },
    ].filter((entry) => entry.debitPaise > 0 || entry.creditPaise > 0);
    if (!LedgerEngine.validateBalanced(entries)) {
      throw new Error("Generated corporate order ledger entries are not balanced!");
    }
    return entries;
  }

  /** Reverses the GST share of a refund: tax payable down, platform refund expense down. */
  static buildTaxRefundAdjustmentEntries(taxAdjustmentPaise: number, reason: string): LedgerEntry[] {
    const entries: LedgerEntry[] = [
      {
        account: LedgerAccountType.TAX_PAYABLE,
        debitPaise: taxAdjustmentPaise,
        creditPaise: 0,
        description: `GST refund adjustment: ${reason}`,
      },
      {
        account: LedgerAccountType.PLATFORM_REFUND_EXPENSE,
        debitPaise: 0,
        creditPaise: taxAdjustmentPaise,
        description: `Platform refund expense reduced by GST: ${reason}`,
      },
    ];
    if (!LedgerEngine.validateBalanced(entries)) throw new Error("Tax refund adjustment ledger is not balanced");
    return entries;
  }

  static buildMealPassPurchaseEntries(amountPaise: number, reference: string): LedgerEntry[] {    const entries: LedgerEntry[] = [
      {
        account: LedgerAccountType.GATEWAY_CLEARING,
        debitPaise: amountPaise,
        creditPaise: 0,
        description: `Meal pass purchase (${reference})`,
      },
      {
        account: LedgerAccountType.MEAL_PASS_DEFERRED_REVENUE,
        debitPaise: 0,
        creditPaise: amountPaise,
        description: `Meal pass credits sold (${reference})`,
      },
    ];
    if (!LedgerEngine.validateBalanced(entries)) throw new Error("Meal pass purchase ledger is not balanced");
    return entries;
  }

  static buildMealPassKitchenAccrualEntries(amountPaise: number, reference: string): LedgerEntry[] {
    const entries: LedgerEntry[] = [
      {
        account: LedgerAccountType.MEAL_PASS_DEFERRED_REVENUE,
        debitPaise: amountPaise,
        creditPaise: 0,
        description: `Meal pass meal recognised (${reference})`,
      },
      {
        account: LedgerAccountType.MERCHANT_PAYABLE,
        debitPaise: 0,
        creditPaise: amountPaise,
        description: `Kitchen payout guaranteed (${reference})`,
      },
    ];
    if (!LedgerEngine.validateBalanced(entries)) throw new Error("Meal pass accrual ledger is not balanced");
    return entries;
  }

  static buildCaptainHandoverEntries(amountPaise: number, reference: string): LedgerEntry[] {
    const entries: LedgerEntry[] = [
      {
        account: LedgerAccountType.PLATFORM_LOGISTICS_EXPENSE,
        debitPaise: amountPaise,
        creditPaise: 0,
        description: `Micro-captain handover (${reference})`,
      },
      {
        account: LedgerAccountType.CAPTAIN_PAYABLE,
        debitPaise: 0,
        creditPaise: amountPaise,
        description: `Micro-captain payable (${reference})`,
      },
    ];
    if (!LedgerEngine.validateBalanced(entries)) throw new Error("Captain handover ledger is not balanced");
    return entries;
  }

  static buildCaptainPaymentEntries(amountPaise: number, reference: string): LedgerEntry[] {
    const entries: LedgerEntry[] = [
      {
        account: LedgerAccountType.CAPTAIN_PAYABLE,
        debitPaise: amountPaise,
        creditPaise: 0,
        description: `Micro-captain paid (${reference})`,
      },
      {
        account: LedgerAccountType.GATEWAY_CLEARING,
        debitPaise: 0,
        creditPaise: amountPaise,
        description: `Funds transferred to captain (${reference})`,
      },
    ];
    if (!LedgerEngine.validateBalanced(entries)) throw new Error("Captain payment ledger is not balanced");
    return entries;
  }

  static buildSurplusSaleEntries(input: {
    payablePaise: number;
    merchantProceedsPaise: number;
    platformFeePaise: number;
    taxPaise?: number;
    reference: string;
  }): LedgerEntry[] {
    const taxPaise = input.taxPaise ?? 0;
    const entries: LedgerEntry[] = [
      {
        account: LedgerAccountType.GATEWAY_CLEARING,
        debitPaise: input.payablePaise,
        creditPaise: 0,
        description: `Surplus bag sale (${input.reference})`,
      },
      {
        account: LedgerAccountType.MERCHANT_PAYABLE,
        debitPaise: 0,
        creditPaise: input.merchantProceedsPaise,
        description: `Surplus rescue merchant proceeds (${input.reference})`,
      },
      {
        account: LedgerAccountType.PLATFORM_REVENUE,
        debitPaise: 0,
        creditPaise: input.platformFeePaise,
        description: `Surplus rescue platform fee (${input.reference})`,
      },
      {
        account: LedgerAccountType.TAX_PAYABLE,
        debitPaise: 0,
        creditPaise: taxPaise,
        description: `Surplus rescue GST (${input.reference})`,
      },
    ].filter((entry) => entry.debitPaise > 0 || entry.creditPaise > 0);
    if (!LedgerEngine.validateBalanced(entries)) throw new Error("Surplus sale ledger is not balanced");
    return entries;
  }
}

/** Cash leaving the platform to settle what we owe a merchant or rider. */
export function buildPayoutEntries(ownerType: "MERCHANT" | "RIDER", amountPaise: number, reference: string): LedgerEntry[] {
  const entries: LedgerEntry[] = [
    {
      account: ownerType === "MERCHANT" ? LedgerAccountType.MERCHANT_PAYABLE : LedgerAccountType.RIDER_PAYABLE,
      debitPaise: amountPaise,
      creditPaise: 0,
      description: `Payout settled (${reference})`,
    },
    {
      account: LedgerAccountType.GATEWAY_CLEARING,
      debitPaise: 0,
      creditPaise: amountPaise,
      description: `Funds transferred to ${ownerType.toLowerCase()} (${reference})`,
    },
  ];
  if (!LedgerEngine.validateBalanced(entries)) throw new Error("Payout ledger entries are not balanced");
  return entries;
}

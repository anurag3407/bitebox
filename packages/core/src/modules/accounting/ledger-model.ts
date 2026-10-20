export const LedgerAccountType = {
  GATEWAY_CLEARING: "GATEWAY_CLEARING",
  MERCHANT_PAYABLE: "MERCHANT_PAYABLE",
  RIDER_PAYABLE: "RIDER_PAYABLE",
  PLATFORM_REVENUE: "PLATFORM_REVENUE",
  TAX_PAYABLE: "TAX_PAYABLE",
  REFUND_CLEARING: "REFUND_CLEARING",
  DISCOUNT_EXPENSE: "DISCOUNT_EXPENSE",
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
  }): LedgerEntry[] {
    const commissionBp = input.commissionRateBasisPoints ?? 1500;
    const discountPaise = input.discountPaise ?? 0;
    const surgePaise = input.surgePaise ?? 0;
    const tipPaise = input.tipPaise ?? 0;

    const platformCommissionFromFood = Math.round((input.subtotalPaise * commissionBp) / 10000);
    const merchantPayable = input.subtotalPaise - platformCommissionFromFood + input.packagingPaise;
    const platformRevenue = platformCommissionFromFood + input.platformFeePaise;
    const riderPayable = input.deliveryFeePaise + surgePaise + tipPaise;

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
}

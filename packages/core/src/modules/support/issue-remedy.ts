export const IssueCategory = {
  MISSING_ITEM: "MISSING_ITEM",
  WRONG_ITEM: "WRONG_ITEM",
  COLD_FOOD: "COLD_FOOD",
  QUALITY: "QUALITY",
  LATE_DELIVERY: "LATE_DELIVERY",
  SPILLED: "SPILLED",
  NOT_DELIVERED: "NOT_DELIVERED",
  OTHER: "OTHER",
} as const;
export type IssueCategory = (typeof IssueCategory)[keyof typeof IssueCategory];

export type IssueRemedy =
  | { decision: "AUTO_WALLET"; amountPaise: number; reason: string }
  | { decision: "REVIEW"; reason: string };

export interface IssueRemedyInput {
  category: IssueCategory;
  orderDelivered: boolean;
  minutesLate?: number;
  selectedItemsPaise: number;
  subtotalPaise: number;
  hasItemSelection: boolean;
}

const pct = (amount: number, percent: number, cap: number) =>
  Math.max(0, Math.min(cap, Math.round((amount * percent) / 100)));

/**
 * Instant, bounded remedies for common post-delivery problems. Anything that needs
 * an investigation (non-delivery, vague complaints, high-value claims) goes to review.
 * Bounds keep goodwill fraud cheap while making the common cases feel effortless.
 */
export class IssueRemedyPolicy {
  static decide(input: IssueRemedyInput): IssueRemedy {
    if (!input.orderDelivered) {
      return { decision: "REVIEW", reason: "We need to check this order with the delivery partner." };
    }

    switch (input.category) {
      case IssueCategory.MISSING_ITEM:
      case IssueCategory.WRONG_ITEM: {
        if (!input.hasItemSelection) {
          return { decision: "REVIEW", reason: "Select the affected items so we can verify them." };
        }
        const amount = Math.min(input.selectedItemsPaise, 50_000);
        if (amount <= 0) return { decision: "REVIEW", reason: "We could not price the affected items." };
        return {
          decision: "AUTO_WALLET",
          amountPaise: amount,
          reason: `Instant BiteBox Credits for the affected item${input.selectedItemsPaise > amount ? " (capped at ₹500)" : ""}.`,
        };
      }
      case IssueCategory.SPILLED:
        return {
          decision: "AUTO_WALLET",
          amountPaise: pct(input.subtotalPaise, 30, 25_000),
          reason: "Instant BiteBox Credits for a spilled order.",
        };
      case IssueCategory.COLD_FOOD:
        return {
          decision: "AUTO_WALLET",
          amountPaise: pct(input.subtotalPaise, 20, 20_000),
          reason: "Instant BiteBox Credits for food that arrived cold.",
        };
      case IssueCategory.QUALITY:
        return {
          decision: "AUTO_WALLET",
          amountPaise: pct(input.subtotalPaise, 25, 25_000),
          reason: "Instant BiteBox Credits for the quality issue.",
        };
      case IssueCategory.LATE_DELIVERY:
        if ((input.minutesLate ?? 0) >= 20) {
          return {
            decision: "AUTO_WALLET",
            amountPaise: pct(input.subtotalPaise, 10, 15_000),
            reason: "Instant BiteBox Credits for the delayed delivery.",
          };
        }
        return { decision: "REVIEW", reason: "Our team will check the delivery timeline." };
      case IssueCategory.NOT_DELIVERED:
        return { decision: "REVIEW", reason: "Our team will investigate with the delivery partner right away." };
      default:
        return { decision: "REVIEW", reason: "Our support team will review this and reply shortly." };
    }
  }
}

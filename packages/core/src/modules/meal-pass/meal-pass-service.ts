export interface SkipScheduledMealInput {
  now: Date;
  slotCutoffAt: Date;
  lateSkipFeePaise: number;
  kitchenPayoutPaise: number;
}

export type SkipAction = "EARLY_SKIP" | "LATE_SKIP" | "REJECT";

export interface SkipDecision {
  action: SkipAction;
  mealsDelta: number;
  lateSkipFeePaise: number;
  createSurplus: boolean;
  guaranteeKitchenPayoutPaise: number;
  surplusDiscountBp: number;
}

const FOUR_HOURS_MS = 4 * 60 * 60 * 1000;
const ONE_HOUR_MS = 60 * 60 * 1000;

/**
 * Tier 1: more than 4h before cutoff - free skip, restore the credit.
 * Tier 2: within the prep window but more than 1h before cutoff - consume the meal,
 *         charge the late fee, and turn it into a surplus bag so the kitchen is paid.
 * Tier 3: within 1h of cutoff - the dispatch batch is forming; reject the skip.
 */
export function decideScheduledMealSkip(input: SkipScheduledMealInput): SkipDecision {
  const now = input.now.getTime();
  const cutoff = input.slotCutoffAt.getTime();
  if (!Number.isFinite(now) || !Number.isFinite(cutoff)) throw new Error("Invalid skip timestamps");
  if (input.lateSkipFeePaise < 0 || input.kitchenPayoutPaise < 0) throw new Error("Fees cannot be negative");

  if (now > cutoff - ONE_HOUR_MS) {
    return {
      action: "REJECT",
      mealsDelta: 0,
      lateSkipFeePaise: 0,
      createSurplus: false,
      guaranteeKitchenPayoutPaise: 0,
      surplusDiscountBp: 0,
    };
  }

  if (now < cutoff - FOUR_HOURS_MS) {
    return {
      action: "EARLY_SKIP",
      mealsDelta: 0,
      lateSkipFeePaise: 0,
      createSurplus: false,
      guaranteeKitchenPayoutPaise: 0,
      surplusDiscountBp: 0,
    };
  }

  return {
    action: "LATE_SKIP",
    mealsDelta: -1,
    lateSkipFeePaise: input.lateSkipFeePaise,
    createSurplus: true,
    guaranteeKitchenPayoutPaise: input.kitchenPayoutPaise,
    surplusDiscountBp: 4000,
  };
}

export function calculatePassExpiry(purchasedAt: Date, validityDays: number): Date {
  if (!Number.isInteger(validityDays) || validityDays <= 0) throw new Error("validityDays must be positive");
  return new Date(purchasedAt.getTime() + validityDays * 24 * 60 * 60 * 1000);
}

export function isPassUsable(input: {
  status: string;
  mealsRemaining: number;
  expiresAt: Date;
  now?: Date;
}): boolean {
  return (
    input.status === "ACTIVE" &&
    input.mealsRemaining > 0 &&
    input.expiresAt.getTime() > (input.now ?? new Date()).getTime()
  );
}

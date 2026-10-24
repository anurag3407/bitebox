export interface SlotDeliveryQuote {
  currentOrders: number;
  targetOrders: number;
  currentDeliveryFeePaise: number;
  unlockedZeroDelivery: boolean;
  express: boolean;
}

/**
 * Express point-to-point orders pay the full trunk cost so a one-drop trip never
 * bleeds contribution. Batched slots start at a small fee and unlock free delivery
 * once the drop point reaches the threshold before cutoff.
 */
export function getSlotDeliveryQuote(input: {
  currentOrders: number;
  targetOrders?: number;
  baseFeePaise?: number;
  expressFeePaise?: number;
  isExpressPointToPoint?: boolean;
}): SlotDeliveryQuote {
  const targetOrders = input.targetOrders ?? 6;
  const baseFeePaise = input.baseFeePaise ?? 1500;
  const expressFeePaise = input.expressFeePaise ?? 4000;
  if (!Number.isInteger(input.currentOrders) || input.currentOrders < 0) {
    throw new Error("currentOrders must be a non-negative integer");
  }
  if (!Number.isInteger(targetOrders) || targetOrders <= 0) throw new Error("targetOrders must be positive");

  if (input.isExpressPointToPoint) {
    return {
      currentOrders: input.currentOrders,
      targetOrders,
      currentDeliveryFeePaise: expressFeePaise,
      unlockedZeroDelivery: false,
      express: true,
    };
  }

  const unlocked = input.currentOrders >= targetOrders;
  return {
    currentOrders: input.currentOrders,
    targetOrders,
    currentDeliveryFeePaise: unlocked ? 0 : baseFeePaise,
    unlockedZeroDelivery: unlocked,
    express: false,
  };
}

export function deliveryFeeRefundDue(input: {
  paidFeePaise: number;
  finalOrders: number;
  targetOrders?: number;
}): number {
  const target = input.targetOrders ?? 6;
  if (input.paidFeePaise <= 0 || input.finalOrders < target) return 0;
  return input.paidFeePaise;
}

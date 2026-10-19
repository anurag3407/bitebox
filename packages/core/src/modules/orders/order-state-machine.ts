import { FulfillmentState } from "@startup/contracts";

export interface StateTransitionResult {
  allowed: boolean;
  error?: string;
}

export class OrderStateMachine {
  private static readonly ALLOWED_TRANSITIONS: Record<
    FulfillmentState,
    readonly FulfillmentState[]
  > = {
    [FulfillmentState.PENDING_PAYMENT]: [
      FulfillmentState.AWAITING_MERCHANT,
      FulfillmentState.CANCELLED,
    ],
    [FulfillmentState.AWAITING_MERCHANT]: [
      FulfillmentState.ACCEPTED,
      FulfillmentState.CANCELLED,
    ],
    [FulfillmentState.ACCEPTED]: [
      FulfillmentState.PREPARING,
      FulfillmentState.READY_FOR_PICKUP, // Shortcut if kitchen prepares instantly
      FulfillmentState.CANCELLED, // Requires authorized cancellation
    ],
    [FulfillmentState.PREPARING]: [
      FulfillmentState.READY_FOR_PICKUP,
      FulfillmentState.CANCELLED,
    ],
    [FulfillmentState.READY_FOR_PICKUP]: [
      FulfillmentState.PICKED_UP,
      FulfillmentState.CANCELLED,
    ],
    [FulfillmentState.PICKED_UP]: [
      FulfillmentState.OUT_FOR_DELIVERY,
      FulfillmentState.DELIVERY_FAILED,
    ],
    [FulfillmentState.OUT_FOR_DELIVERY]: [
      FulfillmentState.DELIVERED,
      FulfillmentState.DELIVERY_FAILED,
    ],
    [FulfillmentState.DELIVERED]: [], // Terminal
    [FulfillmentState.CANCELLED]: [], // Terminal
    [FulfillmentState.DELIVERY_FAILED]: [], // Terminal
  };

  /**
   * Checks whether a fulfillment transition is valid.
   */
  static canTransition(
    from: FulfillmentState,
    to: FulfillmentState
  ): StateTransitionResult {
    if (from === to) {
      return { allowed: true }; // Idempotent no-op
    }

    const allowedNext = OrderStateMachine.ALLOWED_TRANSITIONS[from];
    if (!allowedNext || !allowedNext.includes(to)) {
      return {
        allowed: false,
        error: `Cannot transition order fulfillment state from ${from} to ${to}`,
      };
    }

    return { allowed: true };
  }

  /**
   * Asserts transition is permitted; throws descriptive error otherwise.
   */
  static assertTransition(from: FulfillmentState, to: FulfillmentState): void {
    const result = OrderStateMachine.canTransition(from, to);
    if (!result.allowed) {
      throw new Error(result.error);
    }
  }

  static isTerminal(state: FulfillmentState): boolean {
    return (
      state === FulfillmentState.DELIVERED ||
      state === FulfillmentState.CANCELLED ||
      state === FulfillmentState.DELIVERY_FAILED
    );
  }
}

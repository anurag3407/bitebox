import { DeliveryTripStatus, FulfillmentState } from "@startup/contracts";

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
      FulfillmentState.DELIVERED, // self-pickup: the customer collects at the counter
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

export class DeliveryTripStateMachine {
  private static readonly ALLOWED_TRANSITIONS: Record<DeliveryTripStatus, readonly DeliveryTripStatus[]> = {
    [DeliveryTripStatus.ASSIGNED]: [
      DeliveryTripStatus.AT_PICKUP,
      DeliveryTripStatus.PICKED_UP, // riders frequently skip "arrived" when food is waiting
      DeliveryTripStatus.CANCELLED,
    ],
    [DeliveryTripStatus.AT_PICKUP]: [DeliveryTripStatus.PICKED_UP, DeliveryTripStatus.CANCELLED],
    [DeliveryTripStatus.PICKED_UP]: [
      DeliveryTripStatus.AT_DROPOFF,
      DeliveryTripStatus.COMPLETED,
      DeliveryTripStatus.FAILED,
    ],
    [DeliveryTripStatus.AT_DROPOFF]: [DeliveryTripStatus.COMPLETED, DeliveryTripStatus.FAILED],
    [DeliveryTripStatus.COMPLETED]: [],
    [DeliveryTripStatus.CANCELLED]: [],
    [DeliveryTripStatus.FAILED]: [],
  };

  static readonly ACTIVE_STATUSES: readonly DeliveryTripStatus[] = [
    DeliveryTripStatus.ASSIGNED,
    DeliveryTripStatus.AT_PICKUP,
    DeliveryTripStatus.PICKED_UP,
    DeliveryTripStatus.AT_DROPOFF,
  ];

  static canTransition(from: DeliveryTripStatus, to: DeliveryTripStatus): boolean {
    return DeliveryTripStateMachine.ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
  }
}

export type CancellationActor = "CUSTOMER" | "MERCHANT" | "ADMIN" | "SYSTEM";
export type RefundPolicy = "NONE" | "FULL" | "DISCRETIONARY";

export interface CancellationDecision {
  allowed: boolean;
  refundPolicy: RefundPolicy;
  // Terminal state to move into: orders already with the rider fail rather than cancel
  targetState: FulfillmentState;
  reason?: string;
}

/**
 * Who may stop an order at which point, and what happens to the money.
 * Mirrors common marketplace policy: customers cancel for free only until the
 * restaurant accepts; after that the restaurant or support must step in.
 */
export class CancellationPolicy {
  private static readonly PRE_PICKUP: readonly FulfillmentState[] = [
    FulfillmentState.ACCEPTED,
    FulfillmentState.PREPARING,
    FulfillmentState.READY_FOR_PICKUP,
  ];

  static evaluate(actor: CancellationActor, state: FulfillmentState): CancellationDecision {
    const deny = (reason: string): CancellationDecision => ({
      allowed: false,
      refundPolicy: "NONE",
      targetState: FulfillmentState.CANCELLED,
      reason,
    });

    if (OrderStateMachine.isTerminal(state)) {
      return deny(`Order is already ${state.toLowerCase().replace(/_/g, " ")}.`);
    }

    const cancelled = (refundPolicy: RefundPolicy): CancellationDecision => ({
      allowed: true,
      refundPolicy,
      targetState: FulfillmentState.CANCELLED,
    });

    switch (actor) {
      case "CUSTOMER":
        if (state === FulfillmentState.PENDING_PAYMENT) return cancelled("NONE");
        if (state === FulfillmentState.AWAITING_MERCHANT) return cancelled("FULL");
        return deny("The restaurant has already started on your order. Please contact support to cancel.");

      case "MERCHANT":
        if (state === FulfillmentState.AWAITING_MERCHANT) return cancelled("FULL");
        if (CancellationPolicy.PRE_PICKUP.includes(state)) return cancelled("FULL");
        return deny("Orders that have left the restaurant cannot be cancelled by the restaurant.");

      case "SYSTEM":
        if (state === FulfillmentState.PENDING_PAYMENT) return cancelled("NONE");
        if (state === FulfillmentState.AWAITING_MERCHANT) return cancelled("FULL");
        if (CancellationPolicy.PRE_PICKUP.includes(state)) return cancelled("FULL");
        return deny("Orders out for delivery are not auto-cancelled.");

      case "ADMIN":
        if (state === FulfillmentState.PICKED_UP || state === FulfillmentState.OUT_FOR_DELIVERY) {
          return {
            allowed: true,
            refundPolicy: "DISCRETIONARY",
            targetState: FulfillmentState.DELIVERY_FAILED,
          };
        }
        return cancelled(state === FulfillmentState.PENDING_PAYMENT ? "NONE" : "DISCRETIONARY");
    }
  }
}

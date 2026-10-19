import { PaymentAttemptStatus, PaymentStatus, RefundStatus } from "@startup/contracts";

export class PaymentStateMachine {
  static canTransitionAttempt(
    from: PaymentAttemptStatus,
    to: PaymentAttemptStatus
  ): boolean {
    if (from === to) return true;
    switch (from) {
      case PaymentAttemptStatus.CREATED:
        return (
          to === PaymentAttemptStatus.PROVIDER_ORDER_CREATING ||
          to === PaymentAttemptStatus.READY
        );
      case PaymentAttemptStatus.PROVIDER_ORDER_CREATING:
        return (
          to === PaymentAttemptStatus.READY ||
          to === PaymentAttemptStatus.UNKNOWN
        );
      case PaymentAttemptStatus.READY:
        return (
          to === PaymentAttemptStatus.UNKNOWN ||
          to === PaymentAttemptStatus.RECONCILING
        );
      case PaymentAttemptStatus.UNKNOWN:
        return to === PaymentAttemptStatus.RECONCILING;
      case PaymentAttemptStatus.RECONCILING:
        return to === PaymentAttemptStatus.READY;
      default:
        return false;
    }
  }

  static canTransitionRefund(from: RefundStatus, to: RefundStatus): boolean {
    if (from === to) return true;
    switch (from) {
      case RefundStatus.REQUESTED:
        return to === RefundStatus.APPROVED || to === RefundStatus.FAILED;
      case RefundStatus.APPROVED:
        return (
          to === RefundStatus.SUBMITTING ||
          to === RefundStatus.FAILED ||
          to === RefundStatus.PROCESSED
        );
      case RefundStatus.SUBMITTING:
        return (
          to === RefundStatus.PENDING ||
          to === RefundStatus.PROCESSED ||
          to === RefundStatus.FAILED ||
          to === RefundStatus.UNKNOWN
        );
      case RefundStatus.PENDING:
        return to === RefundStatus.PROCESSED || to === RefundStatus.FAILED;
      case RefundStatus.UNKNOWN:
        return to === RefundStatus.PROCESSED || to === RefundStatus.FAILED;
      case RefundStatus.PROCESSED:
      case RefundStatus.FAILED:
        return false; // Terminal
      default:
        return false;
    }
  }
}

export interface ExistingPaymentContext {
  orderFulfillmentState: string;
  orderPaymentStatus: PaymentStatus;
  existingAttemptId?: string;
  existingAttemptStatus?: PaymentAttemptStatus;
  capturedAmountPaise: number;
  orderPayablePaise: number;
}

export class OrderFundingGuard {
  /**
   * Evaluates if a new payment attempt can be created for an order.
   * Prevents double-funding, competing parallel checkouts, or charging cancelled orders.
   */
  static evaluateCanCreateAttempt(context: ExistingPaymentContext): {
    canCreate: boolean;
    reason?: string;
    action: "ALLOW" | "REUSE_EXISTING" | "REJECT_ALREADY_PAID" | "REJECT_TERMINAL";
  } {
    if (context.orderPaymentStatus === PaymentStatus.CAPTURED) {
      return {
        canCreate: false,
        reason: "Order is already funded and captured.",
        action: "REJECT_ALREADY_PAID",
      };
    }

    if (
      context.orderFulfillmentState === "CANCELLED" ||
      context.orderFulfillmentState === "DELIVERY_FAILED"
    ) {
      return {
        canCreate: false,
        reason: `Order is in terminal state: ${context.orderFulfillmentState}. Cannot initiate payment.`,
        action: "REJECT_TERMINAL",
      };
    }

    // If an attempt is already ready or creating, reuse existing rather than create duplicate
    if (
      context.existingAttemptId &&
      (context.existingAttemptStatus === PaymentAttemptStatus.READY ||
        context.existingAttemptStatus === PaymentAttemptStatus.PROVIDER_ORDER_CREATING)
    ) {
      return {
        canCreate: false,
        reason: "An active payment attempt already exists for this order.",
        action: "REUSE_EXISTING",
      };
    }

    return {
      canCreate: true,
      action: "ALLOW",
    };
  }
}

import { NextRequest } from "next/server";
import { FulfillmentState, UserRole } from "@startup/contracts";
import { LedgerRepository, OrderRepository, getDb, refunds } from "@startup/database";
import { LedgerEngine } from "@startup/core";
import { apiError, apiSuccess } from "@/server/api-response";
import { getAuthenticatedActor, getOrCreateDbUser } from "@/server/auth-guard";

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ orderId: string }> }
) {
  try {
    const { orderId } = await context.params;
    if (!orderId) {
      return apiError("VALIDATION_ERROR", "orderId is required", 400);
    }

    const actor = await getAuthenticatedActor(req);
    if (!actor) {
      return apiError("UNAUTHORIZED", "Authentication required", 401);
    }

    const order = await OrderRepository.findById(orderId);
    if (!order) {
      return apiError("NOT_FOUND", "Order not found", 404);
    }

    const user = await getOrCreateDbUser(actor);
    const isOwner = order.customerId === user.id;
    const isAdmin = actor.role === UserRole.ADMIN;

    if (!isOwner && !isAdmin) {
      return apiError("FORBIDDEN", "Forbidden: You do not own this order", 403);
    }

    // Cancellation eligibility rules
    if (order.fulfillmentState === FulfillmentState.CANCELLED) {
      return apiError("CONFLICT", "Order is already cancelled", 409);
    }

    if (order.fulfillmentState === FulfillmentState.DELIVERED) {
      return apiError("CONFLICT", "Delivered orders cannot be cancelled", 409);
    }

    if (
      order.fulfillmentState === FulfillmentState.PICKED_UP ||
      order.fulfillmentState === FulfillmentState.OUT_FOR_DELIVERY
    ) {
      return apiError(
        "CONFLICT",
        "Order has already been picked up by the delivery partner and cannot be cancelled",
        409
      );
    }

    let reason = "Cancelled by customer";
    try {
      const body = await req.json();
      if (body?.reason) reason = body.reason;
    } catch {
      // Body is optional
    }

    // 1. Transition fulfillment state to CANCELLED
    await OrderRepository.updateFulfillmentState({
      orderId,
      fromState: order.fulfillmentState as FulfillmentState,
      toState: FulfillmentState.CANCELLED,
      actorType: isAdmin ? "ADMIN" : "CUSTOMER",
      reason,
    });

    // 2. If payment was captured, issue automatic refund and post balanced ledger entries
    if (order.paymentStatus === "CAPTURED") {
      const db = getDb();
      await db.insert(refunds).values({
        orderId,
        amountPaise: order.breakdown.payablePaise,
        reason: `Customer cancellation refund: ${reason}`,
        status: "APPROVED",
      });

      const refundEntries = LedgerEngine.buildRefundEntries(
        order.breakdown.payablePaise,
        `Customer cancellation refund: ${reason}`
      );
      await LedgerRepository.postTransaction({
        orderId,
        effectType: "REFUND",
        entries: refundEntries,
      });
    }

    return apiSuccess({
      success: true,
      orderId,
      fulfillmentState: FulfillmentState.CANCELLED,
    });
  } catch (err: any) {
    return apiError("INTERNAL_ERROR", err.message || "Failed to cancel order", 500);
  }
}

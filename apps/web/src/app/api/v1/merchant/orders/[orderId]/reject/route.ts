import { NextRequest } from "next/server";
import { FulfillmentState, MerchantRejectOrderRequestSchema } from "@startup/contracts";
import { LedgerRepository, OrderRepository, getDb, refunds } from "@startup/database";
import { LedgerEngine } from "@startup/core";
import { apiError, apiSuccess } from "@/server/api-response";
import { getAuthenticatedActor } from "@/server/auth-guard";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  try {
    const actor = await getAuthenticatedActor(req);
    if (!actor || (actor.role !== "MERCHANT_STAFF" && actor.role !== "ADMIN")) {
      return apiError("FORBIDDEN", "Merchant staff or admin access required", 403);
    }

    const { orderId } = await params;
    const body = await req.json();
    const parsed = MerchantRejectOrderRequestSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("VALIDATION_ERROR", "Reason required to reject order", 400, parsed.error.format());
    }

    const order = await OrderRepository.findById(orderId);
    if (!order) {
      return apiError("NOT_FOUND", "Order not found", 404);
    }

    await OrderRepository.updateFulfillmentState({
      orderId,
      fromState: FulfillmentState.AWAITING_MERCHANT,
      toState: FulfillmentState.CANCELLED,
      actorType: "MERCHANT",
      reason: `Rejected by restaurant: ${parsed.data.reason}`,
    });

    // Auto-create refund record and post ledger entries
    const db = getDb();
    const [refund] = await db
      .insert(refunds)
      .values({
        orderId,
        amountPaise: order.breakdown.payablePaise,
        reason: `Merchant rejected order: ${parsed.data.reason}`,
        status: "APPROVED",
      })
      .returning();

    if (refund) {
      const refundEntries = LedgerEngine.buildRefundEntries(
        order.breakdown.payablePaise,
        `Merchant rejected order: ${parsed.data.reason}`
      );
      await LedgerRepository.postTransaction({
        orderId,
        refundId: refund.id,
        effectType: "REFUND",
        entries: refundEntries,
      });
    }

    return apiSuccess({ success: true, fulfillmentState: FulfillmentState.CANCELLED });
  } catch (err: any) {
    return apiError("INTERNAL_ERROR", err.message || "Failed to reject order", 500);
  }
}

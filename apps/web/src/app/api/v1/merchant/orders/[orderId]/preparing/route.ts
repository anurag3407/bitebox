import { NextRequest } from "next/server";
import { FulfillmentState } from "@startup/contracts";
import { OrderRepository } from "@startup/database";
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
    await OrderRepository.updateFulfillmentState({
      orderId,
      fromState: FulfillmentState.ACCEPTED,
      toState: FulfillmentState.PREPARING,
      actorType: "MERCHANT",
      reason: "Kitchen started preparing food",
    });

    return apiSuccess({ success: true, fulfillmentState: FulfillmentState.PREPARING });
  } catch (err: any) {
    return apiError("INTERNAL_ERROR", err.message || "Failed to mark preparing", 500);
  }
}

import { NextRequest } from "next/server";
import { FulfillmentState, MerchantAcceptOrderRequestSchema } from "@startup/contracts";
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
    const body = await req.json();
    const parsed = MerchantAcceptOrderRequestSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("VALIDATION_ERROR", "Invalid preparation estimate", 400, parsed.error.format());
    }

    await OrderRepository.updateFulfillmentState({
      orderId,
      fromState: FulfillmentState.AWAITING_MERCHANT,
      toState: FulfillmentState.ACCEPTED,
      actorType: "MERCHANT",
      reason: `Merchant accepted with estimated prep time ${parsed.data.preparationTimeMinutes}m`,
    });

    return apiSuccess({ success: true, fulfillmentState: FulfillmentState.ACCEPTED });
  } catch (err: any) {
    return apiError("INTERNAL_ERROR", err.message || "Failed to accept order", 500);
  }
}

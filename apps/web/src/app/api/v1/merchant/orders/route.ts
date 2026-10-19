import { NextRequest } from "next/server";
import { FulfillmentState } from "@startup/contracts";
import { OrderRepository, SEED_IDS } from "@startup/database";
import { apiError, apiSuccess } from "@/server/api-response";
import { getAuthenticatedActor } from "@/server/auth-guard";

export async function GET(req: NextRequest) {
  try {
    const actor = await getAuthenticatedActor(req);
    if (!actor || (actor.role !== "MERCHANT_STAFF" && actor.role !== "ADMIN")) {
      return apiError("FORBIDDEN", "Merchant staff or admin access required", 403);
    }

    const { searchParams } = new URL(req.url);
    const restaurantId = searchParams.get("restaurantId") || SEED_IDS.restaurant1Id;

    const orders = await OrderRepository.listByRestaurant(restaurantId);
    // Strip deliveryOtp from merchant view
    const sanitizedOrders = orders.map(({ deliveryOtp, ...o }) => o);
    return apiSuccess(sanitizedOrders);
  } catch (err: any) {
    return apiError("INTERNAL_ERROR", err.message || "Failed to fetch merchant orders", 500);
  }
}

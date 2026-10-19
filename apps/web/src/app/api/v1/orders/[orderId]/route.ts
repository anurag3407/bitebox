import { NextRequest } from "next/server";
import { OrderRepository } from "@startup/database";
import { apiError, apiSuccess } from "@/server/api-response";
import { getAuthenticatedActor, getOrCreateDbUser } from "@/server/auth-guard";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  try {
    const actor = await getAuthenticatedActor(req);
    if (!actor) {
      return apiError("UNAUTHENTICATED", "Authentication required to view order", 401);
    }

    const user = await getOrCreateDbUser(actor);
    const { orderId } = await params;
    const order = await OrderRepository.findById(orderId);
    if (!order) {
      return apiError("NOT_FOUND", "Order not found", 404);
    }

    // Role-based authorization & proof challenge isolation
    if (actor.role === "CUSTOMER") {
      if (order.customerId && order.customerId !== user.id) {
        return apiError("FORBIDDEN", "You do not have permission to view this order", 403);
      }
      // Customer is the owner: can see the order details and their deliveryOtp
      return apiSuccess(order);
    }

    if (actor.role === "ADMIN") {
      return apiSuccess(order);
    }

    // For Merchant Staff or Rider: mask deliveryOtp to preserve proof challenge integrity
    const { deliveryOtp, ...sanitizedOrder } = order;
    return apiSuccess(sanitizedOrder);
  } catch (err: any) {
    return apiError("INTERNAL_ERROR", err.message || "Failed to fetch order", 500);
  }
}

import { NextRequest } from "next/server";
import { UserRole } from "@startup/contracts";
import {
  OrderRepository,
  RiderRepository,
  deliveryAssignments,
  getDb,
  orderEvents,
} from "@startup/database";
import { UpstashRedisAdapter } from "@startup/integrations";
import { desc, eq } from "drizzle-orm";
import { apiError, apiSuccess } from "@/server/api-response";
import { getAuthenticatedActor, getOrCreateDbUser } from "@/server/auth-guard";

export async function GET(
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
    const isStaffOrAdmin =
      actor.role === UserRole.ADMIN ||
      actor.role === UserRole.MERCHANT_STAFF ||
      actor.role === UserRole.RIDER;

    if (!isOwner && !isStaffOrAdmin) {
      return apiError("FORBIDDEN", "Forbidden: You are not authorized to track this order", 403);
    }

    const db = getDb();

    // 1. Fetch active assignment
    const [assignment] = await db
      .select()
      .from(deliveryAssignments)
      .where(eq(deliveryAssignments.orderId, orderId))
      .orderBy(desc(deliveryAssignments.assignedAt))
      .limit(1);

    // 2. Fetch rider details and live location if assigned
    let riderData = null;
    if (assignment) {
      const rider = await RiderRepository.findById(assignment.riderId);
      if (rider) {
        let liveLat = rider.currentLatitude;
        let liveLng = rider.currentLongitude;

        try {
          const upstash = new UpstashRedisAdapter();
          const liveRedisLoc = await upstash.getRiderLocation(rider.id);
          if (liveRedisLoc) {
            liveLat = liveRedisLoc.latitude;
            liveLng = liveRedisLoc.longitude;
          }
        } catch {
          // Redis telemetry read fallback to DB
        }

        riderData = {
          id: rider.id,
          name: rider.name,
          phone: rider.phone,
          vehicleType: rider.vehicleType,
          currentLatitude: liveLat,
          currentLongitude: liveLng,
        };
      }
    }

    // 3. Fetch order audit timeline events
    const timeline = await db
      .select()
      .from(orderEvents)
      .where(eq(orderEvents.orderId, orderId))
      .orderBy(orderEvents.sequence);

    return apiSuccess({
      orderId: order.orderId,
      orderNumber: order.orderNumber,
      fulfillmentState: order.fulfillmentState,
      paymentStatus: order.paymentStatus,
      payablePaise: order.breakdown.payablePaise,
      promisedDeliveryAt: order.promisedDeliveryAt,
      merchantResponseDeadlineAt: order.merchantResponseDeadlineAt,
      deliveryAddress: order.deliveryAddress,
      restaurant: order.restaurant,
      assignment: assignment
        ? {
            id: assignment.id,
            status: assignment.status,
            assignedAt: assignment.assignedAt,
            completedAt: assignment.completedAt,
          }
        : null,
      rider: riderData,
      timeline,
      // OTP is customer-only: never reveal to rider or public
      deliveryOtp: isOwner ? order.deliveryOtp : undefined,
    });
  } catch (err: any) {
    return apiError("INTERNAL_ERROR", err.message || "Failed to fetch order tracking", 500);
  }
}

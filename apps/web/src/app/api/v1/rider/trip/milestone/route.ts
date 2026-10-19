import { NextRequest } from "next/server";
import { DeliveryTripStatus, UserRole } from "@startup/contracts";
import { OrderRepository, RiderRepository, SEED_IDS } from "@startup/database";
import { apiError, apiSuccess } from "@/server/api-response";
import { getAuthenticatedActor, getOrCreateDbUser } from "@/server/auth-guard";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { assignmentId, orderId, nextStatus, challengeCode } = body;

    if (!assignmentId || !orderId || !nextStatus) {
      return apiError("VALIDATION_ERROR", "assignmentId, orderId, and nextStatus are required", 400);
    }

    const actor = await getAuthenticatedActor(req);
    if (!actor) {
      return apiError("UNAUTHORIZED", "Authentication required", 401);
    }
    if (actor.role !== UserRole.RIDER && actor.role !== UserRole.ADMIN) {
      return apiError("FORBIDDEN", "Forbidden: Rider role required", 403);
    }

    const user = await getOrCreateDbUser(actor);
    let rider = await RiderRepository.findByUserId(user.id);
    if (!rider && actor.role === UserRole.ADMIN) {
      rider = await RiderRepository.findById(SEED_IDS.riderId);
    }
    if (!rider) {
      return apiError("NOT_FOUND", "Rider profile not found", 404);
    }
    const riderId = rider.id;

    // Verification challenge OTP checks: mandatory for completing delivery
    const order = await OrderRepository.findById(orderId);
    if (!order) {
      return apiError("NOT_FOUND", "Order not found", 404);
    }

    if (nextStatus === DeliveryTripStatus.COMPLETED) {
      if (!challengeCode || typeof challengeCode !== "string" || challengeCode.trim() === "") {
        return apiError(
          "VALIDATION_ERROR",
          "Customer 6-digit delivery OTP code is required to complete delivery",
          400
        );
      }
      if (order.deliveryOtp && challengeCode.trim() !== order.deliveryOtp) {
        return apiError("VALIDATION_ERROR", "Invalid customer delivery OTP code", 400);
      }
    }

    await RiderRepository.updateMilestone({
      assignmentId,
      orderId,
      riderId,
      nextStatus: nextStatus as DeliveryTripStatus,
    });

    return apiSuccess({ success: true, status: nextStatus });
  } catch (err: any) {
    return apiError("INTERNAL_ERROR", err.message || "Failed to update milestone", 500);
  }
}

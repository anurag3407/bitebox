import { DeliveryTripStatus, RiderMilestoneRequestSchema } from "@startup/contracts";
import { DomainError } from "@startup/core";
import { RiderRepository } from "@startup/database";
import { apiError, apiSuccess } from "@/server/api-response";
import { requireAuth, requireRiderProfile } from "@/server/auth-guard";
import { enforceRateLimit } from "@/server/rate-limit";
import { parseBody, route } from "@/server/route";

export const POST = route(async (req, _ctx, requestId) => {
  const auth = await requireAuth(req);
  const rider = await requireRiderProfile(auth);
  const body = await parseBody(req, RiderMilestoneRequestSchema);
  if (body.nextStatus === DeliveryTripStatus.COMPLETED || body.challengeCode) {
    await enforceRateLimit(req, "otpAttempt", rider.id);
  }
  if (body.nextStatus === DeliveryTripStatus.COMPLETED && !body.challengeCode) {
    throw new DomainError("VALIDATION_ERROR", "Ask the customer for their delivery OTP to complete this order.");
  }

  const result = await RiderRepository.advanceTrip({
    assignmentId: body.assignmentId,
    riderId: rider.id,
    nextStatus: body.nextStatus as DeliveryTripStatus,
    challengeCode: body.challengeCode,
    failureReason: body.failureReason,
  });

  if (!result.ok) {
    return apiError(
      "VALIDATION_ERROR",
      result.attemptsRemaining > 0
        ? `Incorrect OTP. ${result.attemptsRemaining} attempt(s) left.`
        : "Incorrect OTP. This delivery is now locked; contact support.",
      400,
      { attemptsRemaining: result.attemptsRemaining },
      { requestId }
    );
  }
  return apiSuccess({ success: true, status: result.status, fulfillmentState: result.orderState }, 200, { requestId });
});

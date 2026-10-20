import { CallRequestSchema } from "@startup/contracts";
import { DomainError } from "@startup/core";
import { CallLogRepository } from "@startup/database";
import { ExotelAdapter } from "@startup/integrations";
import { apiSuccess } from "@/server/api-response";
import { requireAuth } from "@/server/auth-guard";
import { resolveCallParties } from "@/server/call-policy";
import { resolveOrderViewer } from "@/server/order-access";
import { enforceRateLimit } from "@/server/rate-limit";
import { assertUuid, parseBody, route } from "@/server/route";

/**
 * Connects two parties of an order by phone without revealing numbers: the telephony
 * provider rings the caller, then bridges to the other party from a virtual number.
 * Without a provider configured, the number is revealed only to an authorised participant
 * and the access is logged.
 */
export const POST = route<{ orderId: string }>(async (req, { params }, requestId) => {
  const auth = await requireAuth(req);
  await enforceRateLimit(req, "call", auth.user.id);
  const orderId = assertUuid((await params).orderId, "order");
  const { target } = await parseBody(req, CallRequestSchema);
  const viewer = await resolveOrderViewer(auth, orderId);
  const { fromPhone, toPhone } = await resolveCallParties(auth, viewer, orderId, target);
  if (!toPhone) throw new DomainError("NOT_FOUND", "No phone number is available for this contact.");

  const exotel = new ExotelAdapter();
  if (exotel.isEnabled) {
    if (!fromPhone) throw new DomainError("VALIDATION_ERROR", "Add your mobile number in your profile so we can connect the call.");
    const result = await exotel.connect({ from: fromPhone, to: toPhone });
    await CallLogRepository.log({
      orderId,
      callerUserId: auth.user.id,
      callerRole: viewer,
      target,
      mode: "BRIDGED",
      providerCallId: result.callId,
      status: result.ok ? "INITIATED" : `FAILED: ${result.error}`,
    });
    if (!result.ok) throw new DomainError("INTERNAL_ERROR", "We couldn't place the call right now. Please try again.", { httpStatus: 502 });
    return apiSuccess({ mode: "BRIDGED", message: "You'll receive a call shortly. Answer it to be connected." }, 200, { requestId });
  }

  await CallLogRepository.log({ orderId, callerUserId: auth.user.id, callerRole: viewer, target, mode: "DIRECT", status: "REVEALED" });
  return apiSuccess({ mode: "DIRECT", phone: toPhone }, 200, { requestId });
});

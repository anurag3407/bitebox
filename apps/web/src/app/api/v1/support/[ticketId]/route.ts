import { SupportMessageSchema, UserRole } from "@startup/contracts";
import { DomainError } from "@startup/core";
import { SupportRepository } from "@startup/database";
import { apiSuccess } from "@/server/api-response";
import { requireAuth } from "@/server/auth-guard";
import { enforceRateLimit } from "@/server/rate-limit";
import { assertUuid, parseBody, route } from "@/server/route";

/** Customer view of one conversation (admins use /admin/support/:id). */
export const GET = route<{ ticketId: string }>(async (req, { params }, requestId) => {
  const auth = await requireAuth(req);
  const ticketId = assertUuid((await params).ticketId, "conversation");
  const data = await SupportRepository.getTicket(ticketId);
  if (!data || (data.ticket.customerId !== auth.user.id && auth.role !== UserRole.ADMIN)) {
    throw new DomainError("NOT_FOUND", "Conversation not found");
  }
  return apiSuccess(data, 200, { requestId });
});

export const POST = route<{ ticketId: string }>(async (req, { params }, requestId) => {
  const auth = await requireAuth(req);
  await enforceRateLimit(req, "support", auth.user.id);
  const ticketId = assertUuid((await params).ticketId, "conversation");
  const { body } = await parseBody(req, SupportMessageSchema);
  await SupportRepository.reply({ ticketId, senderType: "CUSTOMER", senderId: auth.user.id, body });
  return apiSuccess({ success: true }, 201, { requestId });
});

import { SupportMessageSchema, UserRole } from "@startup/contracts";
import { DomainError } from "@startup/core";
import { SupportRepository } from "@startup/database";
import { apiSuccess } from "@/server/api-response";
import { requireAuth } from "@/server/auth-guard";
import { assertUuid, parseBody, route } from "@/server/route";

export const GET = route<{ ticketId: string }>(async (req, { params }, requestId) => {
  await requireAuth(req, [UserRole.ADMIN]);
  const data = await SupportRepository.getTicket(assertUuid((await params).ticketId, "conversation"));
  if (!data) throw new DomainError("NOT_FOUND", "Conversation not found");
  return apiSuccess(data, 200, { requestId });
});

export const POST = route<{ ticketId: string }>(async (req, { params }, requestId) => {
  const auth = await requireAuth(req, [UserRole.ADMIN]);
  const ticketId = assertUuid((await params).ticketId, "conversation");
  const { body } = await parseBody(req, SupportMessageSchema);
  await SupportRepository.reply({ ticketId, senderType: "AGENT", senderId: auth.user.id, body });
  return apiSuccess({ success: true }, 201, { requestId });
});

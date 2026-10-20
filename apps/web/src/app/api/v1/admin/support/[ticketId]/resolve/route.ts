import { ResolveTicketSchema, UserRole } from "@startup/contracts";
import { SupportRepository } from "@startup/database";
import { apiSuccess } from "@/server/api-response";
import { requireAuth } from "@/server/auth-guard";
import { assertUuid, parseBody, route } from "@/server/route";

export const POST = route<{ ticketId: string }>(async (req, { params }, requestId) => {
  const auth = await requireAuth(req, [UserRole.ADMIN]);
  const { resolution } = await parseBody(req, ResolveTicketSchema);
  await SupportRepository.resolve(assertUuid((await params).ticketId, "conversation"), auth.user.id, resolution);
  return apiSuccess({ success: true }, 200, { requestId });
});

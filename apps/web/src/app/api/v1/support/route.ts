import { CreateSupportTicketSchema } from "@startup/contracts";
import { SupportRepository } from "@startup/database";
import { apiSuccess } from "@/server/api-response";
import { requireAuth } from "@/server/auth-guard";
import { enforceRateLimit } from "@/server/rate-limit";
import { parseBody, route } from "@/server/route";

export const GET = route(async (req, _ctx, requestId) => {
  const { user } = await requireAuth(req);
  return apiSuccess(await SupportRepository.listForCustomer(user.id), 200, { requestId });
});

export const POST = route(async (req, _ctx, requestId) => {
  const { user } = await requireAuth(req);
  await enforceRateLimit(req, "support", user.id);
  const body = await parseBody(req, CreateSupportTicketSchema);
  const ticketId = await SupportRepository.open(user.id, body);
  return apiSuccess({ ticketId }, 201, { requestId });
});

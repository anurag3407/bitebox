import { SplitBillRepository } from "@startup/database";
import { apiSuccess } from "@/server/api-response";
import { DomainError } from "@startup/core";
import { requireAuth } from "@/server/auth-guard";
import { route } from "@/server/route";

export const GET = route<{ token: string }>(async (_req, { params }, requestId) => {
  const split = await SplitBillRepository.find((await params).token);
  if (!split) throw new DomainError("NOT_FOUND", "This bill split was not found");
  return apiSuccess({ split }, 200, { requestId });
});

export const POST = route<{ token: string }>(async (req, { params }, requestId) => {
  const auth = await requireAuth(req);
  const result = await SplitBillRepository.pay({ token: (await params).token, payerId: auth.user.id });
  return apiSuccess(result, 200, { requestId });
});

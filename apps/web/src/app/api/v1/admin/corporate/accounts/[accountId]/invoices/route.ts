import { z } from "zod";
import { UserRole } from "@startup/contracts";
import { CorporateRepository } from "@startup/database";
import { apiSuccess } from "@/server/api-response";
import { requireAuth } from "@/server/auth-guard";
import { assertUuid, parseBody, route } from "@/server/route";

const GenerateInvoice = z.object({ month: z.string().regex(/^\d{4}-\d{2}$/).optional() });

export const POST = route<{ accountId: string }>(async (req, { params }, requestId) => {
  await requireAuth(req, [UserRole.ADMIN]);
  const accountId = assertUuid((await params).accountId, "corporate account");
  const body = await parseBody(req, GenerateInvoice);
  const invoice = await CorporateRepository.generateMonthlyInvoice({ corporateAccountId: accountId, month: body.month });
  return apiSuccess({ invoice }, 201, { requestId });
});

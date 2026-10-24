import { z } from "zod";
import { UserRole } from "@startup/contracts";
import { CorporateRepository } from "@startup/database";
import { apiSuccess } from "@/server/api-response";
import { requireAuth } from "@/server/auth-guard";
import { assertUuid, parseBody, route } from "@/server/route";

const AddEmployee = z.object({
  userId: z.string().uuid(),
  costCenterCode: z.string().trim().min(1).max(60),
  emailDomain: z.string().trim().min(3).max(120),
});

export const POST = route<{ accountId: string }>(async (req, { params }, requestId) => {
  await requireAuth(req, [UserRole.ADMIN]);
  const accountId = assertUuid((await params).accountId, "corporate account");
  const body = await parseBody(req, AddEmployee);
  const employee = await CorporateRepository.addEmployee({ corporateAccountId: accountId, ...body });
  return apiSuccess({ employee }, 201, { requestId });
});

import { z } from "zod";
import { UserRole } from "@startup/contracts";
import { CorporateRepository } from "@startup/database";
import { apiSuccess } from "@/server/api-response";
import { requireAuth } from "@/server/auth-guard";
import { parseBody, route } from "@/server/route";

const CreateAccount = z.object({
  companyName: z.string().trim().min(2).max(160),
  gstin: z.string().trim().min(15).max(15),
  billingAddress: z.string().trim().min(5).max(500),
  dropPointId: z.string().uuid(),
  dailyAllowancePerEmployeePaise: z.number().int().nonnegative(),
  subsidyPercentageBp: z.number().int().min(0).max(10000).optional(),
  corporateManagementFeeBp: z.number().int().min(0).max(10000).optional(),
  creditLimitPaise: z.number().int().nonnegative().optional(),
});

export const POST = route(async (req, _ctx, requestId) => {
  await requireAuth(req, [UserRole.ADMIN]);
  const body = await parseBody(req, CreateAccount);
  const account = await CorporateRepository.createAccount(body);
  return apiSuccess({ account }, 201, { requestId });
});

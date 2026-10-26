import { z } from "zod";
import { UserRole } from "@startup/contracts";
import { DomainError } from "@startup/core";
import { CorporateRepository } from "@startup/database";
import { apiSuccess } from "@/server/api-response";
import { requireAuth } from "@/server/auth-guard";
import { assertUuid, parseBody, route } from "@/server/route";

const AddEmployee = z
  .object({
    userId: z.string().uuid().optional(),
    email: z.string().email().optional(),
    costCenterCode: z.string().trim().min(1).max(60),
    emailDomain: z.string().trim().min(3).max(120).optional(),
  })
  .refine((body) => Boolean(body.userId || body.email), { message: "Provide a user id or email" });

export const POST = route<{ accountId: string }>(async (req, { params }, requestId) => {
  await requireAuth(req, [UserRole.ADMIN]);
  const accountId = assertUuid((await params).accountId, "corporate account");
  const body = await parseBody(req, AddEmployee);
  let userId: string;
  let emailDomain = body.emailDomain;
  if (body.userId) {
    userId = body.userId;
  } else {
    const user = await CorporateRepository.findUserByEmail(body.email!);
    if (!user) throw new DomainError("NOT_FOUND", "No customer account uses that email");
    userId = user.id as string;
    emailDomain = emailDomain ?? body.email!.split("@")[1];
  }
  if (!emailDomain) throw new DomainError("VALIDATION_ERROR", "Email domain is required");
  const employee = await CorporateRepository.addEmployee({
    corporateAccountId: accountId,
    userId,
    costCenterCode: body.costCenterCode,
    emailDomain,
  });
  return apiSuccess({ employee }, 201, { requestId });
});

import { z } from "zod";
import { CorporateRepository } from "@startup/database";
import { apiSuccess } from "@/server/api-response";
import { requireAuth } from "@/server/auth-guard";
import { parseQuery, route } from "@/server/route";

const Query = z.object({
  accountId: z.string().uuid(),
  orderTotalPaise: z.coerce.number().int().nonnegative(),
  alreadyUsedPaise: z.coerce.number().int().nonnegative().optional(),
});

export const GET = route(async (req, _ctx, requestId) => {
  const auth = await requireAuth(req);
  const query = parseQuery(req, Query);
  const result = await CorporateRepository.splitForUser({
    userId: auth.user.id,
    corporateAccountId: query.accountId,
    orderTotalPaise: query.orderTotalPaise,
    alreadyUsedPaise: query.alreadyUsedPaise,
  });
  return apiSuccess(
    {
      companyName: result.account.company_name,
      costCenterCode: result.account.cost_center_code,
      ...result.split,
    },
    200,
    { requestId }
  );
});

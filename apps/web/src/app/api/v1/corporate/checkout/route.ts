import { z } from "zod";
import { DomainError, isCorporateLunchSlot } from "@startup/core";
import { CorporateRepository } from "@startup/database";
import { apiSuccess } from "@/server/api-response";
import { requireAuth } from "@/server/auth-guard";
import { parseBody, route } from "@/server/route";

const CorporateCheckout = z.object({
  quoteId: z.string().uuid(),
  corporateAccountId: z.string().uuid(),
});

export const POST = route(async (req, _ctx, requestId) => {
  const auth = await requireAuth(req);
  if (!isCorporateLunchSlot(new Date())) {
    throw new DomainError("STATE_CONFLICT", "Corporate allowance is available on weekday lunches (11am–3pm IST).");
  }
  const body = await parseBody(req, CorporateCheckout);
  const result = await CorporateRepository.createCorporateOrder({
    userId: auth.user.id,
    quoteId: body.quoteId,
    corporateAccountId: body.corporateAccountId,
  });
  return apiSuccess(
    {
      orderId: result.order.id,
      orderNumber: result.order.order_number,
      payablePaise: result.split.employeePayablePaise,
      corporateCoveredPaise: result.split.coveredPaise,
      corporateBilledPaise: result.split.corporateBilledPaise,
      managementFeePaise: result.split.managementFeePaise,
      simulatedPayment: true,
    },
    201,
    { requestId }
  );
});

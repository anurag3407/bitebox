import { CorporateRepository } from "@startup/database";
import { apiSuccess } from "@/server/api-response";
import { requireAuth } from "@/server/auth-guard";
import { route } from "@/server/route";

export const GET = route(async (req, _ctx, requestId) => {
  const auth = await requireAuth(req);
  const membership = await CorporateRepository.membershipForUser(auth.user.id);
  if (!membership) {
    return apiSuccess({ member: false }, 200, { requestId });
  }
  const a = membership.account;
  return apiSuccess(
    {
      member: true,
      accountId: a.id,
      companyName: a.company_name,
      costCenterCode: a.cost_center_code,
      emailDomain: a.email_domain,
      dropPointName: a.drop_point_name,
      dailyAllowancePaise: a.daily_allowance_per_employee_paise,
      subsidyPercentageBp: a.subsidy_percentage_bp,
      managementFeeBp: a.corporate_management_fee_bp,
      creditLimitPaise: a.credit_limit_paise,
      unbilledBalancePaise: a.unbilled_balance_paise,
      usedTodayPaise: membership.usedTodayPaise,
      ordersToday: membership.ordersToday,
      remainingAllowancePaise: membership.remainingAllowancePaise,
    },
    200,
    { requestId }
  );
});

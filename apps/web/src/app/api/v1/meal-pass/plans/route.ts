import { z } from "zod";
import { UserRole } from "@startup/contracts";
import { MealPassRepository } from "@startup/database";
import { apiSuccess } from "@/server/api-response";
import { StaffPermission, requireAuth, requireRestaurantAccess } from "@/server/auth-guard";
import { parseBody, parseQuery, route } from "@/server/route";

const Query = z.object({ clusterId: z.string().uuid().optional() });
const CreatePlan = z.object({
  kitchenRestaurantId: z.string().uuid(),
  clusterId: z.string().uuid().optional(),
  name: z.string().trim().min(3).max(120),
  skuType: z.enum(["STANDARD_LUNCH", "STANDARD_DINNER"]),
  totalMeals: z.number().int().min(1).max(60),
  pricePaise: z.number().int().positive(),
  validityDays: z.number().int().min(1).max(90),
  kitchenContractPayoutPaise: z.number().int().nonnegative(),
  lateSkipFeePaise: z.number().int().nonnegative().optional(),
  autoScheduleDays: z.array(z.number().int().min(1).max(7)).min(1).max(7).optional(),
  slotWindow: z.string().regex(/^\d{2}:\d{2}-\d{2}:\d{2}$/).optional(),
});

export const GET = route(async (req, _ctx, requestId) => {
  const { clusterId } = parseQuery(req, Query);
  const plans = await MealPassRepository.listPlans(clusterId);
  return apiSuccess({ plans }, 200, { requestId });
});

export const POST = route(async (req, _ctx, requestId) => {
  const auth = await requireAuth(req, [UserRole.MERCHANT_STAFF, UserRole.ADMIN]);
  const body = await parseBody(req, CreatePlan);
  if (auth.role === UserRole.MERCHANT_STAFF) {
    await requireRestaurantAccess(auth, body.kitchenRestaurantId, StaffPermission.MANAGE_OUTLET);
  }
  const plan = await MealPassRepository.createPlan(body);
  return apiSuccess({ plan }, 201, { requestId });
});

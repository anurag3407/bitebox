import { z } from "zod";
import { AuditRepository, SponsorshipRepository } from "@startup/database";
import { apiSuccess } from "@/server/api-response";
import { StaffPermission } from "@/server/auth-guard";
import { authorizeRestaurant } from "@/server/merchant-catalog";
import { parseBody, route } from "@/server/route";

const Purchase = z.object({ days: z.union([z.literal(3), z.literal(7), z.literal(14)]) });

const UpdateCampaign = z.object({
  maxDailyBudgetPaise: z.number().int().min(1000).max(500000).optional(),
  bidPerClickPaise: z.number().int().min(100).max(5000).optional(),
});

export const GET = route<{ restaurantId: string }>(async (req, { params }, requestId) => {
  const { restaurantId } = await authorizeRestaurant(req, params, StaffPermission.MANAGE_OUTLET);
  const state = await SponsorshipRepository.state(restaurantId);
  return apiSuccess(state, 200, { requestId });
});

export const POST = route<{ restaurantId: string }>(async (req, { params }, requestId) => {
  const { auth, restaurantId } = await authorizeRestaurant(req, params, StaffPermission.MANAGE_OUTLET);
  const body = await parseBody(req, Purchase);
  const sponsorship = await SponsorshipRepository.purchase({
    restaurantId,
    userId: auth.user.id,
    days: body.days,
  });
  await AuditRepository.log({
    adminUserId: auth.user.id,
    action: "SPONSORSHIP_PURCHASED",
    targetType: "restaurant",
    targetId: restaurantId,
    details: { days: body.days, amountPaise: sponsorship.amountPaise },
  });
  return apiSuccess({ sponsorship }, 201, { requestId });
});

export const PATCH = route<{ restaurantId: string }>(async (req, { params }, requestId) => {
  const { restaurantId } = await authorizeRestaurant(req, params, StaffPermission.MANAGE_OUTLET);
  const body = await parseBody(req, UpdateCampaign);
  await SponsorshipRepository.updateCampaign(restaurantId, body);
  const state = await SponsorshipRepository.state(restaurantId);
  return apiSuccess({ state }, 200, { requestId });
});

import { z } from "zod";
import { UserRole } from "@startup/contracts";
import { SurplusRepository } from "@startup/database";
import { apiSuccess } from "@/server/api-response";
import { requireAuth, requireRestaurantAccess } from "@/server/auth-guard";
import { parseBody, parseQuery, route } from "@/server/route";

const Query = z.object({ clusterId: z.string().uuid().optional() });
const CreateListing = z.object({
  restaurantId: z.string().uuid(),
  clusterId: z.string().uuid().optional(),
  title: z.string().trim().min(3).max(120),
  originalValuePaise: z.number().int().positive(),
  discountBp: z.number().int().min(0).max(9000).optional(),
  platformFlatFeePaise: z.number().int().nonnegative(),
  quantity: z.number().int().positive(),
  pickupWindowStart: z.string().datetime(),
  pickupWindowEnd: z.string().datetime(),
  allowGateBatchDrop: z.boolean().optional(),
});

export const GET = route(async (req, _ctx, requestId) => {
  const { clusterId } = parseQuery(req, Query);
  const listings = await SurplusRepository.listActive(clusterId);
  return apiSuccess({ listings }, 200, { requestId });
});

export const POST = route(async (req, _ctx, requestId) => {
  const auth = await requireAuth(req, [UserRole.MERCHANT_STAFF, UserRole.ADMIN]);
  const body = await parseBody(req, CreateListing);
  if (auth.role === UserRole.MERCHANT_STAFF) {
    await requireRestaurantAccess(auth, body.restaurantId, ["OWNER", "MANAGER"]);
  }
  const result = await SurplusRepository.createListing({
    ...body,
    pickupWindowStart: new Date(body.pickupWindowStart),
    pickupWindowEnd: new Date(body.pickupWindowEnd),
  });
  return apiSuccess(result, 201, { requestId });
});

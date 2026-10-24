import { z } from "zod";
import { SurplusRepository } from "@startup/database";
import { apiSuccess } from "@/server/api-response";
import { StaffPermission } from "@/server/auth-guard";
import { authorizeRestaurant } from "@/server/merchant-catalog";
import { parseBody, route } from "@/server/route";

const IssuePackaging = z.object({
  clusterId: z.string().uuid().optional(),
  quantity: z.number().int().positive(),
  unitCostPaise: z.number().int().nonnegative(),
});

export const POST = route<{ restaurantId: string }>(async (req, { params }, requestId) => {
  const { restaurantId } = await authorizeRestaurant(req, params, StaffPermission.MANAGE_OUTLET);
  const body = await parseBody(req, IssuePackaging);
  const issuance = await SurplusRepository.recordPackagingIssuance({ restaurantId, ...body });
  return apiSuccess({ issuance }, 201, { requestId });
});

import { z } from "zod";
import { MerchantAnalyticsRepository } from "@startup/database";
import { DomainError } from "@startup/core";
import { apiSuccess } from "@/server/api-response";
import { StaffPermission } from "@/server/auth-guard";
import { authorizeRestaurant } from "@/server/merchant-catalog";
import { parseQuery, route } from "@/server/route";

const Query = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
});

export const GET = route<{ restaurantId: string }>(async (req, { params }, requestId) => {
  const { restaurantId } = await authorizeRestaurant(req, params, StaffPermission.OWNER_ONLY);
  const query = parseQuery(req, Query);
  const end = query.to ? new Date(query.to) : new Date();
  const start = query.from ? new Date(query.from) : new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start >= end) {
    throw new DomainError("VALIDATION_ERROR", "Provide a valid from/to date range.");
  }
  const report = await MerchantAnalyticsRepository.savingsReport({ restaurantId, startDate: start, endDate: end });
  return apiSuccess({ restaurantId, ...report }, 200, { requestId });
});

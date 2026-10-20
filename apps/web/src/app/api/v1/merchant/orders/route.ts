import { z } from "zod";
import { FulfillmentState, UserRole } from "@startup/contracts";
import { DomainError } from "@startup/core";
import { OrderRepository, RestaurantRepository } from "@startup/database";
import { apiSuccess } from "@/server/api-response";
import { requireAuth, requireRestaurantAccess } from "@/server/auth-guard";
import { shapeOrderForViewer } from "@/server/order-access";
import { parseQuery, route } from "@/server/route";

const QuerySchema = z.object({
  restaurantId: z.string().uuid().optional(),
  scope: z.enum(["active", "all"]).default("active"),
});

const ACTIVE_STATES = [
  FulfillmentState.AWAITING_MERCHANT,
  FulfillmentState.ACCEPTED,
  FulfillmentState.PREPARING,
  FulfillmentState.READY_FOR_PICKUP,
];

export const GET = route(async (req, _ctx, requestId) => {
  const auth = await requireAuth(req, [UserRole.MERCHANT_STAFF, UserRole.ADMIN]);
  const query = parseQuery(req, QuerySchema);

  let restaurantId = query.restaurantId;
  if (!restaurantId) {
    // Default to the staff member's first outlet
    const memberships = await RestaurantRepository.listForMerchantUser(auth.user.id);
    restaurantId = memberships[0]?.id;
    if (!restaurantId) throw new DomainError("NOT_FOUND", "No restaurant is linked to your account");
  }
  await requireRestaurantAccess(auth, restaurantId);

  const orders = await OrderRepository.listByRestaurant(
    restaurantId,
    query.scope === "active" ? ACTIVE_STATES : undefined,
    { sinceHours: query.scope === "active" ? 12 : 48 }
  );
  return apiSuccess(
    orders.map((o) => shapeOrderForViewer(o, "MERCHANT")),
    200,
    { requestId }
  );
});

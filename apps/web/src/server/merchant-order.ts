import { NextRequest } from "next/server";
import { UserRole } from "@startup/contracts";
import { DomainError } from "@startup/core";
import { OrderRepository } from "@startup/database";
import { AuthContext, requireAuth, requireRestaurantAccess } from "./auth-guard";
import { enforceRateLimit } from "./rate-limit";
import { assertUuid } from "./route";

/** Authenticates a merchant action on an order of a restaurant the caller staffs. */
export async function authorizeMerchantOrderAction(
  req: NextRequest,
  params: Promise<{ orderId: string }>
): Promise<{ auth: AuthContext; orderId: string }> {
  const auth = await requireAuth(req, [UserRole.MERCHANT_STAFF, UserRole.ADMIN]);
  await enforceRateLimit(req, "mutation", auth.user.id);
  const orderId = assertUuid((await params).orderId, "order");
  const access = await OrderRepository.findAccessContext(orderId);
  if (!access) throw new DomainError("NOT_FOUND", "Order not found");
  await requireRestaurantAccess(auth, access.restaurantId);
  return { auth, orderId };
}

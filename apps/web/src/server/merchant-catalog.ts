import { NextRequest } from "next/server";
import { UserRole } from "@startup/contracts";
import { DomainError } from "@startup/core";
import { getDbPool } from "@startup/database";
import { AuthContext, requireAuth, requireRestaurantAccess } from "./auth-guard";
import { CacheKeys, invalidate } from "./cache";
import { assertUuid } from "./route";

export async function authorizeRestaurant(
  req: NextRequest,
  params: Promise<{ restaurantId: string }>,
  staffRoles: readonly string[]
): Promise<{ auth: AuthContext; restaurantId: string }> {
  const auth = await requireAuth(req, [UserRole.MERCHANT_STAFF, UserRole.ADMIN]);
  const restaurantId = assertUuid((await params).restaurantId, "restaurant");
  await requireRestaurantAccess(auth, restaurantId, staffRoles);
  return { auth, restaurantId };
}

/** Payouts are per legal entity (merchant), which can own several outlets. */
export async function merchantIdOf(restaurantId: string): Promise<string> {
  const res = await getDbPool().query(`SELECT merchant_id FROM restaurants WHERE id = $1`, [restaurantId]);
  if (!res.rows[0]) throw new DomainError("NOT_FOUND", "Restaurant not found");
  return res.rows[0].merchant_id;
}

export async function refreshPublicMenu(slug: string): Promise<void> {
  await invalidate(CacheKeys.menu(slug));
}

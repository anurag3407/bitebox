import { UpdateProfileRequestSchema, UserRole } from "@startup/contracts";
import { DomainError } from "@startup/core";
import { RestaurantRepository, RiderRepository, appUsers, getDb } from "@startup/database";
import { eq } from "drizzle-orm";
import { apiSuccess } from "@/server/api-response";
import { requireAuth } from "@/server/auth-guard";
import { parseBody, route } from "@/server/route";

export const GET = route(async (req, _ctx, requestId) => {
  const { user, role } = await requireAuth(req);

  let riderInfo = null;
  if (role === UserRole.RIDER) {
    const rider = await RiderRepository.findByUserId(user.id);
    if (rider) {
      riderInfo = {
        id: rider.id,
        isOnline: rider.isOnline,
        isApproved: rider.isApproved,
        vehicleType: rider.vehicleType,
      };
    }
  }
  const restaurants = role === UserRole.MERCHANT_STAFF ? await RestaurantRepository.listForMerchantUser(user.id) : [];

  return apiSuccess(
    {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role,
      rider: riderInfo,
      restaurants,
    },
    200,
    { requestId }
  );
});

export const PATCH = route(async (req, _ctx, requestId) => {
  const { user } = await requireAuth(req);
  const body = await parseBody(req, UpdateProfileRequestSchema);

  const updates: { name?: string; phone?: string; updatedAt: Date } = { updatedAt: new Date() };
  if (body.name !== undefined) updates.name = body.name;
  if (body.phone !== undefined) updates.phone = body.phone;

  const [updated] = await getDb().update(appUsers).set(updates).where(eq(appUsers.id, user.id)).returning();
  if (!updated) throw new DomainError("NOT_FOUND", "User not found");

  return apiSuccess(
    { id: updated.id, name: updated.name, email: updated.email, phone: updated.phone, role: updated.role },
    200,
    { requestId }
  );
});

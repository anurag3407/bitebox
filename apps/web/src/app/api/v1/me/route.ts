import { UpdateProfileRequestSchema, UserRole, z } from "@startup/contracts";
import { DomainError } from "@startup/core";
import { PrivacyRepository, RestaurantRepository, RiderRepository, appUsers, getDb } from "@startup/database";
import { getServerEnv, isMockSecret } from "@startup/config";
import { logger } from "@/server/logger";
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

/**
 * Account deletion (DPDP right to erasure). Personal data is scrubbed; order and invoice
 * records are retained in anonymised form as required by tax law.
 */
export const DELETE = route(async (req, _ctx, requestId) => {
  const { user } = await requireAuth(req);
  await parseBody(req, z.object({ confirm: z.literal("DELETE") }));
  const { clerkUserId } = await PrivacyRepository.deleteAccount(user.id);

  // Best effort: remove the identity at Clerk too so the person cannot sign back into this record
  const secret = getServerEnv().CLERK_SECRET_KEY;
  if (!isMockSecret(secret) && !clerkUserId.startsWith("user_clerk_")) {
    await fetch(`https://api.clerk.com/v1/users/${encodeURIComponent(clerkUserId)}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(5000),
    }).catch((err) => logger.warn("clerk user deletion failed", { requestId, error: (err as Error).message }));
  }
  return apiSuccess({ deleted: true }, 200, { requestId });
});

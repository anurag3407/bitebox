import { NextRequest } from "next/server";
import { UpdateProfileRequestSchema, UserRole } from "@startup/contracts";
import { RiderRepository, appUsers, getDb } from "@startup/database";
import { eq } from "drizzle-orm";
import { apiError, apiSuccess } from "@/server/api-response";
import { getAuthenticatedActor, getOrCreateDbUser } from "@/server/auth-guard";

export async function GET(req: NextRequest) {
  try {
    const actor = await getAuthenticatedActor(req);
    if (!actor) {
      return apiError("UNAUTHORIZED", "Authentication required", 401);
    }

    const user = await getOrCreateDbUser(actor);

    let riderInfo = null;
    if (user.role === UserRole.RIDER || user.role === UserRole.ADMIN) {
      const rider = await RiderRepository.findByUserId(user.id);
      if (rider) {
        riderInfo = {
          id: rider.id,
          isOnline: rider.isOnline,
          vehicleType: rider.vehicleType,
          currentLatitude: rider.currentLatitude,
          currentLongitude: rider.currentLongitude,
        };
      }
    }

    return apiSuccess({
      id: user.id,
      clerkUserId: user.clerkUserId,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      rider: riderInfo,
    });
  } catch (err: any) {
    return apiError("INTERNAL_ERROR", err.message || "Failed to fetch user profile", 500);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const actor = await getAuthenticatedActor(req);
    if (!actor) {
      return apiError("UNAUTHORIZED", "Authentication required", 401);
    }

    const body = await req.json();
    const parsed = UpdateProfileRequestSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("VALIDATION_ERROR", "Invalid profile update parameters", 400, parsed.error.format());
    }

    const user = await getOrCreateDbUser(actor);
    const updates: { name?: string; phone?: string; updatedAt: Date } = {
      updatedAt: new Date(),
    };
    if (parsed.data.name !== undefined) updates.name = parsed.data.name;
    if (parsed.data.phone !== undefined) updates.phone = parsed.data.phone;

    const db = getDb();
    const [updated] = await db
      .update(appUsers)
      .set(updates)
      .where(eq(appUsers.id, user.id))
      .returning();

    if (!updated) {
      return apiError("NOT_FOUND", "User not found", 404);
    }

    return apiSuccess({
      id: updated.id,
      clerkUserId: updated.clerkUserId,
      name: updated.name,
      email: updated.email,
      phone: updated.phone,
      role: updated.role,
    });
  } catch (err: any) {
    return apiError("INTERNAL_ERROR", err.message || "Failed to update profile", 500);
  }
}

import { NextRequest } from "next/server";
import { RiderLocationPingSchema, UserRole } from "@startup/contracts";
import { RiderRepository, SEED_IDS } from "@startup/database";
import { UpstashRedisAdapter } from "@startup/integrations";
import { apiError, apiSuccess } from "@/server/api-response";
import { getAuthenticatedActor, getOrCreateDbUser } from "@/server/auth-guard";

export async function POST(req: NextRequest) {
  try {
    const actor = await getAuthenticatedActor(req);
    if (!actor) {
      return apiError("UNAUTHORIZED", "Authentication required", 401);
    }
    if (actor.role !== UserRole.RIDER && actor.role !== UserRole.ADMIN) {
      return apiError("FORBIDDEN", "Forbidden: Rider role required", 403);
    }

    const body = await req.json();
    const parsed = RiderLocationPingSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("VALIDATION_ERROR", "Invalid GPS coordinates", 400, parsed.error.format());
    }

    const user = await getOrCreateDbUser(actor);
    let rider = await RiderRepository.findByUserId(user.id);
    if (!rider && actor.role === UserRole.ADMIN) {
      rider = await RiderRepository.findById(SEED_IDS.riderId);
    }
    if (!rider) {
      return apiError("NOT_FOUND", "Rider profile not found for authenticated user", 404);
    }

    const { latitude, longitude } = parsed.data;
    const riderId = rider.id;

    // 1. Update hot telemetry in Redis
    const upstash = new UpstashRedisAdapter();
    await upstash.updateRiderLocation(riderId, { latitude, longitude });

    // 2. Persist in database
    await RiderRepository.updateLocation(riderId, latitude, longitude);

    return apiSuccess({ success: true, riderId, latitude, longitude });
  } catch (err: any) {
    return apiError("INTERNAL_ERROR", err.message || "Failed to update rider location", 500);
  }
}

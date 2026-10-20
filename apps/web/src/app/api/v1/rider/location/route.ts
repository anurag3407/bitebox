import { RiderLocationPingSchema } from "@startup/contracts";
import { DomainError } from "@startup/core";
import { RiderRepository } from "@startup/database";
import { getRedis } from "@startup/integrations";
import { apiSuccess } from "@/server/api-response";
import { requireAuth, requireRiderProfile } from "@/server/auth-guard";
import { enforceRateLimit } from "@/server/rate-limit";
import { parseBody, route } from "@/server/route";

// Pings older than this (queued while offline) are not "current" positions
const MAX_PING_AGE_MS = 2 * 60 * 1000;
// GPS fixes worse than this are ignored for dispatch and tracking
const MAX_ACCURACY_METERS = 500;

export const POST = route(async (req, _ctx, requestId) => {
  const auth = await requireAuth(req);
  const rider = await requireRiderProfile(auth);
  await enforceRateLimit(req, "riderLocation", rider.id);
  const ping = await parseBody(req, RiderLocationPingSchema);

  const capturedAt = new Date(ping.capturedAt).getTime();
  if (Number.isNaN(capturedAt)) throw new DomainError("VALIDATION_ERROR", "capturedAt must be an ISO timestamp");
  const ageMs = Date.now() - capturedAt;
  if (ageMs > MAX_PING_AGE_MS || ageMs < -30_000) {
    return apiSuccess({ accepted: false, reason: "STALE_OR_FUTURE_PING" }, 200, { requestId });
  }
  if (ping.accuracyMeters !== undefined && ping.accuracyMeters > MAX_ACCURACY_METERS) {
    return apiSuccess({ accepted: false, reason: "LOW_ACCURACY" }, 200, { requestId });
  }

  // Hot path: Redis holds the live stream for tracking; Postgres gets a throttled copy for dispatch
  await getRedis().updateRiderLocation(rider.id, {
    latitude: ping.latitude,
    longitude: ping.longitude,
    headingDegrees: ping.headingDegrees,
    speedMps: ping.speedMps,
    accuracyMeters: ping.accuracyMeters,
    updatedAt: new Date(capturedAt).toISOString(),
  });
  await RiderRepository.updateLocation(rider.id, ping.latitude, ping.longitude, ping.headingDegrees);

  return apiSuccess({ accepted: true }, 200, { requestId });
});

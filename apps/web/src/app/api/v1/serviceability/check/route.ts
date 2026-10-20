import { ServiceabilityCheckRequestSchema } from "@startup/contracts";
import { DomainError, PricingCalculator, ServiceabilityPolicy } from "@startup/core";
import { RestaurantRepository, estimateDeliveryWindow, getDb, serviceZones } from "@startup/database";
import { eq } from "drizzle-orm";
import { apiSuccess } from "@/server/api-response";
import { enforceRateLimit } from "@/server/rate-limit";
import { parseBody, route } from "@/server/route";

export const POST = route(async (req, _ctx, requestId) => {
  await enforceRateLimit(req, "discovery");
  const { latitude, longitude, restaurantId } = await parseBody(req, ServiceabilityCheckRequestSchema);
  const customerLocation = { latitude, longitude };

  const zones = await getDb().select().from(serviceZones).where(eq(serviceZones.isActive, true));
  const zone = zones.find((z) =>
    ServiceabilityPolicy.isPointInPolygon(customerLocation, (z.polygonGeojson as Array<{ latitude: number; longitude: number }>) ?? [])
  );

  if (!restaurantId) {
    return apiSuccess(
      zone
        ? { isServiceable: true, zoneId: zone.id, zoneName: zone.name }
        : { isServiceable: false, reason: "We don't deliver to this location yet." },
      200,
      { requestId }
    );
  }

  const restaurant = await RestaurantRepository.findById(restaurantId);
  if (!restaurant || !restaurant.isActive) throw new DomainError("NOT_FOUND", "Restaurant not found");

  const check = ServiceabilityPolicy.isRestaurantServiceable(
    { latitude: restaurant.latitude, longitude: restaurant.longitude },
    customerLocation,
    restaurant.maxDeliveryRadiusMeters
  );
  const isServiceable = !!zone && check.isServiceable;
  const window = estimateDeliveryWindow(restaurant.avgPrepMinutes, check.distanceMeters);

  return apiSuccess(
    {
      isServiceable,
      zoneId: zone?.id,
      zoneName: zone?.name,
      estimatedDeliveryMinutes: isServiceable ? window.max : undefined,
      deliveryFeePaise: isServiceable ? PricingCalculator.calculateDeliveryFee(check.distanceMeters * 1.3) : undefined,
      reason: !zone ? "We don't deliver to this location yet." : isServiceable ? undefined : "This restaurant does not deliver to your location.",
    },
    200,
    { requestId }
  );
});

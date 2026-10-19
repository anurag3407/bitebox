import { NextRequest } from "next/server";
import { ServiceabilityCheckRequestSchema } from "@startup/contracts";
import { ServiceabilityPolicy } from "@startup/core";
import { RestaurantRepository, getDb, serviceZones } from "@startup/database";
import { eq } from "drizzle-orm";
import { apiError, apiSuccess } from "@/server/api-response";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = ServiceabilityCheckRequestSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("VALIDATION_ERROR", "Invalid coordinates", 400, parsed.error.format());
    }

    const { latitude, longitude, restaurantId } = parsed.data;
    const customerLocation = { latitude, longitude };

    if (restaurantId) {
      const restaurant = await RestaurantRepository.findById(restaurantId);
      if (!restaurant) {
        return apiError("NOT_FOUND", "Restaurant not found", 404);
      }

      const resLoc = { latitude: restaurant.latitude, longitude: restaurant.longitude };
      const check = ServiceabilityPolicy.isRestaurantServiceable(resLoc, customerLocation);

      return apiSuccess({
        isServiceable: check.isServiceable,
        estimatedDeliveryMinutes: Math.round((check.distanceMeters / 1000) * 3) + 20,
        deliveryFeePaise: 3000 + Math.max(0, Math.ceil((check.distanceMeters - 3000) / 1000) * 1000),
        reason: check.reason,
      });
    }

    // General area serviceability: check if inside any active service zone polygon
    const db = getDb();
    const zones = await db.select().from(serviceZones).where(eq(serviceZones.isActive, true));

    for (const zone of zones) {
      const polygon = zone.polygonGeojson as any[];
      if (Array.isArray(polygon) && ServiceabilityPolicy.isPointInPolygon(customerLocation, polygon)) {
        return apiSuccess({
          isServiceable: true,
          zoneId: zone.id,
          zoneName: zone.name,
          estimatedDeliveryMinutes: 30,
          deliveryFeePaise: 3000,
        });
      }
    }

    return apiSuccess({
      isServiceable: false,
      reason: "Coordinates are outside active service zones",
    });
  } catch (err: any) {
    return apiError("INTERNAL_ERROR", err.message || "Failed to check serviceability", 500);
  }
}

import { Coordinate } from "@startup/contracts";

export interface ServiceZonePolygon {
  id: string;
  name: string;
  coordinates: Coordinate[]; // Ordered ring of polygon points
}

export class ServiceabilityPolicy {
  static readonly EARTH_RADIUS_METERS = 6371000;
  static readonly MAX_RESTAURANT_DELIVERY_RADIUS_METERS = 12000; // 12km max delivery radius

  /**
   * Calculates Haversine distance in meters between two coordinates on Earth.
   */
  static calculateDistanceMeters(pointA: Coordinate, pointB: Coordinate): number {
    const lat1Rad = (pointA.latitude * Math.PI) / 180;
    const lat2Rad = (pointB.latitude * Math.PI) / 180;
    const deltaLatRad = ((pointB.latitude - pointA.latitude) * Math.PI) / 180;
    const deltaLonRad = ((pointB.longitude - pointA.longitude) * Math.PI) / 180;

    const a =
      Math.sin(deltaLatRad / 2) * Math.sin(deltaLatRad / 2) +
      Math.cos(lat1Rad) * Math.cos(lat2Rad) * Math.sin(deltaLonRad / 2) * Math.sin(deltaLonRad / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Math.round(ServiceabilityPolicy.EARTH_RADIUS_METERS * c);
  }

  /**
   * Checks if a coordinate is within a polygon using the standard ray-casting algorithm.
   */
  static isPointInPolygon(point: Coordinate, polygon: Coordinate[]): boolean {
    if (polygon.length < 3) return false;

    let isInside = false;
    const { latitude: x, longitude: y } = point;

    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i]!.latitude;
      const yi = polygon[i]!.longitude;
      const xj = polygon[j]!.latitude;
      const yj = polygon[j]!.longitude;

      const intersect =
        yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;

      if (intersect) {
        isInside = !isInside;
      }
    }

    return isInside;
  }

  /**
   * Checks if an address point is serviceable by a restaurant.
   */
  static isRestaurantServiceable(
    restaurantLocation: Coordinate,
    deliveryLocation: Coordinate,
    maxRadiusMeters: number = ServiceabilityPolicy.MAX_RESTAURANT_DELIVERY_RADIUS_METERS
  ): { isServiceable: boolean; distanceMeters: number; reason?: string } {
    const distanceMeters = ServiceabilityPolicy.calculateDistanceMeters(
      restaurantLocation,
      deliveryLocation
    );

    if (distanceMeters > maxRadiusMeters) {
      return {
        isServiceable: false,
        distanceMeters,
        reason: `Delivery location is ${Math.round(distanceMeters / 1000)}km away, which exceeds the ${Math.round(maxRadiusMeters / 1000)}km limit for this outlet.`,
      };
    }

    return {
      isServiceable: true,
      distanceMeters,
    };
  }
}

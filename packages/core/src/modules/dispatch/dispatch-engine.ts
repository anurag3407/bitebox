import { Coordinate } from "@startup/contracts";
import { ServiceabilityPolicy } from "../serviceability/serviceability-policy.js";

export interface RiderCandidate {
  riderId: string;
  name: string;
  isApproved: boolean;
  isOnline: boolean;
  hasActiveTrip: boolean;
  currentLocation: Coordinate;
  lastPingTimeMs: number;
}

export interface DispatchScoredCandidate {
  riderId: string;
  distanceToPickupMeters: number;
  estimatedTravelTimeMinutes: number;
  score: number;
}

export class DispatchEngine {
  static readonly MAX_PICKUP_DISTANCE_METERS = 7000; // 7km max to restaurant
  static readonly MAX_STALE_PING_AGE_MS = 2 * 60 * 1000; // 2 minutes
  static readonly OFFER_EXPIRATION_SECONDS = 15; // 15s offer timeout
  static readonly AVERAGE_CITY_SPEED_KMH = 20; // 20 km/h average rider speed in city traffic

  /**
   * Filters and ranks available riders for an order pickup.
   */
  static rankCandidates(
    candidates: RiderCandidate[],
    pickupLocation: Coordinate,
    currentTimeMs: number = Date.now()
  ): DispatchScoredCandidate[] {
    const scored: DispatchScoredCandidate[] = [];

    for (const rider of candidates) {
      // 1. Eligibility checks
      if (!rider.isApproved || !rider.isOnline || rider.hasActiveTrip) {
        continue;
      }

      // 2. Freshness check
      const pingAge = currentTimeMs - rider.lastPingTimeMs;
      if (pingAge > DispatchEngine.MAX_STALE_PING_AGE_MS) {
        continue;
      }

      // 3. Distance check
      const distanceMeters = ServiceabilityPolicy.calculateDistanceMeters(
        rider.currentLocation,
        pickupLocation
      );
      if (distanceMeters > DispatchEngine.MAX_PICKUP_DISTANCE_METERS) {
        continue;
      }

      // 4. Scoring calculation (travel time in minutes)
      // distance in km / 20 km/h * 60 min
      const distanceKm = distanceMeters / 1000;
      const travelTimeMinutes = Math.max(1, Math.round((distanceKm / DispatchEngine.AVERAGE_CITY_SPEED_KMH) * 60));

      // Score = travel time in minutes (lowest is best)
      const score = travelTimeMinutes;

      scored.push({
        riderId: rider.riderId,
        distanceToPickupMeters: distanceMeters,
        estimatedTravelTimeMinutes: travelTimeMinutes,
        score,
      });
    }

    // Sort ascending by score (lowest travel time first)
    return scored.sort((a, b) => a.score - b.score);
  }
}

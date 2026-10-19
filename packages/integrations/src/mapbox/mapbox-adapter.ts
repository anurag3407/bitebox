import { Coordinate } from "@startup/contracts";
import { ServiceabilityPolicy } from "@startup/core";
import { getServerEnv } from "@startup/config";

export interface RouteMatrixResult {
  distanceMeters: number;
  durationSeconds: number;
}

export class MapboxAdapter {
  private token: string;

  constructor(token?: string) {
    this.token = token || getServerEnv().MAPBOX_SERVER_TOKEN;
  }

  /**
   * Calculates route distance and driving duration between two points.
   * Uses haversine math with city road tortuosity factor (1.3x) if token is mock.
   */
  async calculateRoute(origin: Coordinate, destination: Coordinate): Promise<RouteMatrixResult> {
    const isMock = !this.token || this.token.startsWith("mock") || this.token.startsWith("pk.mock");

    if (isMock) {
      const crowFliesMeters = ServiceabilityPolicy.calculateDistanceMeters(origin, destination);
      const roadDistanceMeters = Math.round(crowFliesMeters * 1.3); // 1.3x road circuity
      // Average 20 km/h = ~5.55 m/s
      const durationSeconds = Math.max(60, Math.round(roadDistanceMeters / 5.55));

      return {
        distanceMeters: roadDistanceMeters,
        durationSeconds,
      };
    }

    try {
      const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${origin.longitude},${origin.latitude};${destination.longitude},${destination.latitude}?access_token=${this.token}`;
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`Mapbox API error: ${res.statusText}`);
      }
      const data = await res.json();
      const route = data.routes?.[0];
      return {
        distanceMeters: Math.round(route.distance),
        durationSeconds: Math.round(route.duration),
      };
    } catch {
      // Conservative fallback
      const crowFliesMeters = ServiceabilityPolicy.calculateDistanceMeters(origin, destination);
      return {
        distanceMeters: Math.round(crowFliesMeters * 1.3),
        durationSeconds: Math.max(60, Math.round((crowFliesMeters * 1.3) / 5.55)),
      };
    }
  }
}

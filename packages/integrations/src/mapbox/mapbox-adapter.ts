import { Coordinate } from "@startup/contracts";
import { ServiceabilityPolicy } from "@startup/core";
import { getServerEnv, isMockSecret } from "@startup/config";
import { fetchWithTimeout } from "../shared/http.js";

export interface RouteMatrixResult {
  distanceMeters: number;
  durationSeconds: number;
  // false when the value is a straight-line estimate (no token / provider down)
  isRoadRoute: boolean;
}

export interface GeocodeResult {
  label: string;
  latitude: number;
  longitude: number;
}

// Haversine x road circuity at ~20 km/h city speed
function estimateRoute(origin: Coordinate, destination: Coordinate): RouteMatrixResult {
  const crowFliesMeters = ServiceabilityPolicy.calculateDistanceMeters(origin, destination);
  const roadDistanceMeters = Math.round(crowFliesMeters * 1.3);
  return {
    distanceMeters: roadDistanceMeters,
    durationSeconds: Math.max(60, Math.round(roadDistanceMeters / 5.55)),
    isRoadRoute: false,
  };
}

export class MapboxAdapter {
  private token: string;

  constructor(token?: string) {
    this.token = token || getServerEnv().MAPBOX_SERVER_TOKEN || "";
  }

  get isMock(): boolean {
    return isMockSecret(this.token);
  }

  /**
   * Route distance and riding duration between two points. Never throws: falls back
   * to a conservative straight-line estimate so pricing keeps working when Mapbox is down.
   */
  async calculateRoute(origin: Coordinate, destination: Coordinate): Promise<RouteMatrixResult> {
    if (this.isMock) return estimateRoute(origin, destination);

    try {
      const url = `https://api.mapbox.com/directions/v5/mapbox/driving-traffic/${origin.longitude},${origin.latitude};${destination.longitude},${destination.latitude}?overview=false&access_token=${this.token}`;
      const res = await fetchWithTimeout(url, { timeoutMs: 2500 });
      if (!res.ok) throw new Error(`Mapbox API error: ${res.status}`);
      const data = (await res.json()) as { routes?: Array<{ distance: number; duration: number }> };
      const route = data.routes?.[0];
      if (!route) throw new Error("No route");
      return {
        distanceMeters: Math.round(route.distance),
        durationSeconds: Math.round(route.duration),
        isRoadRoute: true,
      };
    } catch {
      return estimateRoute(origin, destination);
    }
  }

  async reverseGeocode(point: Coordinate): Promise<GeocodeResult | null> {
    if (this.isMock) return null;
    try {
      const url = `https://api.mapbox.com/search/geocode/v6/reverse?longitude=${point.longitude}&latitude=${point.latitude}&limit=1&access_token=${this.token}`;
      const res = await fetchWithTimeout(url, { timeoutMs: 2500 });
      if (!res.ok) return null;
      const data = (await res.json()) as { features?: Array<{ properties?: { full_address?: string; name?: string } }> };
      const props = data.features?.[0]?.properties;
      const label = props?.full_address ?? props?.name;
      return label ? { label, ...point } : null;
    } catch {
      return null;
    }
  }

  async searchPlaces(query: string, proximity?: Coordinate): Promise<GeocodeResult[]> {
    if (this.isMock || query.trim().length < 3) return [];
    try {
      const params = new URLSearchParams({ q: query, country: "in", limit: "6", access_token: this.token });
      if (proximity) params.set("proximity", `${proximity.longitude},${proximity.latitude}`);
      const res = await fetchWithTimeout(`https://api.mapbox.com/search/geocode/v6/forward?${params}`, { timeoutMs: 2500 });
      if (!res.ok) return [];
      const data = (await res.json()) as {
        features?: Array<{ properties?: { full_address?: string; name?: string; coordinates?: { latitude: number; longitude: number } } }>;
      };
      return (data.features ?? [])
        .map((f) => f.properties)
        .filter((p): p is NonNullable<typeof p> => !!p?.coordinates)
        .map((p) => ({
          label: p.full_address ?? p.name ?? query,
          latitude: p.coordinates!.latitude,
          longitude: p.coordinates!.longitude,
        }));
    } catch {
      return [];
    }
  }
}

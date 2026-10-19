import { Coordinate } from "@startup/contracts";
import { getServerEnv } from "@startup/config";

export class UpstashRedisAdapter {
  private inMemoryCache = new Map<string, { value: string; expiresAt: number }>();

  async get<T>(key: string): Promise<T | null> {
    const item = this.inMemoryCache.get(key);
    if (!item) return null;
    if (item.expiresAt < Date.now()) {
      this.inMemoryCache.delete(key);
      return null;
    }
    try {
      return JSON.parse(item.value) as T;
    } catch {
      return item.value as unknown as T;
    }
  }

  async set(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
    const serialized = typeof value === "string" ? value : JSON.stringify(value);
    const expiresAt = ttlSeconds ? Date.now() + ttlSeconds * 1000 : Infinity;
    this.inMemoryCache.set(key, { value: serialized, expiresAt });
  }

  async del(key: string): Promise<void> {
    this.inMemoryCache.delete(key);
  }

  async updateRiderLocation(riderId: string, location: Coordinate): Promise<void> {
    await this.set(`rider:location:${riderId}`, location, 120); // 2 min TTL for hot telemetry
  }

  async getRiderLocation(riderId: string): Promise<Coordinate | null> {
    return this.get<Coordinate>(`rider:location:${riderId}`);
  }

  async checkRateLimit(key: string, limit: number, windowSeconds: number): Promise<boolean> {
    const redisKey = `ratelimit:${key}`;
    const current = (await this.get<number>(redisKey)) || 0;
    if (current >= limit) {
      return false; // Throttled
    }
    await this.set(redisKey, current + 1, windowSeconds);
    return true; // Allowed
  }
}

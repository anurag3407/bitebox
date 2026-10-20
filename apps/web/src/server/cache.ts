import { getRedis } from "@startup/integrations";

// Concurrent misses for the same key in this process share one loader call
const inflight = new Map<string, Promise<unknown>>();

/**
 * Cache-aside read through Upstash. Misses are coalesced per process so a hot key
 * expiring under load triggers one database read per instance, not one per request.
 */
export async function cached<T>(key: string, ttlSeconds: number, loader: () => Promise<T>): Promise<T> {
  const redis = getRedis();
  const hit = await redis.get<T>(key);
  if (hit !== null) return hit;

  const pending = inflight.get(key) as Promise<T> | undefined;
  if (pending) return pending;

  const load = (async () => {
    try {
      const value = await loader();
      if (value !== null && value !== undefined) await redis.set(key, value, ttlSeconds);
      return value;
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, load);
  return load;
}

export const CacheKeys = {
  menu: (slug: string) => `menu:v2:${slug}`,
};

export async function invalidate(...keys: string[]): Promise<void> {
  const redis = getRedis();
  await Promise.all(keys.map((k) => redis.del(k)));
}

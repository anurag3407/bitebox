import { Coordinate } from "@startup/contracts";
import { getServerEnv, isMockSecret } from "@startup/config";
import { fetchWithTimeout } from "../shared/http.js";

type RedisValue = string | number | null;

export interface RiderLiveLocation extends Coordinate {
  headingDegrees?: number;
  speedMps?: number;
  accuracyMeters?: number;
  updatedAt: string;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

/**
 * Process-local stand-in used only when Upstash is not configured (local dev/tests).
 * Shared at module scope so every adapter instance in the process sees the same data.
 */
const memoryStore = new Map<string, { value: string; expiresAt: number }>();

function memoryGet(key: string): string | null {
  const item = memoryStore.get(key);
  if (!item) return null;
  if (item.expiresAt < Date.now()) {
    memoryStore.delete(key);
    return null;
  }
  return item.value;
}

/**
 * Upstash Redis over its REST API (works from Node, edge and serverless without
 * connection pools). Redis is an accelerator here, never the source of truth:
 * callers must tolerate failures, so every method degrades instead of throwing
 * unless `strict` is requested.
 */
export class UpstashRedisAdapter {
  private readonly url: string;
  private readonly token: string;
  readonly isMemoryFallback: boolean;

  constructor(url?: string, token?: string) {
    const env = getServerEnv();
    this.url = (url ?? env.UPSTASH_REDIS_REST_URL ?? "").replace(/\/$/, "");
    this.token = token ?? env.UPSTASH_REDIS_REST_TOKEN ?? "";
    this.isMemoryFallback = !this.url || isMockSecret(this.url.replace(/^https?:\/\//, "")) || isMockSecret(this.token);
  }

  /** Executes one command, e.g. ["SET", "k", "v", "EX", "60"]. */
  async command<T = RedisValue>(args: Array<string | number>): Promise<T> {
    if (this.isMemoryFallback) return this.memoryCommand(args) as T;
    const res = await fetchWithTimeout(this.url, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
      body: JSON.stringify(args.map(String)),
      timeoutMs: 1500,
    });
    const data = (await res.json()) as { result?: T; error?: string };
    if (!res.ok || data.error) throw new Error(`Upstash error: ${data.error ?? res.status}`);
    return data.result as T;
  }

  /** Executes several commands in one round trip (not atomic; use for independent ops). */
  async pipeline(commands: Array<Array<string | number>>): Promise<RedisValue[]> {
    if (this.isMemoryFallback) return commands.map((c) => this.memoryCommand(c));
    const res = await fetchWithTimeout(`${this.url}/pipeline`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
      body: JSON.stringify(commands.map((c) => c.map(String))),
      timeoutMs: 1500,
    });
    const data = (await res.json()) as Array<{ result?: RedisValue; error?: string }>;
    if (!res.ok || !Array.isArray(data)) throw new Error(`Upstash pipeline error: ${res.status}`);
    return data.map((d) => (d.error ? null : (d.result ?? null)));
  }

  private memoryCommand(args: Array<string | number>): RedisValue {
    const [rawCmd, key, ...rest] = args.map(String);
    const cmd = rawCmd!.toUpperCase();
    switch (cmd) {
      case "GET":
        return memoryGet(key!);
      case "SET": {
        let expiresAt = Infinity;
        const exIdx = rest.findIndex((r) => r.toUpperCase() === "EX");
        if (exIdx >= 0) expiresAt = Date.now() + Number(rest[exIdx + 1]) * 1000;
        const nx = rest.some((r) => r.toUpperCase() === "NX");
        if (nx && memoryGet(key!) !== null) return null;
        memoryStore.set(key!, { value: rest[0] ?? "", expiresAt });
        return "OK";
      }
      case "DEL":
        return memoryStore.delete(key!) ? 1 : 0;
      case "INCR": {
        const current = Number(memoryGet(key!) ?? 0) + 1;
        const existing = memoryStore.get(key!);
        memoryStore.set(key!, { value: String(current), expiresAt: existing?.expiresAt ?? Infinity });
        return current;
      }
      case "EXPIRE": {
        const item = memoryStore.get(key!);
        if (!item) return 0;
        const nx = rest.some((r) => r.toUpperCase() === "NX");
        if (nx && item.expiresAt !== Infinity) return 0;
        item.expiresAt = Date.now() + Number(rest[0]) * 1000;
        return 1;
      }
      case "TTL": {
        const item = memoryStore.get(key!);
        if (!item) return -2;
        return item.expiresAt === Infinity ? -1 : Math.ceil((item.expiresAt - Date.now()) / 1000);
      }
      default:
        throw new Error(`Unsupported in-memory Redis command: ${cmd}`);
    }
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      const raw = await this.command<string | null>(["GET", key]);
      if (raw === null || raw === undefined) return null;
      try {
        return JSON.parse(raw) as T;
      } catch {
        return raw as unknown as T;
      }
    } catch {
      return null;
    }
  }

  async set(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
    const serialized = typeof value === "string" ? value : JSON.stringify(value);
    try {
      await this.command(ttlSeconds ? ["SET", key, serialized, "EX", ttlSeconds] : ["SET", key, serialized]);
    } catch {
      // Cache writes are best-effort
    }
  }

  async del(key: string): Promise<void> {
    try {
      await this.command(["DEL", key]);
    } catch {
      // best-effort
    }
  }

  async updateRiderLocation(riderId: string, location: Coordinate & Partial<RiderLiveLocation>): Promise<void> {
    const value: RiderLiveLocation = { ...location, updatedAt: location.updatedAt ?? new Date().toISOString() };
    await this.set(`rider:location:${riderId}`, value, 120); // 2 min TTL for hot telemetry
  }

  async getRiderLocation(riderId: string): Promise<RiderLiveLocation | null> {
    return this.get<RiderLiveLocation>(`rider:location:${riderId}`);
  }

  async getRiderLocations(riderIds: string[]): Promise<Map<string, RiderLiveLocation>> {
    const out = new Map<string, RiderLiveLocation>();
    if (riderIds.length === 0) return out;
    try {
      const results = await this.pipeline(riderIds.map((id) => ["GET", `rider:location:${id}`]));
      results.forEach((raw, i) => {
        if (typeof raw === "string") {
          try {
            out.set(riderIds[i]!, JSON.parse(raw));
          } catch {
            // ignore corrupt entry
          }
        }
      });
    } catch {
      // fall back to DB positions
    }
    return out;
  }

  /**
   * Fixed-window counter. Fails open when Redis is unreachable: availability of
   * ordering matters more than perfect throttling, and sensitive flows (OTP) keep
   * their own durable attempt counters in PostgreSQL.
   */
  async rateLimit(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult> {
    const redisKey = `ratelimit:${key}:${Math.floor(Date.now() / 1000 / windowSeconds)}`;
    try {
      const [count] = await this.pipeline([
        ["INCR", redisKey],
        ["EXPIRE", redisKey, windowSeconds + 1, "NX"],
      ]);
      const used = Number(count ?? 0);
      const windowEndsIn = windowSeconds - (Math.floor(Date.now() / 1000) % windowSeconds);
      return { allowed: used <= limit, remaining: Math.max(0, limit - used), retryAfterSeconds: windowEndsIn };
    } catch {
      return { allowed: true, remaining: limit, retryAfterSeconds: 0 };
    }
  }

  /** @deprecated use rateLimit */
  async checkRateLimit(key: string, limit: number, windowSeconds: number): Promise<boolean> {
    return (await this.rateLimit(key, limit, windowSeconds)).allowed;
  }

  async ping(): Promise<{ ok: boolean; latencyMs: number; mode: "upstash" | "memory" }> {
    const started = Date.now();
    try {
      await this.command(["GET", "healthcheck"]);
      return { ok: true, latencyMs: Date.now() - started, mode: this.isMemoryFallback ? "memory" : "upstash" };
    } catch {
      return { ok: false, latencyMs: Date.now() - started, mode: this.isMemoryFallback ? "memory" : "upstash" };
    }
  }
}

let shared: UpstashRedisAdapter | null = null;
export function getRedis(): UpstashRedisAdapter {
  if (!shared) shared = new UpstashRedisAdapter();
  return shared;
}

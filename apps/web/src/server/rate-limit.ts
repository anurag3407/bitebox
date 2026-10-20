import { NextRequest } from "next/server";
import { DomainError } from "@startup/core";
import { getRedis } from "@startup/integrations";

export function clientIp(req: NextRequest): string {
  // nginx sets X-Real-IP; X-Forwarded-For's first hop is the client when behind our proxy only
  return req.headers.get("x-real-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

export const RateLimits = {
  quote: { limit: 30, windowSeconds: 60 },
  checkout: { limit: 10, windowSeconds: 60 },
  paymentVerify: { limit: 20, windowSeconds: 60 },
  search: { limit: 60, windowSeconds: 60 },
  discovery: { limit: 120, windowSeconds: 60 },
  riderLocation: { limit: 40, windowSeconds: 60 },
  otpAttempt: { limit: 10, windowSeconds: 300 },
  mutation: { limit: 60, windowSeconds: 60 },
  webhook: { limit: 600, windowSeconds: 60 },
  call: { limit: 6, windowSeconds: 600 },
  support: { limit: 20, windowSeconds: 300 },
  upload: { limit: 30, windowSeconds: 600 },
  partnerApplication: { limit: 5, windowSeconds: 3600 },
} as const;

/**
 * Throws RATE_LIMITED when the caller exceeded the bucket. Keyed by user when known,
 * otherwise by client IP.
 */
export async function enforceRateLimit(
  req: NextRequest,
  bucket: keyof typeof RateLimits,
  principal?: string
): Promise<void> {
  const { limit, windowSeconds } = RateLimits[bucket];
  const key = `${bucket}:${principal ?? `ip:${clientIp(req)}`}`;
  const result = await getRedis().rateLimit(key, limit, windowSeconds);
  if (!result.allowed) {
    throw new DomainError("RATE_LIMITED", "Too many requests. Please slow down and try again shortly.", {
      details: { retryAfterSeconds: result.retryAfterSeconds },
    });
  }
}

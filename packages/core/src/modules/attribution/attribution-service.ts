import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { AcquisitionChannel } from "@startup/contracts";

export interface AttributionTokenPayload {
  restaurantId: string;
  slug: string;
  channel: AcquisitionChannel;
  /** Unix epoch seconds. */
  exp: number;
}

export interface SignedMerchantLink {
  url: string;
  token: string;
  expiresAt: string;
}

const CHANNELS = new Set<string>(Object.values(AcquisitionChannel));

function base64Url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

function signatureFor(encodedPayload: string, secret: string): string {
  return createHmac("sha256", secret).update(encodedPayload).digest("base64url");
}

export function signAttributionToken(payload: AttributionTokenPayload, secret: string): string {
  if (!secret) throw new Error("Attribution signing secret is required");
  if (!payload.restaurantId || !payload.slug) throw new Error("Attribution payload needs restaurantId and slug");
  if (!CHANNELS.has(payload.channel)) throw new Error("Unknown acquisition channel");
  if (!Number.isInteger(payload.exp) || payload.exp <= 0) throw new Error("Attribution token needs a unix expiry");
  const encoded = base64Url(JSON.stringify(payload));
  return `${encoded}.${signatureFor(encoded, secret)}`;
}

export function verifyAttributionToken(
  token: string,
  secret: string,
  nowMs: number = Date.now()
): AttributionTokenPayload | null {
  if (!token || !secret) return null;
  const separator = token.lastIndexOf(".");
  if (separator <= 0 || separator === token.length - 1) return null;
  const encoded = token.slice(0, separator);
  const provided = token.slice(separator + 1);
  const expected = signatureFor(encoded, secret);
  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);
  if (providedBuffer.length !== expectedBuffer.length || !timingSafeEqual(providedBuffer, expectedBuffer)) return null;

  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as AttributionTokenPayload;
    if (!payload || typeof payload !== "object") return null;
    if (!payload.restaurantId || !payload.slug) return null;
    if (!CHANNELS.has(payload.channel)) return null;
    if (!Number.isInteger(payload.exp) || payload.exp * 1000 <= nowMs) return null;
    return payload;
  } catch {
    return null;
  }
}

export function generateSignedMerchantLink(input: {
  baseUrl: string;
  restaurantId: string;
  slug: string;
  hmacSecret: string;
  channel?: AcquisitionChannel;
  ttlSeconds?: number;
  now?: Date;
}): SignedMerchantLink {
  const ttlSeconds = input.ttlSeconds ?? 24 * 60 * 60;
  if (!Number.isInteger(ttlSeconds) || ttlSeconds <= 0) throw new Error("Link TTL must be a positive number of seconds");
  const nowMs = input.now?.getTime() ?? Date.now();
  const payload: AttributionTokenPayload = {
    restaurantId: input.restaurantId,
    slug: input.slug,
    channel: input.channel ?? AcquisitionChannel.MERCHANT_DIRECT_SESSION,
    exp: Math.floor(nowMs / 1000) + ttlSeconds,
  };
  const token = signAttributionToken(payload, input.hmacSecret);
  const base = input.baseUrl.replace(/\/+$/, "");
  const url = `${base}/m/${encodeURIComponent(input.slug)}?token=${encodeURIComponent(token)}`;
  return { url, token, expiresAt: new Date(payload.exp * 1000).toISOString() };
}

export function hashAttributionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export interface AttributionFacts {
  hasValidSession: boolean;
  isFirstOrigin: boolean;
}

/** Session wins. Lifetime first origin is the fallback; otherwise the marketplace owns the demand. */
export function decideAcquisitionChannel(facts: AttributionFacts): AcquisitionChannel {
  if (facts.hasValidSession) return AcquisitionChannel.MERCHANT_DIRECT_SESSION;
  if (facts.isFirstOrigin) return AcquisitionChannel.MERCHANT_FIRST_ORIGIN;
  return AcquisitionChannel.MARKETPLACE;
}

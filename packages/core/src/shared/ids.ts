import { randomInt, randomUUID, timingSafeEqual } from "node:crypto";

export function generateUuid(): string {
  return randomUUID();
}

export function isValidUuid(id: string): boolean {
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(id);
}

// Crockford-style alphabet without 0/O/1/I/L so numbers can be read aloud to support.
const ORDER_SUFFIX_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

/**
 * Generates an order number: e.g. ORD-20261019-7KX3QF.
 * 6 characters from a 31-symbol alphabet gives ~887M combinations per day;
 * the database unique constraint is the final guard and callers retry on conflict.
 */
export function generateOrderNumber(date: Date = new Date()): string {
  const yyyymmdd = date.toISOString().slice(0, 10).replace(/-/g, "");
  let suffix = "";
  for (let i = 0; i < 6; i++) {
    suffix += ORDER_SUFFIX_ALPHABET[randomInt(ORDER_SUFFIX_ALPHABET.length)];
  }
  return `ORD-${yyyymmdd}-${suffix}`;
}

/**
 * Generates a numeric verification code using a CSPRNG (Math.random is predictable).
 */
export function generateVerificationOtp(digits = 6): string {
  return randomInt(0, 10 ** digits).toString().padStart(digits, "0");
}

/**
 * Constant-time comparison for short secrets such as OTPs.
 */
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf-8");
  const bufB = Buffer.from(b, "utf-8");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

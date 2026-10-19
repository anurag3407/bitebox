import { randomUUID } from "node:crypto";

export function generateUuid(): string {
  return randomUUID();
}

export function isValidUuid(id: string): boolean {
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(id);
}

/**
 * Generates an order number: e.g. ORD-20261019-A1B2
 */
export function generateOrderNumber(date: Date = new Date()): string {
  const yyyymmdd = date.toISOString().slice(0, 10).replace(/-/g, "");
  const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `ORD-${yyyymmdd}-${randomSuffix}`;
}

/**
 * Generates a 6-digit numeric verification OTP
 */
export function generateVerificationOtp(): string {
  const code = Math.floor(100000 + Math.random() * 900000);
  return code.toString();
}

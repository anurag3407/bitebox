import { ErrorCode } from "@startup/contracts";

const DEFAULT_HTTP_STATUS: Record<ErrorCode, number> = {
  VALIDATION_ERROR: 400,
  UNAUTHENTICATED: 401,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  STATE_CONFLICT: 409,
  IDEMPOTENCY_CONFLICT: 409,
  QUOTE_EXPIRED: 409,
  SERVICEABILITY_ERROR: 422,
  RESERVATION_EXPIRED: 409,
  OUT_OF_STOCK: 422,
  COUPON_INVALID: 422,
  PAYMENT_FAILED: 402,
  PAYMENT_REQUIRED: 402,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
};

/**
 * Expected business failure. The message is safe to show to the caller;
 * anything that is not a DomainError is treated as an internal fault and
 * its message is never returned over HTTP.
 */
export class DomainError extends Error {
  readonly code: ErrorCode;
  readonly httpStatus: number;
  readonly details?: unknown;

  constructor(code: ErrorCode, message: string, options: { httpStatus?: number; details?: unknown } = {}) {
    super(message);
    this.name = "DomainError";
    this.code = code;
    this.httpStatus = options.httpStatus ?? DEFAULT_HTTP_STATUS[code] ?? 400;
    this.details = options.details;
  }
}

export function isDomainError(err: unknown): err is DomainError {
  return err instanceof DomainError;
}

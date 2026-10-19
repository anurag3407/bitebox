import { z } from "zod";

export const ErrorCode = {
  VALIDATION_ERROR: "VALIDATION_ERROR",
  UNAUTHENTICATED: "UNAUTHENTICATED",
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  CONFLICT: "CONFLICT",
  STATE_CONFLICT: "STATE_CONFLICT",
  IDEMPOTENCY_CONFLICT: "IDEMPOTENCY_CONFLICT",
  QUOTE_EXPIRED: "QUOTE_EXPIRED",
  SERVICEABILITY_ERROR: "SERVICEABILITY_ERROR",
  RESERVATION_EXPIRED: "RESERVATION_EXPIRED",
  OUT_OF_STOCK: "OUT_OF_STOCK",
  COUPON_INVALID: "COUPON_INVALID",
  PAYMENT_FAILED: "PAYMENT_FAILED",
  PAYMENT_REQUIRED: "PAYMENT_REQUIRED",
  RATE_LIMITED: "RATE_LIMITED",
  INTERNAL_ERROR: "INTERNAL_ERROR",
} as const;
export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export const ApiErrorDetailSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.unknown().optional(),
});
export type ApiErrorDetail = z.infer<typeof ApiErrorDetailSchema>;

export const ApiErrorResponseSchema = z.object({
  error: ApiErrorDetailSchema,
  meta: z.object({
    requestId: z.string(),
    timestamp: z.string(),
  }),
});
export type ApiErrorResponse = z.infer<typeof ApiErrorResponseSchema>;

export const ApiResponseEnvelope = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    data: dataSchema,
    meta: z.object({
      requestId: z.string(),
      timestamp: z.string(),
    }),
  });

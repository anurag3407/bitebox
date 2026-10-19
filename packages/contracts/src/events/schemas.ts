import { z } from "zod";

export const EventEnvelopeSchema = <T extends z.ZodTypeAny>(payloadSchema: T) =>
  z.object({
    eventId: z.string().uuid(),
    type: z.string(),
    schemaVersion: z.number().int().positive().default(1),
    aggregateId: z.string().uuid(),
    aggregateVersion: z.number().int().nonnegative(),
    occurredAt: z.string(),
    correlationId: z.string(),
    payload: payloadSchema,
  });

export const OrderCreatedEventPayloadSchema = z.object({
  orderId: z.string().uuid(),
  customerId: z.string().uuid(),
  restaurantId: z.string().uuid(),
  payablePaise: z.number().int().nonnegative(),
});

export const OrderPaidEventPayloadSchema = z.object({
  orderId: z.string().uuid(),
  paymentId: z.string().uuid(),
  amountPaise: z.number().int().positive(),
});

export const OrderMerchantAcceptedPayloadSchema = z.object({
  orderId: z.string().uuid(),
  merchantId: z.string().uuid(),
  estimatedPrepMinutes: z.number().int().positive(),
});

export const OrderMerchantRejectedPayloadSchema = z.object({
  orderId: z.string().uuid(),
  reason: z.string(),
});

export const OrderReadyForPickupPayloadSchema = z.object({
  orderId: z.string().uuid(),
});

export const OrderAssignedPayloadSchema = z.object({
  orderId: z.string().uuid(),
  riderId: z.string().uuid(),
  assignmentId: z.string().uuid(),
});

export const OrderPickedUpPayloadSchema = z.object({
  orderId: z.string().uuid(),
  riderId: z.string().uuid(),
});

export const OrderDeliveredPayloadSchema = z.object({
  orderId: z.string().uuid(),
  riderId: z.string().uuid(),
});

export const OrderCancelledPayloadSchema = z.object({
  orderId: z.string().uuid(),
  reason: z.string(),
  refundInitiated: z.boolean(),
});

export const PaymentCapturedPayloadSchema = z.object({
  paymentId: z.string().uuid(),
  orderId: z.string().uuid(),
  providerPaymentId: z.string(),
  amountPaise: z.number().int().positive(),
});

export const PaymentFailedPayloadSchema = z.object({
  orderId: z.string().uuid(),
  providerOrderId: z.string(),
  reason: z.string().optional(),
});

export const RefundProcessedPayloadSchema = z.object({
  refundId: z.string().uuid(),
  paymentId: z.string().uuid(),
  orderId: z.string().uuid(),
  providerRefundId: z.string(),
  amountPaise: z.number().int().positive(),
});

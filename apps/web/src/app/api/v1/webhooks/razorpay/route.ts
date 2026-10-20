import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { OrderRepository, RefundRepository, WebhookInboxRepository, getDb, paymentAttempts } from "@startup/database";
import { RazorpayAdapter } from "@startup/integrations";
import { eq } from "drizzle-orm";
import { logger } from "@/server/logger";

interface RazorpayWebhook {
  event: string;
  payload?: {
    payment?: { entity?: { id: string; order_id?: string; amount: number; currency: string; error_description?: string } };
    refund?: { entity?: { id: string; payment_id: string; amount: number; receipt?: string | null; status: string } };
  };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Applies one verified event. Returns "IGNORED" for events that do not concern us
 * (e.g. a provider order we did not create) so they are not retried forever.
 */
async function applyEvent(event: RazorpayWebhook): Promise<"PROCESSED" | "IGNORED"> {
  switch (event.event) {
    case "payment.captured":
    case "order.paid": {
      const payment = event.payload?.payment?.entity;
      if (!payment?.order_id) return "IGNORED";
      // Resolve strictly through our own payment attempt; notes are client-influenced
      const [attempt] = await getDb()
        .select()
        .from(paymentAttempts)
        .where(eq(paymentAttempts.razorpayOrderId, payment.order_id))
        .limit(1);
      if (!attempt) return "IGNORED";
      await OrderRepository.recordPaymentCapture({
        orderId: attempt.orderId,
        providerPaymentId: payment.id,
        amountPaise: payment.amount,
        currency: payment.currency,
        paymentAttemptId: attempt.id,
      });
      return "PROCESSED";
    }

    case "payment.failed": {
      const payment = event.payload?.payment?.entity;
      if (!payment?.order_id) return "IGNORED";
      await OrderRepository.recordPaymentFailure({
        razorpayOrderId: payment.order_id,
        reason: payment.error_description,
      });
      return "PROCESSED";
    }

    case "refund.processed":
    case "refund.failed": {
      const refund = event.payload?.refund?.entity;
      if (!refund) return "IGNORED";
      const result = await RefundRepository.applyProviderResult({
        // We send our refund id as the receipt, so either key finds the row
        refundId: refund.receipt && UUID_RE.test(refund.receipt) ? refund.receipt : undefined,
        providerRefundId: refund.id,
        status: event.event === "refund.processed" ? "PROCESSED" : "FAILED",
        failureReason: event.event === "refund.failed" ? "Gateway reported refund failure" : undefined,
      });
      return result ? "PROCESSED" : "IGNORED";
    }

    default:
      return "IGNORED";
  }
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-razorpay-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing signature header" }, { status: 400 });
  }
  if (!new RazorpayAdapter().verifyWebhookSignature(rawBody, signature)) {
    return NextResponse.json({ error: "Invalid webhook signature" }, { status: 400 });
  }

  let event: RazorpayWebhook;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Malformed payload" }, { status: 400 });
  }

  // Razorpay sends a stable event id header; fall back to a content hash (never a timestamp,
  // which would make every redelivery look new)
  const eventId =
    req.headers.get("x-razorpay-event-id") ?? `sha256:${createHash("sha256").update(rawBody).digest("hex")}`;

  const claim = await WebhookInboxRepository.receive({
    provider: "RAZORPAY",
    providerEventId: eventId,
    eventType: event.event,
    payload: event,
  });
  if (claim.state === "ALREADY_PROCESSED") {
    return NextResponse.json({ status: "ignored_duplicate" });
  }

  try {
    const status = await applyEvent(event);
    await WebhookInboxRepository.markProcessed(claim.id, status);
    return NextResponse.json({ status: status === "PROCESSED" ? "acknowledged" : "ignored" });
  } catch (err) {
    const message = (err as Error)?.message ?? String(err);
    await WebhookInboxRepository.markFailed(claim.id, message).catch(() => undefined);
    logger.error("razorpay webhook processing failed", { eventId, event: event.event, error: message });
    // Non-2xx makes Razorpay redeliver; the inbox row lets the retry run again
    return NextResponse.json({ error: "Webhook handling failed" }, { status: 500 });
  }
}

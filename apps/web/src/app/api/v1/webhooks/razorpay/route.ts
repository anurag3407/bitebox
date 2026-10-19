import { NextRequest, NextResponse } from "next/server";
import { OrderRepository, getDb, paymentAttempts, webhookInbox } from "@startup/database";
import { RazorpayAdapter } from "@startup/integrations";
import { eq } from "drizzle-orm";

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get("x-razorpay-signature");

    if (!signature) {
      return NextResponse.json({ error: "Missing signature header" }, { status: 400 });
    }

    const adapter = new RazorpayAdapter();
    const isValid = adapter.verifyWebhookSignature(rawBody, signature);

    if (!isValid) {
      return NextResponse.json({ error: "Invalid webhook signature" }, { status: 400 });
    }

    const payload = JSON.parse(rawBody);
    const eventId = payload.event_id || req.headers.get("x-razorpay-event-id") || `evt_${Date.now()}`;
    const eventType = payload.event;

    // Deduplicate in webhook_inbox
    const db = getDb();
    const insertRes = await db
      .insert(webhookInbox)
      .values({
        provider: "RAZORPAY",
        providerEventId: eventId,
        payloadJson: payload,
        status: "PENDING",
      })
      .onConflictDoNothing()
      .returning();

    if (insertRes.length === 0) {
      // Already processed or received
      return NextResponse.json({ status: "ignored_duplicate" });
    }

    // Process payment.captured or order.paid event
    if (eventType === "payment.captured" || eventType === "order.paid") {
      const paymentEntity = payload.payload?.payment?.entity;
      const rzpOrderId = paymentEntity?.order_id;
      const paymentId = paymentEntity?.id;
      const amount = paymentEntity?.amount;

      // Authoritatively resolve local order via provider order ID in payment_attempts
      let resolvedOrderId: string | undefined;
      let resolvedAttemptId: string | undefined;

      if (rzpOrderId) {
        const [attempt] = await db
          .select()
          .from(paymentAttempts)
          .where(eq(paymentAttempts.razorpayOrderId, rzpOrderId))
          .limit(1);
        if (attempt) {
          resolvedOrderId = attempt.orderId;
          resolvedAttemptId = attempt.id;
        }
      }

      // Fallback to notes if payment attempt lookup by order_id was absent
      if (!resolvedOrderId && paymentEntity?.notes?.orderId) {
        resolvedOrderId = paymentEntity.notes.orderId;
      }

      if (resolvedOrderId && paymentId && amount) {
        await OrderRepository.recordPaymentCapture({
          orderId: resolvedOrderId,
          providerPaymentId: paymentId,
          amountPaise: amount,
          paymentAttemptId: resolvedAttemptId,
        });
      }
    }

    // Mark webhook event as processed
    if (insertRes[0]?.id) {
      await db
        .update(webhookInbox)
        .set({ status: "PROCESSED" })
        .where(eq(webhookInbox.id, insertRes[0].id));
    }

    return NextResponse.json({ status: "acknowledged" });
  } catch (err: any) {
    console.error("Webhook processing error:", err);
    return NextResponse.json({ error: "Webhook handling failed" }, { status: 500 });
  }
}

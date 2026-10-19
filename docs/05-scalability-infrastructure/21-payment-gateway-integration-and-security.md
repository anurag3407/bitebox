# 21 - Payment Gateway Integration, Webhook Security & Fraud Detection

## 1. Dual-Gateway High-Availability Architecture

Relying on a single payment aggregator creates a severe single point of failure (SPOF). During major sale peaks, payment aggregators frequently experience infrastructure strain.

The platform implements an **Active-Active Dual-Gateway Router**:

```mermaid
flowchart TD
    CheckoutReq[Customer Initiates Payment] --> PaymentRouter[Dynamic Payment Router]
    
    PaymentRouter --> CircuitCheck{Is Primary Gateway Healthy?}
    CircuitCheck -- Yes --> Razorpay[Primary: Razorpay (India UPI / Cards)]
    CircuitCheck -- No / Degraded --> Stripe[Secondary Fallback: Stripe / Cashfree]
    
    Razorpay --> WebhookListener[Secure Webhook Ingestion Service]
    Stripe --> WebhookListener
    
    WebhookListener --> VerifySig[HMAC SHA-256 Signature Verification]
    VerifySig --> Dedup[Redis Deduplication Check]
    Dedup --> EventBus[(Kafka: payment.captured)]
```

---

## 2. Secure Webhook Verification (HMAC SHA-256)

Payment confirmations must **never** rely solely on the frontend client browser redirect (which can be manipulated or dropped due to network disconnections). The authoritative payment capture is confirmed via cryptographically signed backend webhooks:

```typescript
import crypto from "crypto";
import { Request, Response } from "express";
import Redis from "ioredis";

const redis = new Redis(process.env.REDIS_URL!);
const RAZORPAY_WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET!;

export async function handleRazorpayWebhook(req: Request, res: Response) {
  const signature = req.headers["x-razorpay-signature"] as string;
  const rawBody = req.body; // Must use raw unparsed buffer to verify signature

  if (!signature) {
    return res.status(400).json({ error: "Missing webhook signature" });
  }

  // 1. Verify Cryptographic HMAC SHA256 Signature
  const expectedSignature = crypto
    .createHmac("sha256", RAZORPAY_WEBHOOK_SECRET)
    .update(JSON.stringify(rawBody))
    .digest("hex");

  if (signature !== expectedSignature) {
    console.error("ALERT: Invalid webhook signature detected. Potential spoofing attempt!");
    return res.status(401).json({ error: "Invalid signature" });
  }

  const event = req.body;
  const eventId = event.payload.payment.entity.id;

  // 2. Prevent Webhook Replay Attacks (Idempotent Redis Lock)
  const isDuplicate = await redis.set(`webhook:processed:${eventId}`, "1", "EX", 86400, "NX");
  if (!isDuplicate) {
    // Event already processed in the last 24 hours
    return res.status(200).json({ status: "already_processed" });
  }

  // 3. Process Payment Event
  if (event.event === "payment.captured") {
    const paymentEntity = event.payload.payment.entity;
    const orderId = paymentEntity.notes.order_id;
    const amountPaid = paymentEntity.amount / 100; // Convert Paisa to Rupees

    // Emit event to Kafka / Trigger Order Saga Orchestrator
    await publishPaymentConfirmedEvent(orderId, paymentEntity.id, amountPaid);
  }

  // Acknowledge receipt to payment gateway immediately with 200 OK
  return res.status(200).json({ status: "ok" });
}
```

---

## 3. PCI-DSS Compliance & Card Data Security

To remain **PCI-DSS Level 1 Compliant** with minimal audit overhead, the architecture enforces a **Zero Raw Card Footprint Policy**:

1. **Client-Side Tokenization:** Credit and debit card numbers are entered exclusively into iframe fields hosted directly by Razorpay or Stripe.
2. **No PAN / CVV on Application Servers:** Card data never touches our web servers, memory, or databases. Our backend stores only opaque payment tokens (`tok_1N3w9k2e...`) and masked identifiers (`Visa ending in 4242`).

---

## 4. Anti-Fraud & Payment Velocity Protections

To protect restaurants and the platform against credit card testing and refund fraud:

1. **Velocity Rate Limiter:** If a single user account or IP address experiences $> 3$ payment failures within 10 minutes, card checkout is locked for 1 hour (forcing UPI/Net Banking).
2. **Device Fingerprinting:** Suspicious accounts generating high refund requests across multiple phone numbers on the same browser fingerprint are flagged for manual review.
3. **Card-Not-Present 3D Secure:** 100% of Indian debit and credit transactions enforce mandatory Two-Factor Authentication (OTP / 3D Secure 2.0).

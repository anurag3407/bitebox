import { FulfillmentState } from "@startup/contracts";
import { DomainError, isDomainError } from "@startup/core";
import {
  ClaimedJob,
  DISPATCHABLE_STATES,
  JobKind,
  JobRepository,
  OrderRepository,
  OutboxRepository,
  RefundRepository,
  RiderRepository,
  getDbPool,
} from "@startup/database";
import { ProviderRejectedError, ProviderUnavailableError, RazorpayAdapter, getRedis } from "@startup/integrations";
import { logger } from "./logger.js";

// Retry dispatch every 30s; alert ops after ~5 minutes without a rider, keep trying
const DISPATCH_RETRY_MS = 30_000;
const DISPATCH_ESCALATE_AFTER_ATTEMPTS = 10;
const DISPATCH_MAX_ATTEMPTS = 120;
const REFUND_STATUS_RECHECK_MS = 60 * 60 * 1000;

function str(payload: Record<string, unknown>, key: string): string {
  const v = payload[key];
  if (typeof v !== "string" || !v) throw new Error(`Missing ${key} in job payload`);
  return v;
}

/** State already moved on (accepted, cancelled...) — the scheduled action is moot. */
function isStaleStateConflict(err: unknown): boolean {
  return isDomainError(err) && (err.code === "STATE_CONFLICT" || err.code === "NOT_FOUND");
}

export async function handleMerchantAcceptanceTimeout(job: ClaimedJob): Promise<void> {
  const orderId = str(job.payload, "orderId");
  try {
    await OrderRepository.cancel({
      orderId,
      actor: "SYSTEM",
      reason: "Restaurant did not respond in time",
      expectedStates: [FulfillmentState.AWAITING_MERCHANT],
    });
    logger.info("merchant acceptance expired; order auto-cancelled", { orderId });
  } catch (err) {
    if (!isStaleStateConflict(err)) throw err;
  }
}

/**
 * Unpaid order past its payment window. Before expiring it, ask Razorpay whether a
 * payment actually went through (the callback or webhook may have been lost).
 */
export async function handlePaymentExpiry(job: ClaimedJob, razorpay = new RazorpayAdapter()): Promise<void> {
  const orderId = str(job.payload, "orderId");
  const res = await getDbPool().query(
    `SELECT o.fulfillment_state, o.payment_status, pa.id AS attempt_id, pa.razorpay_order_id
       FROM orders o
       LEFT JOIN LATERAL (SELECT id, razorpay_order_id FROM payment_attempts
                           WHERE order_id = o.id ORDER BY created_at DESC LIMIT 1) pa ON true
      WHERE o.id = $1`,
    [orderId]
  );
  const row = res.rows[0];
  if (!row || row.fulfillment_state !== FulfillmentState.PENDING_PAYMENT) return;

  if (row.razorpay_order_id) {
    const payments = await razorpay.fetchOrderPayments(row.razorpay_order_id);
    for (let payment of payments) {
      if (payment.status === "authorized") {
        payment = await razorpay.capturePayment(payment.id, payment.amountPaise, payment.currency);
      }
      if (payment.status === "captured") {
        await OrderRepository.recordPaymentCapture({
          orderId,
          providerPaymentId: payment.id,
          amountPaise: payment.amountPaise,
          currency: payment.currency,
          paymentAttemptId: row.attempt_id,
        });
        logger.info("payment recovered during expiry reconciliation", { orderId, paymentId: payment.id });
        return;
      }
    }
  }

  try {
    await OrderRepository.cancel({
      orderId,
      actor: "SYSTEM",
      reason: "Payment was not completed",
      expectedStates: [FulfillmentState.PENDING_PAYMENT],
    });
  } catch (err) {
    if (!isStaleStateConflict(err)) throw err;
  }
}

export async function handleDispatchOrder(job: ClaimedJob): Promise<void> {
  const orderId = str(job.payload, "orderId");
  const attempt = Number(job.payload.attempt ?? 0);

  const res = await getDbPool().query(
    `SELECT o.fulfillment_state, r.latitude, r.longitude,
            EXISTS (SELECT 1 FROM delivery_assignments da WHERE da.order_id = o.id
                     AND da.status IN ('ASSIGNED', 'AT_PICKUP', 'PICKED_UP', 'AT_DROPOFF')) AS has_trip,
            EXISTS (SELECT 1 FROM delivery_offers d WHERE d.order_id = o.id
                     AND d.status = 'OFFERED' AND d.expires_at > NOW()) AS has_offer
       FROM orders o JOIN restaurants r ON r.id = o.restaurant_id
      WHERE o.id = $1`,
    [orderId]
  );
  const row = res.rows[0];
  if (!row || !DISPATCHABLE_STATES.includes(row.fulfillment_state) || row.has_trip || row.has_offer) return;

  const pickup = { latitude: row.latitude, longitude: row.longitude };
  const online = await getDbPool().query(`SELECT id FROM riders WHERE is_online AND is_approved`);
  const live = await getRedis().getRiderLocations(online.rows.map((r) => r.id));
  const candidates = await RiderRepository.findDispatchCandidates(orderId, pickup, live);

  for (const candidate of candidates.slice(0, 3)) {
    const offer = await RiderRepository.createOffer({
      orderId,
      riderId: candidate.riderId,
      distanceToPickupMeters: candidate.distanceToPickupMeters,
    });
    if (offer) {
      logger.info("dispatch offer created", { orderId, riderId: candidate.riderId, attempt });
      return;
    }
  }

  // Nobody available right now: try again shortly, escalate if it drags on
  if (attempt + 1 === DISPATCH_ESCALATE_AFTER_ATTEMPTS) {
    await OutboxRepository.appendWithClient(getDbPool(), "dispatch.escalated", orderId, 0, {
      orderId,
      attempts: attempt + 1,
    });
  }
  if (attempt + 1 < DISPATCH_MAX_ATTEMPTS) {
    await JobRepository.enqueue(JobKind.DISPATCH_ORDER, { orderId, attempt: attempt + 1 }, {
      runAt: new Date(Date.now() + DISPATCH_RETRY_MS),
      dedupeKey: `dispatch:${orderId}:${attempt + 1}:${job.id}`,
    });
  }
}

export async function handleDispatchOfferTimeout(job: ClaimedJob): Promise<void> {
  await RiderRepository.expireOffer(str(job.payload, "offerId"));
}

/**
 * Submits an approved refund to Razorpay exactly once. Our refund id is sent as the
 * receipt; on retry (e.g. after a timeout with unknown outcome) we first look for a
 * refund carrying that receipt instead of creating a second one.
 */
export async function handleRefundSubmit(job: ClaimedJob, razorpay = new RazorpayAdapter()): Promise<void> {
  const refundId = str(job.payload, "refundId");
  const refund = await RefundRepository.findForSubmission(refundId);
  if (!refund || !["APPROVED", "SUBMITTING", "UNKNOWN"].includes(refund.status)) return;

  await RefundRepository.markSubmitting(refundId);

  try {
    const existing = (await razorpay.listRefunds(refund.providerPaymentId)).find((r) => r.receipt === refundId);
    const providerRefund =
      existing ??
      (await razorpay.createRefund({
        paymentId: refund.providerPaymentId,
        amountPaise: refund.amountPaise,
        receipt: refundId,
        notes: { orderId: refund.orderId, reason: refund.reason.slice(0, 200) },
      }));

    const status = providerRefund.status === "processed" ? "PROCESSED" : providerRefund.status === "failed" ? "FAILED" : "PENDING";
    await RefundRepository.applyProviderResult({ refundId, providerRefundId: providerRefund.id, status });
    if (status === "PENDING") {
      await JobRepository.enqueue(JobKind.REFUND_STATUS_CHECK, { refundId }, {
        runAt: new Date(Date.now() + REFUND_STATUS_RECHECK_MS),
        dedupeKey: `refund-check:${refundId}:${Date.now()}`,
      });
    }
  } catch (err) {
    if (err instanceof ProviderRejectedError) {
      // Definite rejection (e.g. payment already fully refunded, amount invalid): stop and alert
      await RefundRepository.applyProviderResult({ refundId, status: "FAILED", failureReason: err.body || err.message });
      return;
    }
    if (err instanceof ProviderUnavailableError) {
      await RefundRepository.applyProviderResult({ refundId, status: "UNKNOWN" });
    }
    throw err; // retried with backoff by the job runner
  }
}

export async function handleRefundStatusCheck(job: ClaimedJob, razorpay = new RazorpayAdapter()): Promise<void> {
  const refundId = str(job.payload, "refundId");
  const refund = await RefundRepository.findForSubmission(refundId);
  if (!refund || refund.status !== "PENDING" || !refund.providerRefundId) return;
  const latest = await razorpay.fetchRefund(refund.providerPaymentId, refund.providerRefundId);
  if (latest.status === "processed" || latest.status === "failed") {
    await RefundRepository.applyProviderResult({
      refundId,
      providerRefundId: latest.id,
      status: latest.status === "processed" ? "PROCESSED" : "FAILED",
    });
  } else {
    await JobRepository.enqueue(JobKind.REFUND_STATUS_CHECK, { refundId }, {
      runAt: new Date(Date.now() + REFUND_STATUS_RECHECK_MS),
      dedupeKey: `refund-check:${refundId}:${Date.now()}`,
    });
  }
}

/** Periodic housekeeping; safe to run on several workers (each step is idempotent). */
export async function handleMaintenance(): Promise<void> {
  const pool = getDbPool();
  const offline = await RiderRepository.markStaleRidersOffline(5);
  // Retention: transient rows that only matter for a short window
  await pool.query(`DELETE FROM quotes q WHERE q.created_at < NOW() - INTERVAL '3 days'
                     AND NOT EXISTS (SELECT 1 FROM orders o WHERE o.quote_id = q.id)`);
  await pool.query(`DELETE FROM idempotency_records WHERE created_at < NOW() - INTERVAL '7 days'`);
  await pool.query(`DELETE FROM jobs WHERE status = 'COMPLETED' AND updated_at < NOW() - INTERVAL '7 days'`);
  await pool.query(`DELETE FROM outbox_events WHERE status = 'PROCESSED' AND processed_at < NOW() - INTERVAL '7 days'`);
  await pool.query(`DELETE FROM webhook_inbox WHERE status IN ('PROCESSED', 'IGNORED') AND created_at < NOW() - INTERVAL '30 days'`);
  // Safety net: paid orders waiting for a rider whose dispatch job chain was lost
  const orphaned = await pool.query(
    `SELECT o.id FROM orders o
      WHERE o.fulfillment_state = ANY($1::text[])
        AND o.updated_at < NOW() - INTERVAL '3 minutes'
        AND NOT EXISTS (SELECT 1 FROM delivery_assignments da WHERE da.order_id = o.id
                         AND da.status IN ('ASSIGNED', 'AT_PICKUP', 'PICKED_UP', 'AT_DROPOFF'))
        AND NOT EXISTS (SELECT 1 FROM jobs j WHERE j.kind = 'DISPATCH_ORDER' AND j.status IN ('PENDING', 'PROCESSING')
                         AND j.payload_json->>'orderId' = o.id::text)
      LIMIT 100`,
    [["ACCEPTED", "PREPARING", "READY_FOR_PICKUP"]]
  );
  for (const row of orphaned.rows) {
    await JobRepository.enqueue(JobKind.DISPATCH_ORDER, { orderId: row.id, attempt: 0 }, {
      dedupeKey: `dispatch:${row.id}:sweep:${Math.floor(Date.now() / 60000)}`,
    });
  }
  if (offline || orphaned.rows.length) {
    logger.info("maintenance", { ridersMarkedOffline: offline, dispatchRequeued: orphaned.rows.length });
  }
}

export const JOB_HANDLERS: Record<string, (job: ClaimedJob) => Promise<void>> = {
  [JobKind.MERCHANT_ACCEPTANCE_TIMEOUT]: handleMerchantAcceptanceTimeout,
  [JobKind.PAYMENT_EXPIRY]: (job) => handlePaymentExpiry(job),
  [JobKind.DISPATCH_ORDER]: handleDispatchOrder,
  [JobKind.DISPATCH_OFFER_TIMEOUT]: handleDispatchOfferTimeout,
  [JobKind.REFUND_SUBMIT]: (job) => handleRefundSubmit(job),
  [JobKind.REFUND_STATUS_CHECK]: (job) => handleRefundStatusCheck(job),
  [JobKind.MAINTENANCE]: () => handleMaintenance(),
};

export { DomainError };

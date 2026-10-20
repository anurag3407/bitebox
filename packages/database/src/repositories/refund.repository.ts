import type { PoolClient } from "pg";
import { DomainError, LedgerEngine } from "@startup/core";
import { getDbPool, withTransaction } from "../client.js";
import { JobKind, JobRepository } from "./job.repository.js";
import { LedgerRepository } from "./ledger.repository.js";
import { OutboxRepository } from "./outbox.repository.js";

export interface IssueRefundInput {
  orderId: string;
  // Omitted = full remaining refundable balance of the payment
  amountPaise?: number;
  reason: string;
  initiatedBy: string; // e.g. "SYSTEM", "ADMIN:<userId>", "MERCHANT:<userId>"
  // Defaults to the order's primary (first) captured payment
  paymentId?: string;
  // Duplicate captures are refunded without touching the order's refunded balance
  isDuplicateCapture?: boolean;
}

export interface IssuedRefund {
  refundId: string;
  paymentId: string;
  amountPaise: number;
  remainingRefundablePaise: number;
}

export interface RefundForSubmission {
  id: string;
  orderId: string;
  status: string;
  amountPaise: number;
  reason: string;
  providerRefundId: string | null;
  providerPaymentId: string;
}

export class RefundRepository {
  /**
   * Creates an approved refund against a captured payment and queues its submission
   * to the gateway. Must run inside a transaction that already holds the order row lock
   * (SELECT ... FOR UPDATE) so concurrent refunds cannot exceed the captured amount.
   * Returns null when there is nothing to refund (no capture, or fully refunded).
   */
  static async issueWithClient(client: PoolClient, input: IssueRefundInput): Promise<IssuedRefund | null> {
    const paymentRes = input.paymentId
      ? await client.query(
          `SELECT id, amount_paise FROM payments WHERE id = $1 AND order_id = $2 AND status = 'CAPTURED' FOR UPDATE`,
          [input.paymentId, input.orderId]
        )
      : await client.query(
          `SELECT id, amount_paise FROM payments
            WHERE order_id = $1 AND status = 'CAPTURED'
            ORDER BY captured_at ASC, id ASC
            LIMIT 1
            FOR UPDATE`,
          [input.orderId]
        );
    const payment = paymentRes.rows[0];
    if (!payment) return null;

    const refundedRes = await client.query(
      `SELECT COALESCE(SUM(amount_paise), 0)::int AS refunded
         FROM refunds WHERE payment_id = $1 AND status <> 'FAILED'`,
      [payment.id]
    );
    const remaining = payment.amount_paise - refundedRes.rows[0].refunded;
    if (remaining <= 0) return null;

    const amount = input.amountPaise ?? remaining;
    if (!Number.isInteger(amount) || amount <= 0) {
      throw new DomainError("VALIDATION_ERROR", "Refund amount must be a positive amount in paise.");
    }
    if (amount > remaining) {
      throw new DomainError(
        "VALIDATION_ERROR",
        `Refund of ₹${amount / 100} exceeds the refundable balance of ₹${remaining / 100}.`,
        { details: { remainingRefundablePaise: remaining } }
      );
    }

    const refundRes = await client.query(
      `INSERT INTO refunds (id, order_id, payment_id, status, amount_paise, reason, initiated_by)
       VALUES (gen_random_uuid(), $1, $2, 'APPROVED', $3, $4, $5)
       RETURNING id`,
      [input.orderId, payment.id, amount, input.reason, input.initiatedBy]
    );
    const refundId: string = refundRes.rows[0].id;

    await LedgerRepository.postTransactionWithClient(client, {
      orderId: input.orderId,
      paymentId: payment.id,
      refundId,
      effectType: "REFUND",
      entries: LedgerEngine.buildRefundEntries(amount, input.reason),
    });

    if (!input.isDuplicateCapture) {
      await RefundRepository.refreshOrderRefundTotalsWithClient(client, input.orderId);
    }

    await JobRepository.enqueueWithClient(client, JobKind.REFUND_SUBMIT, { refundId }, {
      dedupeKey: `refund-submit:${refundId}`,
      maxAttempts: 10,
    });
    await OutboxRepository.appendWithClient(client, "refund.approved", input.orderId, 0, {
      orderId: input.orderId,
      refundId,
      amountPaise: amount,
    });

    return { refundId, paymentId: payment.id, amountPaise: amount, remainingRefundablePaise: remaining - amount };
  }

  /** Recomputes orders.refunded_paise and payment_status from the primary payment's refunds. */
  static async refreshOrderRefundTotalsWithClient(client: Pick<PoolClient, "query">, orderId: string): Promise<void> {
    await client.query(
      `WITH primary_payment AS (
         SELECT id, amount_paise FROM payments
          WHERE order_id = $1 AND status = 'CAPTURED'
          ORDER BY captured_at ASC, id ASC LIMIT 1
       ), refunded AS (
         SELECT COALESCE(SUM(r.amount_paise), 0)::int AS total
           FROM refunds r JOIN primary_payment p ON r.payment_id = p.id
          WHERE r.status <> 'FAILED'
       )
       UPDATE orders o
          SET refunded_paise = LEAST(refunded.total, o.payable_paise),
              payment_status = CASE
                WHEN NOT EXISTS (SELECT 1 FROM primary_payment) THEN o.payment_status
                WHEN refunded.total = 0 THEN 'CAPTURED'
                WHEN refunded.total >= (SELECT amount_paise FROM primary_payment) THEN 'REFUNDED'
                ELSE 'PARTIALLY_REFUNDED'
              END,
              updated_at = NOW()
         FROM refunded
        WHERE o.id = $1`,
      [orderId]
    );
  }

  static async findForSubmission(refundId: string): Promise<RefundForSubmission | null> {
    const res = await getDbPool().query(
      `SELECT r.id, r.order_id, r.status, r.amount_paise, r.reason, r.provider_refund_id,
              p.provider_payment_id
         FROM refunds r JOIN payments p ON p.id = r.payment_id
        WHERE r.id = $1`,
      [refundId]
    );
    const r = res.rows[0];
    if (!r) return null;
    return {
      id: r.id,
      orderId: r.order_id,
      status: r.status,
      amountPaise: r.amount_paise,
      reason: r.reason,
      providerRefundId: r.provider_refund_id,
      providerPaymentId: r.provider_payment_id,
    };
  }

  static async markSubmitting(refundId: string): Promise<boolean> {
    const res = await getDbPool().query(
      `UPDATE refunds SET status = 'SUBMITTING', submitted_at = COALESCE(submitted_at, NOW()), updated_at = NOW()
        WHERE id = $1 AND status IN ('APPROVED', 'SUBMITTING', 'UNKNOWN')`,
      [refundId]
    );
    return (res.rowCount ?? 0) > 0;
  }

  /**
   * Applies a gateway outcome. FAILED refunds release their amount back to the
   * refundable balance; the ledger is reversed so books stay correct.
   */
  static async applyProviderResult(input: {
    refundId?: string;
    providerRefundId?: string;
    status: "PENDING" | "PROCESSED" | "FAILED" | "UNKNOWN";
    failureReason?: string;
  }): Promise<{ orderId: string; changed: boolean } | null> {
    if (!input.refundId && !input.providerRefundId) return null;
    return withTransaction(async (client) => {
      const res = await client.query(
        // Our own id is authoritative; the provider id is only used when we lack it (webhooks)
        input.refundId
          ? `SELECT id, order_id, payment_id, status, amount_paise, reason FROM refunds WHERE id = $1 FOR UPDATE`
          : `SELECT id, order_id, payment_id, status, amount_paise, reason FROM refunds WHERE provider_refund_id = $1 FOR UPDATE`,
        [input.refundId ?? input.providerRefundId]
      );
      const refund = res.rows[0];
      if (!refund) return null;
      // Terminal states never move again (webhooks can arrive late or out of order)
      if (refund.status === "PROCESSED" || refund.status === "FAILED" || refund.status === input.status) {
        if (input.providerRefundId && refund.status !== "FAILED") {
          await client.query(`UPDATE refunds SET provider_refund_id = COALESCE(provider_refund_id, $2) WHERE id = $1`, [
            refund.id,
            input.providerRefundId,
          ]);
        }
        return { orderId: refund.order_id, changed: false };
      }

      await client.query(
        `UPDATE refunds
            SET status = $2,
                provider_refund_id = COALESCE($3, provider_refund_id),
                failure_reason = $4,
                processed_at = CASE WHEN $2 = 'PROCESSED' THEN NOW() ELSE processed_at END,
                updated_at = NOW()
          WHERE id = $1`,
        [refund.id, input.status, input.providerRefundId ?? null, input.failureReason ?? null]
      );

      if (input.status === "FAILED") {
        // Reverse the refund posting: money never left the gateway
        await LedgerRepository.postTransactionWithClient(client, {
          orderId: refund.order_id,
          paymentId: refund.payment_id,
          refundId: refund.id,
          effectType: "REFUND",
          entries: LedgerEngine.buildRefundEntries(refund.amount_paise, `Reversal: ${refund.reason}`).map((e) => ({
            ...e,
            debitPaise: e.creditPaise,
            creditPaise: e.debitPaise,
          })),
        });
        await client.query(`SELECT id FROM orders WHERE id = $1 FOR UPDATE`, [refund.order_id]);
        await RefundRepository.refreshOrderRefundTotalsWithClient(client, refund.order_id);
      }

      await OutboxRepository.appendWithClient(client, `refund.${input.status.toLowerCase()}`, refund.order_id, 0, {
        orderId: refund.order_id,
        refundId: refund.id,
        amountPaise: refund.amount_paise,
        failureReason: input.failureReason,
      });
      return { orderId: refund.order_id, changed: true };
    });
  }

  static async listForOrder(orderId: string) {
    const res = await getDbPool().query(
      `SELECT id, status, amount_paise, reason, provider_refund_id, created_at, processed_at
         FROM refunds WHERE order_id = $1 ORDER BY created_at`,
      [orderId]
    );
    return res.rows.map((r) => ({
      id: r.id as string,
      status: r.status as string,
      amountPaise: r.amount_paise as number,
      reason: r.reason as string,
      providerRefundId: (r.provider_refund_id as string | null) ?? undefined,
      createdAt: (r.created_at as Date).toISOString(),
      processedAt: (r.processed_at as Date | null)?.toISOString(),
    }));
  }
}

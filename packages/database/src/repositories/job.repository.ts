import type { PoolClient } from "pg";
import { getDbPool } from "../client.js";

export interface ClaimedJob {
  id: string;
  kind: string;
  payload: Record<string, unknown>;
  attemptCount: number;
  maxAttempts: number;
}

export const JobKind = {
  MERCHANT_ACCEPTANCE_TIMEOUT: "MERCHANT_ACCEPTANCE_TIMEOUT",
  DISPATCH_ORDER: "DISPATCH_ORDER",
  DISPATCH_OFFER_TIMEOUT: "DISPATCH_OFFER_TIMEOUT",
  PAYMENT_EXPIRY: "PAYMENT_EXPIRY",
  REFUND_SUBMIT: "REFUND_SUBMIT",
  REFUND_STATUS_CHECK: "REFUND_STATUS_CHECK",
  MAINTENANCE: "MAINTENANCE",
  PAYOUT_SUBMIT: "PAYOUT_SUBMIT",
  PAYOUT_STATUS_CHECK: "PAYOUT_STATUS_CHECK",
  WEEKLY_SETTLEMENT: "WEEKLY_SETTLEMENT",
  ISSUE_INVOICE: "ISSUE_INVOICE",
  ISSUE_CREDIT_NOTE: "ISSUE_CREDIT_NOTE",
  MEAL_PASS_DAILY_GENERATION: "MEAL_PASS_DAILY_GENERATION",
  ADDON_UPSELL: "ADDON_UPSELL",
  LOCK_DISPATCH_BATCH: "LOCK_DISPATCH_BATCH",
} as const;
export type JobKind = (typeof JobKind)[keyof typeof JobKind];

type Queryable = Pick<PoolClient, "query">;

export interface EnqueueOptions {
  runAt?: Date;
  // Jobs sharing a dedupe key are enqueued once; later inserts are ignored.
  dedupeKey?: string;
  maxAttempts?: number;
}

export class JobRepository {
  /**
   * Atomically claims eligible jobs using PostgreSQL SKIP LOCKED. Jobs whose lease
   * expired (worker crashed mid-run) are reclaimed.
   */
  static async claimRunnableJobs(
    workerId: string,
    limit: number = 10,
    leaseSeconds: number = 30
  ): Promise<ClaimedJob[]> {
    const pool = getDbPool();
    const res = await pool.query(
      `UPDATE jobs
          SET status = 'PROCESSING',
              lease_owner = $1,
              lease_expires_at = NOW() + make_interval(secs => $3),
              attempt_count = attempt_count + 1,
              updated_at = NOW()
        WHERE id IN (
          SELECT id FROM jobs
           WHERE (status = 'PENDING' AND run_at <= NOW())
              OR (status = 'PROCESSING' AND lease_expires_at < NOW())
           -- Customer-facing timers first: a backlog of reconciliation work must not delay dispatch
           ORDER BY (kind IN ('DISPATCH_ORDER', 'DISPATCH_OFFER_TIMEOUT', 'MERCHANT_ACCEPTANCE_TIMEOUT')) DESC, run_at ASC
           LIMIT $2
           FOR UPDATE SKIP LOCKED
        )
        RETURNING id, kind, payload_json, attempt_count, max_attempts`,
      [workerId, limit, leaseSeconds]
    );

    return res.rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      payload: r.payload_json,
      attemptCount: r.attempt_count,
      maxAttempts: r.max_attempts,
    }));
  }

  /** Extends the lease of a long-running job so another worker does not steal it. */
  static async renewLease(jobId: string, leaseOwner: string, leaseSeconds = 30): Promise<boolean> {
    const res = await getDbPool().query(
      `UPDATE jobs SET lease_expires_at = NOW() + make_interval(secs => $3), updated_at = NOW()
        WHERE id = $1 AND lease_owner = $2 AND status = 'PROCESSING'`,
      [jobId, leaseOwner, leaseSeconds]
    );
    return (res.rowCount ?? 0) > 0;
  }

  static async completeJob(jobId: string, leaseOwner: string): Promise<void> {
    const pool = getDbPool();
    await pool.query(
      `UPDATE jobs
       SET status = 'COMPLETED',
           lease_owner = NULL,
           lease_expires_at = NULL,
           last_error = NULL,
           updated_at = NOW()
       WHERE id = $1 AND lease_owner = $2`,
      [jobId, leaseOwner]
    );
  }

  static async failJob(jobId: string, leaseOwner: string, error: string): Promise<"RETRY" | "FAILED"> {
    const pool = getDbPool();
    // Exponential backoff: 2 ^ attemptCount * 10 seconds, capped at ~10 minutes
    const res = await pool.query(
      `UPDATE jobs
       SET status = CASE WHEN attempt_count >= max_attempts THEN 'FAILED' ELSE 'PENDING' END,
           run_at = NOW() + (POWER(2, LEAST(attempt_count, 6)) * INTERVAL '10 seconds'),
           lease_owner = NULL,
           lease_expires_at = NULL,
           last_error = LEFT($3, 2000),
           updated_at = NOW()
       WHERE id = $1 AND lease_owner = $2
       RETURNING status`,
      [jobId, leaseOwner, error]
    );
    return res.rows[0]?.status === "FAILED" ? "FAILED" : "RETRY";
  }

  /** Enqueues inside the caller's transaction so the job exists iff the business change commits. */
  static async enqueueWithClient(
    client: Queryable,
    kind: JobKind | string,
    payload: Record<string, unknown>,
    options: EnqueueOptions = {}
  ): Promise<string | null> {
    const res = await client.query(
      `INSERT INTO jobs (id, kind, payload_json, status, run_at, dedupe_key, max_attempts)
       VALUES (gen_random_uuid(), $1, $2, 'PENDING', $3, $4, $5)
       ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING
       RETURNING id`,
      [
        kind,
        JSON.stringify(payload),
        (options.runAt ?? new Date()).toISOString(),
        options.dedupeKey ?? null,
        options.maxAttempts ?? 5,
      ]
    );
    return res.rows[0]?.id ?? null;
  }

  static async enqueue(
    kind: JobKind | string,
    payload: Record<string, unknown>,
    runAtOrOptions?: Date | EnqueueOptions
  ): Promise<string | null> {
    const options = runAtOrOptions instanceof Date ? { runAt: runAtOrOptions } : runAtOrOptions ?? {};
    return JobRepository.enqueueWithClient(getDbPool(), kind, payload, options);
  }

  static async stats(): Promise<Array<{ kind: string; status: string; count: number }>> {
    const res = await getDbPool().query(
      `SELECT kind, status, COUNT(*)::int AS count FROM jobs
        WHERE status IN ('PENDING', 'PROCESSING', 'FAILED')
        GROUP BY kind, status ORDER BY kind, status`
    );
    return res.rows;
  }
}

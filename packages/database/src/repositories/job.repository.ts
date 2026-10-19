import { getDbPool } from "../client.js";

export interface ClaimedJob {
  id: string;
  kind: string;
  payload: Record<string, unknown>;
  attemptCount: number;
  maxAttempts: number;
}

export class JobRepository {
  /**
   * Atomically claims eligible jobs using PostgreSQL SKIP LOCKED.
   */
  static async claimRunnableJobs(
    workerId: string,
    limit: number = 10,
    leaseSeconds: number = 30
  ): Promise<ClaimedJob[]> {
    const pool = getDbPool();
    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const res = await client.query(
        `SELECT id, kind, payload_json, attempt_count, max_attempts
         FROM jobs
         WHERE (status = 'PENDING' AND run_at <= NOW())
            OR (status = 'PROCESSING' AND lease_expires_at < NOW())
         ORDER BY run_at ASC
         LIMIT $1
         FOR UPDATE SKIP LOCKED`,
        [limit]
      );

      if (res.rows.length === 0) {
        await client.query("COMMIT");
        return [];
      }

      const ids = res.rows.map((r) => r.id);
      const leaseExpiresAt = new Date(Date.now() + leaseSeconds * 1000);

      await client.query(
        `UPDATE jobs
         SET status = 'PROCESSING',
             lease_owner = $1,
             lease_expires_at = $2,
             attempt_count = attempt_count + 1,
             updated_at = NOW()
         WHERE id = ANY($3::uuid[])`,
        [workerId, leaseExpiresAt.toISOString(), ids]
      );

      await client.query("COMMIT");

      return res.rows.map((r) => ({
        id: r.id,
        kind: r.kind,
        payload: r.payload_json,
        attemptCount: r.attempt_count + 1,
        maxAttempts: r.max_attempts,
      }));
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  static async completeJob(jobId: string, leaseOwner: string): Promise<void> {
    const pool = getDbPool();
    await pool.query(
      `UPDATE jobs
       SET status = 'COMPLETED',
           lease_owner = NULL,
           lease_expires_at = NULL,
           updated_at = NOW()
       WHERE id = $1 AND lease_owner = $2`,
      [jobId, leaseOwner]
    );
  }

  static async failJob(jobId: string, leaseOwner: string, error: string): Promise<void> {
    const pool = getDbPool();
    // Exponential backoff: 2 ^ attemptCount * 10 seconds
    await pool.query(
      `UPDATE jobs
       SET status = CASE WHEN attempt_count >= max_attempts THEN 'FAILED' ELSE 'PENDING' END,
           run_at = NOW() + (POWER(2, LEAST(attempt_count, 6)) * INTERVAL '10 seconds'),
           lease_owner = NULL,
           lease_expires_at = NULL,
           updated_at = NOW()
       WHERE id = $1 AND lease_owner = $2`,
      [jobId, leaseOwner]
    );
  }

  static async enqueue(kind: string, payload: Record<string, unknown>, runAt?: Date): Promise<string> {
    const pool = getDbPool();
    const res = await pool.query(
      `INSERT INTO jobs (id, kind, payload_json, status, run_at)
       VALUES (gen_random_uuid(), $1, $2, 'PENDING', $3)
       RETURNING id`,
      [kind, JSON.stringify(payload), runAt ? runAt.toISOString() : new Date().toISOString()]
    );
    return res.rows[0].id;
  }
}

import type { PoolClient } from "pg";
import { getDbPool } from "../client.js";

type Queryable = Pick<PoolClient, "query">;

export interface ClaimedOutboxEvent {
  id: string;
  eventType: string;
  aggregateId: string;
  aggregateVersion: number;
  payload: Record<string, unknown>;
  attempts: number;
  createdAt: Date;
}

export class OutboxRepository {
  static readonly MAX_ATTEMPTS = 8;

  /** Records a domain event inside the caller's transaction (transactional outbox). */
  static async appendWithClient(
    client: Queryable,
    eventType: string,
    aggregateId: string,
    aggregateVersion: number,
    payload: Record<string, unknown>
  ): Promise<void> {
    await client.query(
      `INSERT INTO outbox_events (id, event_type, aggregate_id, aggregate_version, payload_json, status)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, 'PENDING')`,
      [eventType, aggregateId, aggregateVersion, JSON.stringify(payload)]
    );
  }

  /**
   * Claims a batch for publishing. Rows are pushed out by `available_at` while
   * claimed so a crashed publisher's batch becomes visible again after the lease.
   */
  static async claimBatch(limit = 50, leaseSeconds = 60): Promise<ClaimedOutboxEvent[]> {
    const res = await getDbPool().query(
      `UPDATE outbox_events
          SET available_at = NOW() + make_interval(secs => $2),
              attempts = attempts + 1
        WHERE id IN (
          SELECT id FROM outbox_events
           WHERE status = 'PENDING' AND available_at <= NOW()
           ORDER BY created_at
           LIMIT $1
           FOR UPDATE SKIP LOCKED
        )
        RETURNING id, event_type, aggregate_id, aggregate_version, payload_json, attempts, created_at`,
      [limit, leaseSeconds]
    );
    return res.rows
      .map((r) => ({
        id: r.id,
        eventType: r.event_type,
        aggregateId: r.aggregate_id,
        aggregateVersion: r.aggregate_version,
        payload: r.payload_json,
        attempts: r.attempts,
        createdAt: r.created_at,
      }))
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  static async markProcessed(id: string): Promise<void> {
    await getDbPool().query(
      `UPDATE outbox_events SET status = 'PROCESSED', processed_at = NOW(), last_error = NULL WHERE id = $1`,
      [id]
    );
  }

  static async markFailed(id: string, error: string): Promise<void> {
    await getDbPool().query(
      `UPDATE outbox_events
          SET status = CASE WHEN attempts >= $3 THEN 'FAILED' ELSE 'PENDING' END,
              available_at = NOW() + (POWER(2, LEAST(attempts, 8)) * INTERVAL '5 seconds'),
              last_error = LEFT($2, 2000)
        WHERE id = $1`,
      [id, error, OutboxRepository.MAX_ATTEMPTS]
    );
  }

  static async backlog(): Promise<{ pending: number; failed: number; oldestPendingSeconds: number | null }> {
    const res = await getDbPool().query(
      `SELECT COUNT(*) FILTER (WHERE status = 'PENDING')::int AS pending,
              COUNT(*) FILTER (WHERE status = 'FAILED')::int AS failed,
              EXTRACT(EPOCH FROM NOW() - MIN(created_at) FILTER (WHERE status = 'PENDING'))::int AS oldest
         FROM outbox_events`
    );
    const row = res.rows[0];
    return { pending: row.pending, failed: row.failed, oldestPendingSeconds: row.oldest };
  }
}

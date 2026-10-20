import { getDbPool } from "../client.js";

export type InboxClaim =
  | { state: "NEW" | "RETRY"; id: string }
  | { state: "ALREADY_PROCESSED"; id: string };

export class WebhookInboxRepository {
  /**
   * Records a provider event. Redeliveries of an event that previously failed (or
   * crashed mid-processing) are handed back for another attempt; only events that
   * completed are acknowledged as duplicates.
   */
  static async receive(input: {
    provider: string;
    providerEventId: string;
    eventType?: string;
    payload: unknown;
  }): Promise<InboxClaim> {
    const pool = getDbPool();
    const inserted = await pool.query(
      `INSERT INTO webhook_inbox (id, provider, provider_event_id, event_type, payload_json, status, attempts)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, 'PENDING', 1)
       ON CONFLICT (provider, provider_event_id) DO NOTHING
       RETURNING id`,
      [input.provider, input.providerEventId, input.eventType ?? null, JSON.stringify(input.payload)]
    );
    if (inserted.rows[0]) return { state: "NEW", id: inserted.rows[0].id };

    const existing = await pool.query(
      `UPDATE webhook_inbox SET attempts = attempts + 1
        WHERE provider = $1 AND provider_event_id = $2
        RETURNING id, status`,
      [input.provider, input.providerEventId]
    );
    const row = existing.rows[0];
    return row.status === "PROCESSED" || row.status === "IGNORED"
      ? { state: "ALREADY_PROCESSED", id: row.id }
      : { state: "RETRY", id: row.id };
  }

  static async markProcessed(id: string, status: "PROCESSED" | "IGNORED" = "PROCESSED"): Promise<void> {
    await getDbPool().query(
      `UPDATE webhook_inbox SET status = $2, processed_at = NOW(), last_error = NULL WHERE id = $1`,
      [id, status]
    );
  }

  static async markFailed(id: string, error: string): Promise<void> {
    await getDbPool().query(`UPDATE webhook_inbox SET status = 'FAILED', last_error = LEFT($2, 2000) WHERE id = $1`, [
      id,
      error,
    ]);
  }
}

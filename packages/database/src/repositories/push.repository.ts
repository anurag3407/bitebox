import { PushSubscriptionRequest } from "@startup/contracts";
import { getDbPool } from "../client.js";

export interface StoredPushSubscription {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

export class PushSubscriptionRepository {
  static readonly MAX_PER_USER = 10;

  /** An endpoint belongs to one browser; re-subscribing from another account moves it. */
  static async upsert(userId: string, sub: PushSubscriptionRequest, userAgent?: string): Promise<void> {
    const pool = getDbPool();
    await pool.query(
      `INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth, user_agent)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5)
       ON CONFLICT (endpoint) DO UPDATE
         SET user_id = EXCLUDED.user_id, p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth,
             user_agent = EXCLUDED.user_agent`,
      [userId, sub.endpoint, sub.keys.p256dh, sub.keys.auth, userAgent?.slice(0, 300) ?? null]
    );
    // Cap stale devices per user
    await pool.query(
      `DELETE FROM push_subscriptions WHERE id IN (
         SELECT id FROM push_subscriptions WHERE user_id = $1
          ORDER BY COALESCE(last_success_at, created_at) DESC OFFSET $2)`,
      [userId, PushSubscriptionRepository.MAX_PER_USER]
    );
  }

  static async remove(userId: string, endpoint: string): Promise<void> {
    await getDbPool().query(`DELETE FROM push_subscriptions WHERE user_id = $1 AND endpoint = $2`, [userId, endpoint]);
  }

  static async listForUser(userId: string): Promise<StoredPushSubscription[]> {
    const res = await getDbPool().query(
      `SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = $1`,
      [userId]
    );
    return res.rows;
  }

  static async markSuccess(id: string): Promise<void> {
    await getDbPool().query(`UPDATE push_subscriptions SET last_success_at = NOW() WHERE id = $1`, [id]);
  }

  /** Called when the push service reports the subscription as gone (404/410). */
  static async deleteById(id: string): Promise<void> {
    await getDbPool().query(`DELETE FROM push_subscriptions WHERE id = $1`, [id]);
  }
}

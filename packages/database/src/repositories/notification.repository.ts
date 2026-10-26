import { getDbPool } from "../client.js";

export interface NotificationRow {
  id: string;
  kind: string;
  title: string;
  body: string;
  url?: string;
  readAt?: string;
  createdAt: string;
}

export interface NotificationList {
  notifications: NotificationRow[];
  unreadCount: number;
}

function mapNotification(r: any): NotificationRow {
  return {
    id: r.id,
    kind: r.kind,
    title: r.title,
    body: r.body,
    url: r.url ?? undefined,
    readAt: (r.read_at as Date | null)?.toISOString(),
    createdAt: (r.created_at as Date).toISOString(),
  };
}

export class NotificationRepository {
  /** Idempotent when a dedupe key is supplied (outbox handlers can retry safely). */
  static async create(
    userId: string,
    input: { kind: string; title: string; body: string; url?: string; dedupeKey?: string }
  ): Promise<void> {
    if (input.dedupeKey) {
      const existing = await getDbPool().query(
        `SELECT 1 FROM user_notifications WHERE user_id = $1 AND dedupe_key = $2`,
        [userId, input.dedupeKey]
      );
      if (existing.rows.length > 0) return;
    }
    await getDbPool().query(
      `INSERT INTO user_notifications (user_id, kind, title, body, url, dedupe_key)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (user_id, dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING`,
      [userId, input.kind, input.title, input.body, input.url ?? null, input.dedupeKey ?? null]
    );
  }

  static async listForUser(userId: string, options: { limit?: number; before?: string } = {}): Promise<NotificationList> {
    const limit = Math.min(options.limit ?? 30, 100);
    const [rows, unread] = await Promise.all([
      getDbPool().query(
        `SELECT * FROM user_notifications
          WHERE user_id = $1 AND ($2::timestamptz IS NULL OR created_at < $2::timestamptz)
          ORDER BY created_at DESC, id DESC LIMIT $3`,
        [userId, options.before ?? null, limit]
      ),
      getDbPool().query(
        `SELECT COUNT(*)::int AS count FROM user_notifications WHERE user_id = $1 AND read_at IS NULL`,
        [userId]
      ),
    ]);
    return { notifications: rows.rows.map(mapNotification), unreadCount: unread.rows[0].count as number };
  }

  static async markRead(userId: string, ids?: string[]): Promise<number> {
    const res = ids && ids.length > 0
      ? await getDbPool().query(
          `UPDATE user_notifications SET read_at = NOW()
            WHERE user_id = $1 AND id = ANY($2::uuid[]) AND read_at IS NULL`,
          [userId, ids]
        )
      : await getDbPool().query(
          `UPDATE user_notifications SET read_at = NOW() WHERE user_id = $1 AND read_at IS NULL`,
          [userId]
        );
    return res.rowCount ?? 0;
  }
}

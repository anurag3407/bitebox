import type { PoolClient } from "pg";
import { getDbPool } from "../client.js";

type Queryable = Pick<PoolClient, "query">;

/** Append-only record of privileged actions (role changes, approvals, payouts, refunds). */
export class AuditRepository {
  static async logWithClient(
    client: Queryable,
    entry: { adminUserId: string; action: string; targetType: string; targetId: string; details?: Record<string, unknown> }
  ): Promise<void> {
    await client.query(
      `INSERT INTO admin_audit_log (admin_user_id, action, target_type, target_id, details_json) VALUES ($1, $2, $3, $4, $5)`,
      [entry.adminUserId, entry.action, entry.targetType, entry.targetId, entry.details ? JSON.stringify(entry.details) : null]
    );
  }

  static async listForTarget(targetType: string, targetId: string) {
    const res = await getDbPool().query(
      `SELECT l.action, l.details_json, l.created_at, u.name AS admin_name
         FROM admin_audit_log l JOIN app_users u ON u.id = l.admin_user_id
        WHERE l.target_type = $1 AND l.target_id = $2 ORDER BY l.created_at DESC LIMIT 50`,
      [targetType, targetId]
    );
    return res.rows.map((r) => ({
      action: r.action as string,
      details: r.details_json as Record<string, unknown> | null,
      adminName: r.admin_name as string,
      createdAt: (r.created_at as Date).toISOString(),
    }));
  }
}

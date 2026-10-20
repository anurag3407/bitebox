import { DomainError } from "@startup/core";
import { getDbPool, withTransaction } from "../client.js";

export class CallLogRepository {
  static async log(entry: {
    orderId: string;
    callerUserId: string;
    callerRole: string;
    target: string;
    mode: "BRIDGED" | "DIRECT";
    providerCallId?: string;
    status: string;
  }): Promise<void> {
    await getDbPool().query(
      `INSERT INTO call_logs (order_id, caller_user_id, caller_role, target, mode, provider_call_id, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [entry.orderId, entry.callerUserId, entry.callerRole, entry.target, entry.mode, entry.providerCallId ?? null, entry.status]
    );
  }
}

/** DPDP Act data-principal rights: access (export) and erasure. */
export class PrivacyRepository {
  static async exportUserData(userId: string) {
    const pool = getDbPool();
    const [user, addresses, orders, ratings, tickets] = await Promise.all([
      pool.query(`SELECT id, name, email, phone, role, created_at FROM app_users WHERE id = $1`, [userId]),
      pool.query(`SELECT label, building, street, landmark, latitude, longitude, contact_phone, created_at FROM customer_addresses WHERE user_id = $1 AND deleted_at IS NULL`, [userId]),
      pool.query(
        `SELECT o.order_number, r.name AS restaurant, o.items_json, o.payable_paise, o.fulfillment_state, o.created_at
           FROM orders o JOIN restaurants r ON r.id = o.restaurant_id WHERE o.customer_id = $1 ORDER BY o.created_at DESC`,
        [userId]
      ),
      pool.query(`SELECT food_rating, delivery_rating, comment, created_at FROM order_ratings WHERE customer_id = $1`, [userId]),
      pool.query(
        `SELECT t.category, t.status, t.created_at, COALESCE(json_agg(json_build_object('from', m.sender_type, 'body', m.body, 'at', m.created_at) ORDER BY m.created_at) FILTER (WHERE m.id IS NOT NULL), '[]') AS messages
           FROM support_tickets t LEFT JOIN support_messages m ON m.ticket_id = t.id WHERE t.customer_id = $1 GROUP BY t.id`,
        [userId]
      ),
    ]);
    return {
      exportedAt: new Date().toISOString(),
      profile: user.rows[0],
      addresses: addresses.rows,
      orders: orders.rows,
      ratings: ratings.rows,
      supportConversations: tickets.rows,
    };
  }

  /**
   * Erases personal data. Order and invoice records are kept (tax law) but detached from
   * identifiable details. Refused while an order is in progress or for partner accounts.
   */
  static async deleteAccount(userId: string): Promise<{ clerkUserId: string }> {
    return withTransaction(async (client) => {
      const res = await client.query(`SELECT clerk_user_id, role FROM app_users WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`, [userId]);
      const user = res.rows[0];
      if (!user) throw new DomainError("NOT_FOUND", "Account not found");
      if (user.role !== "CUSTOMER") throw new DomainError("CONFLICT", "Partner accounts are closed through support so payouts can be settled.");
      const active = await client.query(
        `SELECT 1 FROM orders WHERE customer_id = $1 AND fulfillment_state NOT IN ('DELIVERED', 'CANCELLED', 'DELIVERY_FAILED') LIMIT 1`,
        [userId]
      );
      if (active.rows.length) throw new DomainError("STATE_CONFLICT", "You have an order in progress. Try again once it is complete.");

      await client.query(
        `UPDATE customer_addresses SET building = 'Deleted', street = 'Deleted', landmark = NULL, contact_phone = NULL,
                deleted_at = COALESCE(deleted_at, NOW()), is_default = false WHERE user_id = $1`,
        [userId]
      );
      await client.query(
        `UPDATE orders SET delivery_address_snapshot = jsonb_set(COALESCE(delivery_address_snapshot, '{}'::jsonb), '{contactPhone}', 'null'),
                instructions = NULL WHERE customer_id = $1`,
        [userId]
      );
      await client.query(`DELETE FROM push_subscriptions WHERE user_id = $1`, [userId]);
      await client.query(`DELETE FROM user_favorites WHERE user_id = $1`, [userId]);
      await client.query(`UPDATE order_ratings SET comment = NULL WHERE customer_id = $1`, [userId]);
      await client.query(
        `UPDATE app_users SET name = 'Deleted user', email = NULL, phone = NULL, clerk_user_id = 'deleted_' || id,
                is_active = false, deleted_at = NOW(), updated_at = NOW() WHERE id = $1`,
        [userId]
      );
      return { clerkUserId: user.clerk_user_id as string };
    });
  }
}

import { UserRole } from "@startup/contracts";
import { DomainError } from "@startup/core";
import { getDbPool, withTransaction } from "../client.js";
import { AuditRepository } from "./audit.repository.js";

export interface AdminUserRow {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: UserRole;
  isActive: boolean;
  createdAt: string;
  restaurants: string[];
  riderId?: string;
}

export class AdminUserRepository {
  static async search(query: string, limit = 50): Promise<AdminUserRow[]> {
    const q = `%${query.trim().replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    const res = await getDbPool().query(
      `SELECT u.id, u.name, u.email, u.phone, u.role, u.is_active, u.created_at,
              COALESCE(ARRAY(SELECT r.name FROM merchant_memberships m JOIN restaurants r ON r.id = m.restaurant_id
                              WHERE m.user_id = u.id AND m.is_active), '{}') AS restaurants,
              (SELECT id FROM riders WHERE user_id = u.id) AS rider_id
         FROM app_users u
        WHERE u.deleted_at IS NULL
          AND ($1 = '%%' OR u.name ILIKE $1 OR u.email ILIKE $1 OR u.phone ILIKE $1)
        ORDER BY u.created_at DESC
        LIMIT $2`,
      [q, Math.min(limit, 200)]
    );
    return res.rows.map((r) => ({
      id: r.id,
      name: r.name,
      email: r.email,
      phone: r.phone,
      role: r.role,
      isActive: r.is_active,
      createdAt: (r.created_at as Date).toISOString(),
      restaurants: r.restaurants,
      riderId: r.rider_id ?? undefined,
    }));
  }

  /**
   * Changes a user's role or active flag. Side effects keep data consistent: demoted riders go
   * offline and lose approval; demoted staff lose memberships. Admins cannot change themselves.
   */
  static async update(input: { userId: string; adminId: string; role?: UserRole; isActive?: boolean; reason: string }): Promise<void> {
    if (input.userId === input.adminId) throw new DomainError("FORBIDDEN", "You cannot change your own account here.");
    await withTransaction(async (client) => {
      const res = await client.query(`SELECT role, is_active FROM app_users WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`, [input.userId]);
      const user = res.rows[0];
      if (!user) throw new DomainError("NOT_FOUND", "User not found");

      const leavingRider = user.role === UserRole.RIDER && (input.role && input.role !== UserRole.RIDER || input.isActive === false);
      if (leavingRider) {
        const active = await client.query(
          `SELECT 1 FROM delivery_assignments da JOIN riders r ON r.id = da.rider_id
            WHERE r.user_id = $1 AND da.status IN ('ASSIGNED', 'AT_PICKUP', 'PICKED_UP', 'AT_DROPOFF')`,
          [input.userId]
        );
        if (active.rows.length) throw new DomainError("STATE_CONFLICT", "Rider is on an active delivery. Try again after it completes.");
        await client.query(`UPDATE riders SET is_online = false, is_approved = $2 WHERE user_id = $1`, [input.userId, input.role === UserRole.RIDER]);
        await client.query(
          `UPDATE delivery_offers SET status = 'REVOKED' WHERE status = 'OFFERED' AND rider_id IN (SELECT id FROM riders WHERE user_id = $1)`,
          [input.userId]
        );
      }
      if (input.role === UserRole.RIDER) {
        const rider = await client.query(`UPDATE riders SET is_approved = true WHERE user_id = $1 RETURNING id`, [input.userId]);
        if (!rider.rows[0]) throw new DomainError("VALIDATION_ERROR", "Create the rider through a partner application first.");
      }
      if (user.role === UserRole.MERCHANT_STAFF && input.role && input.role !== UserRole.MERCHANT_STAFF) {
        await client.query(`UPDATE merchant_memberships SET is_active = false WHERE user_id = $1`, [input.userId]);
      }

      await client.query(
        `UPDATE app_users SET role = COALESCE($2, role), is_active = COALESCE($3, is_active), updated_at = NOW() WHERE id = $1`,
        [input.userId, input.role ?? null, input.isActive ?? null]
      );
      await AuditRepository.logWithClient(client, {
        adminUserId: input.adminId,
        action: "USER_UPDATED",
        targetType: "user",
        targetId: input.userId,
        details: { from: { role: user.role, isActive: user.is_active }, to: { role: input.role, isActive: input.isActive }, reason: input.reason },
      });
    });
  }

  /** Restaurant owners add existing users (by email) as staff of their outlet. */
  static async addStaff(input: { restaurantId: string; email: string; staffRole: string; addedBy: string }): Promise<void> {
    await withTransaction(async (client) => {
      const res = await client.query(`SELECT id, role FROM app_users WHERE email = $1 AND deleted_at IS NULL FOR UPDATE`, [
        input.email.toLowerCase(),
      ]);
      const user = res.rows[0];
      if (!user) throw new DomainError("NOT_FOUND", "No account with that email. Ask them to sign up first.");
      if (user.role !== UserRole.CUSTOMER && user.role !== UserRole.MERCHANT_STAFF) {
        throw new DomainError("CONFLICT", "That account already has a different partner role.");
      }
      await client.query(
        `INSERT INTO merchant_memberships (user_id, restaurant_id, staff_role) VALUES ($1, $2, $3)
         ON CONFLICT (user_id, restaurant_id) DO UPDATE SET staff_role = EXCLUDED.staff_role, is_active = true`,
        [user.id, input.restaurantId, input.staffRole]
      );
      await client.query(`UPDATE app_users SET role = 'MERCHANT_STAFF', updated_at = NOW() WHERE id = $1`, [user.id]);
    });
  }

  static async listStaff(restaurantId: string) {
    const res = await getDbPool().query(
      `SELECT u.id, u.name, u.email, m.staff_role FROM merchant_memberships m JOIN app_users u ON u.id = m.user_id
        WHERE m.restaurant_id = $1 AND m.is_active ORDER BY m.staff_role, u.name`,
      [restaurantId]
    );
    return res.rows.map((r) => ({ userId: r.id as string, name: r.name as string, email: r.email as string | null, staffRole: r.staff_role as string }));
  }

  static async removeStaff(restaurantId: string, userId: string): Promise<void> {
    const res = await getDbPool().query(
      `UPDATE merchant_memberships SET is_active = false WHERE restaurant_id = $1 AND user_id = $2 AND staff_role <> 'OWNER' RETURNING id`,
      [restaurantId, userId]
    );
    if (!res.rows[0]) throw new DomainError("NOT_FOUND", "Staff member not found (owners cannot be removed here)");
  }
}

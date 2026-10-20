import { eq } from "drizzle-orm";
import { UserRole } from "@startup/contracts";
import { getDb, getDbPool } from "../client.js";
import { appUsers } from "../schema/schema.js";

export type AppUser = typeof appUsers.$inferSelect;

export class UserRepository {
  static async findByClerkId(clerkUserId: string): Promise<AppUser | null> {
    const [row] = await getDb().select().from(appUsers).where(eq(appUsers.clerkUserId, clerkUserId)).limit(1);
    return row ?? null;
  }

  static async findById(id: string): Promise<AppUser | null> {
    const [row] = await getDb().select().from(appUsers).where(eq(appUsers.id, id)).limit(1);
    return row ?? null;
  }

  /**
   * First-seen identities become CUSTOMERs. Roles are only ever granted server-side
   * (seed/admin tooling), never from token claims. Safe under concurrent first requests.
   */
  static async upsertFromIdentity(identity: {
    clerkUserId: string;
    email?: string | null;
    name?: string | null;
    phone?: string | null;
    role?: UserRole;
  }): Promise<AppUser> {
    const res = await getDbPool().query(
      `INSERT INTO app_users (id, clerk_user_id, name, email, phone, role)
       VALUES (
         gen_random_uuid(), $1, $2,
         -- Another account may already own this email (e.g. a recreated Clerk user)
         CASE WHEN $3::text IS NOT NULL AND NOT EXISTS (SELECT 1 FROM app_users WHERE email = $3) THEN $3 ELSE NULL END,
         $4, $5
       )
       ON CONFLICT (clerk_user_id) DO UPDATE SET updated_at = app_users.updated_at
       RETURNING *`,
      [
        identity.clerkUserId,
        identity.name?.trim() || "Foodie",
        identity.email?.trim().toLowerCase() || null,
        identity.phone ?? null,
        identity.role ?? UserRole.CUSTOMER,
      ]
    );
    const r = res.rows[0];
    return {
      id: r.id,
      clerkUserId: r.clerk_user_id,
      name: r.name,
      email: r.email,
      phone: r.phone,
      role: r.role,
      isActive: r.is_active,
      deletedAt: r.deleted_at,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  }

  static async getContact(userId: string): Promise<{ name: string; email: string | null; phone: string | null } | null> {
    const res = await getDbPool().query(`SELECT name, email, phone FROM app_users WHERE id = $1`, [userId]);
    return res.rows[0] ?? null;
  }
}

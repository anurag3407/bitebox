import { AddressDto, CreateAddressRequest } from "@startup/contracts";
import { DomainError } from "@startup/core";
import { getDbPool, withTransaction } from "../client.js";

export const MAX_ADDRESSES_PER_USER = 20;

function mapRow(r: any): AddressDto & { userId: string } {
  return {
    id: r.id,
    userId: r.user_id,
    label: r.label,
    building: r.building,
    street: r.street,
    landmark: r.landmark ?? undefined,
    latitude: r.latitude,
    longitude: r.longitude,
    isDefault: r.is_default,
    contactPhone: r.contact_phone ?? undefined,
  };
}

function normalizePhone(phone?: string): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "").slice(-10);
  return digits.length === 10 ? `+91${digits}` : null;
}

export class AddressRepository {
  static async listByUser(userId: string): Promise<AddressDto[]> {
    const res = await getDbPool().query(
      `SELECT * FROM customer_addresses
        WHERE user_id = $1 AND deleted_at IS NULL
        ORDER BY is_default DESC, created_at DESC`,
      [userId]
    );
    return res.rows.map((r) => {
      const { userId: _u, ...dto } = mapRow(r);
      return dto;
    });
  }

  /** Includes soft-deleted rows: historical orders still reference them. */
  static async findById(id: string): Promise<(AddressDto & { userId: string; isDeleted: boolean }) | null> {
    const res = await getDbPool().query(`SELECT * FROM customer_addresses WHERE id = $1`, [id]);
    const row = res.rows[0];
    return row ? { ...mapRow(row), isDeleted: row.deleted_at !== null } : null;
  }

  static async create(userId: string, data: CreateAddressRequest): Promise<AddressDto> {
    return withTransaction(async (client) => {
      // Serialize per user so the "one default" index and the cap are race-free
      await client.query(`SELECT id FROM app_users WHERE id = $1 FOR UPDATE`, [userId]);
      const count = await client.query(
        `SELECT COUNT(*)::int AS n, BOOL_OR(is_default) AS has_default
           FROM customer_addresses WHERE user_id = $1 AND deleted_at IS NULL`,
        [userId]
      );
      if (count.rows[0].n >= MAX_ADDRESSES_PER_USER) {
        throw new DomainError("VALIDATION_ERROR", `You can save up to ${MAX_ADDRESSES_PER_USER} addresses.`);
      }
      // The first address is always the default
      const makeDefault = data.isDefault || !count.rows[0].has_default;
      if (makeDefault) {
        await client.query(
          `UPDATE customer_addresses SET is_default = false, updated_at = NOW() WHERE user_id = $1 AND is_default`,
          [userId]
        );
      }
      const res = await client.query(
        `INSERT INTO customer_addresses (id, user_id, label, building, street, landmark, latitude, longitude, is_default, contact_phone)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING *`,
        [
          userId,
          data.label,
          data.building,
          data.street,
          data.landmark || null,
          data.latitude,
          data.longitude,
          makeDefault,
          normalizePhone(data.contactPhone),
        ]
      );
      const { userId: _u, ...dto } = mapRow(res.rows[0]);
      return dto;
    });
  }

  static async update(userId: string, addressId: string, data: CreateAddressRequest): Promise<AddressDto> {
    return withTransaction(async (client) => {
      if (data.isDefault) {
        await client.query(
          `UPDATE customer_addresses SET is_default = false, updated_at = NOW()
            WHERE user_id = $1 AND is_default AND id <> $2`,
          [userId, addressId]
        );
      }
      const res = await client.query(
        `UPDATE customer_addresses
            SET label = $3, building = $4, street = $5, landmark = $6, latitude = $7, longitude = $8,
                is_default = is_default OR $9, contact_phone = $10, updated_at = NOW()
          WHERE id = $2 AND user_id = $1 AND deleted_at IS NULL
          RETURNING *`,
        [
          userId,
          addressId,
          data.label,
          data.building,
          data.street,
          data.landmark || null,
          data.latitude,
          data.longitude,
          data.isDefault,
          normalizePhone(data.contactPhone),
        ]
      );
      if (!res.rows[0]) throw new DomainError("NOT_FOUND", "Address not found");
      const { userId: _u, ...dto } = mapRow(res.rows[0]);
      return dto;
    });
  }

  static async setDefault(userId: string, addressId: string): Promise<void> {
    await withTransaction(async (client) => {
      const target = await client.query(
        `SELECT id FROM customer_addresses WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL FOR UPDATE`,
        [addressId, userId]
      );
      if (!target.rows[0]) throw new DomainError("NOT_FOUND", "Address not found");
      await client.query(`UPDATE customer_addresses SET is_default = false WHERE user_id = $1 AND is_default`, [userId]);
      await client.query(`UPDATE customer_addresses SET is_default = true, updated_at = NOW() WHERE id = $1`, [addressId]);
    });
  }

  /** Soft delete: past orders keep pointing at the row. Promotes another address to default. */
  static async delete(userId: string, addressId: string): Promise<void> {
    await withTransaction(async (client) => {
      const res = await client.query(
        `UPDATE customer_addresses SET deleted_at = NOW(), is_default = false, updated_at = NOW()
          WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL
          RETURNING id`,
        [addressId, userId]
      );
      if (!res.rows[0]) throw new DomainError("NOT_FOUND", "Address not found");
      await client.query(
        `UPDATE customer_addresses SET is_default = true
          WHERE id = (SELECT id FROM customer_addresses WHERE user_id = $1 AND deleted_at IS NULL
                       ORDER BY created_at DESC LIMIT 1)
            AND NOT EXISTS (SELECT 1 FROM customer_addresses WHERE user_id = $1 AND deleted_at IS NULL AND is_default)`,
        [userId]
      );
    });
  }
}

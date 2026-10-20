import type { PoolClient } from "pg";
import { Coordinate, MerchantApplication, RiderApplication, UserRole } from "@startup/contracts";
import { DomainError, ServiceabilityPolicy } from "@startup/core";
import { getDbPool, withTransaction } from "../client.js";
import { AuditRepository } from "./audit.repository.js";

export type PartnerType = "MERCHANT" | "RIDER";

export interface PartnerApplicationRow {
  id: string;
  userId: string;
  applicantName: string;
  applicantEmail: string | null;
  type: PartnerType;
  status: "SUBMITTED" | "APPROVED" | "REJECTED";
  details: MerchantApplication | RiderApplication;
  reviewNote?: string;
  createdAt: string;
  reviewedAt?: string;
  restaurantId?: string;
}

function mapRow(r: any): PartnerApplicationRow {
  return {
    id: r.id,
    userId: r.user_id,
    applicantName: r.applicant_name,
    applicantEmail: r.applicant_email,
    type: r.type,
    status: r.status,
    details: r.details_json,
    reviewNote: r.review_note ?? undefined,
    createdAt: (r.created_at as Date).toISOString(),
    reviewedAt: (r.reviewed_at as Date | null)?.toISOString(),
    restaurantId: r.restaurant_id ?? undefined,
  };
}

const SELECT = `SELECT a.*, u.name AS applicant_name, u.email AS applicant_email
                  FROM partner_applications a JOIN app_users u ON u.id = a.user_id`;

function slugify(name: string): string {
  return name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50) || "restaurant";
}

async function uniqueSlug(client: Pick<PoolClient, "query">, base: string): Promise<string> {
  for (let i = 0; i < 20; i++) {
    const slug = i === 0 ? base : `${base}-${i + 1}`;
    const exists = await client.query(`SELECT 1 FROM restaurants WHERE slug = $1`, [slug]);
    if (exists.rows.length === 0) return slug;
  }
  return `${base}-${Date.now().toString(36)}`;
}

export class PartnerRepository {
  static async submit(userId: string, type: PartnerType, details: MerchantApplication | RiderApplication): Promise<PartnerApplicationRow> {
    const user = await getDbPool().query(`SELECT role FROM app_users WHERE id = $1`, [userId]);
    const role = user.rows[0]?.role as UserRole | undefined;
    // One role per account: riders must not also be restaurant staff (and vice versa)
    if (type === "RIDER" && role !== UserRole.CUSTOMER) {
      throw new DomainError("CONFLICT", "This account already has a partner role. Use a separate account to deliver.");
    }
    if (type === "MERCHANT" && role !== UserRole.CUSTOMER && role !== UserRole.MERCHANT_STAFF) {
      throw new DomainError("CONFLICT", "This account cannot register a restaurant.");
    }
    try {
      const res = await getDbPool().query(
        `INSERT INTO partner_applications (user_id, type, details_json) VALUES ($1, $2, $3) RETURNING id`,
        [userId, type, JSON.stringify(details)]
      );
      return (await PartnerRepository.findById(res.rows[0].id))!;
    } catch (err) {
      if ((err as { code?: string }).code === "23505") {
        throw new DomainError("CONFLICT", "You already have an application under review.");
      }
      throw err;
    }
  }

  static async findById(id: string): Promise<PartnerApplicationRow | null> {
    const res = await getDbPool().query(`${SELECT} WHERE a.id = $1`, [id]);
    return res.rows[0] ? mapRow(res.rows[0]) : null;
  }

  static async listForUser(userId: string): Promise<PartnerApplicationRow[]> {
    const res = await getDbPool().query(`${SELECT} WHERE a.user_id = $1 ORDER BY a.created_at DESC`, [userId]);
    return res.rows.map(mapRow);
  }

  static async listForAdmin(status: "SUBMITTED" | "APPROVED" | "REJECTED" = "SUBMITTED"): Promise<PartnerApplicationRow[]> {
    const res = await getDbPool().query(`${SELECT} WHERE a.status = $1 ORDER BY a.created_at ASC LIMIT 200`, [status]);
    return res.rows.map(mapRow);
  }

  /**
   * Approves an application and provisions the partner in one transaction: merchant +
   * restaurant (paused until the menu is ready) + owner membership, or a rider profile.
   */
  static async approve(applicationId: string, adminId: string, note?: string): Promise<PartnerApplicationRow> {
    await withTransaction(async (client) => {
      const res = await client.query(`SELECT * FROM partner_applications WHERE id = $1 FOR UPDATE`, [applicationId]);
      const app = res.rows[0];
      if (!app) throw new DomainError("NOT_FOUND", "Application not found");
      if (app.status !== "SUBMITTED") throw new DomainError("STATE_CONFLICT", `Application is already ${app.status.toLowerCase()}`);
      const userRes = await client.query(`SELECT id, role FROM app_users WHERE id = $1 FOR UPDATE`, [app.user_id]);
      const user = userRes.rows[0];

      if (app.type === "MERCHANT") {
        const d = app.details_json as MerchantApplication;
        const zones = await client.query(`SELECT id, city_id, polygon_geojson FROM service_zones WHERE is_active`);
        const zone = zones.rows.find((z) =>
          ServiceabilityPolicy.isPointInPolygon(d.location, (z.polygon_geojson as Coordinate[]) ?? [])
        );
        if (!zone) throw new DomainError("SERVICEABILITY_ERROR", "The restaurant is outside every active service zone.");

        const merchant = await client.query(
          `INSERT INTO merchants (legal_business_name, fssai_license_number, contact_email, contact_phone, is_verified, gstin, pan, owner_user_id)
           VALUES ($1, $2, $3, $4, true, $5, $6, $7) RETURNING id`,
          [d.legalBusinessName, d.fssaiLicenseNumber, d.contactEmail, d.contactPhone, d.gstin ?? null, d.pan, user.id]
        );
        const restaurant = await client.query(
          `INSERT INTO restaurants (merchant_id, city_id, service_zone_id, name, slug, cuisines, rating, rating_count,
                                    avg_price_for_one_paise, latitude, longitude, address_text, phone, pure_veg,
                                    is_open, is_accepting_orders, gstin, fssai_license_number)
           VALUES ($1, $2, $3, $4, $5, $6, 0, 0, $7, $8, $9, $10, $11, $12, true, false, $13, $14) RETURNING id`,
          [
            merchant.rows[0].id,
            zone.city_id,
            zone.id,
            d.restaurantName,
            await uniqueSlug(client, slugify(d.restaurantName)),
            d.cuisines,
            d.avgPriceForOnePaise,
            d.location.latitude,
            d.location.longitude,
            d.addressText,
            d.contactPhone,
            d.pureVeg,
            d.gstin ?? null,
            d.fssaiLicenseNumber,
          ]
        );
        await client.query(
          `INSERT INTO merchant_memberships (user_id, restaurant_id, staff_role) VALUES ($1, $2, 'OWNER')
           ON CONFLICT (user_id, restaurant_id) DO UPDATE SET is_active = true, staff_role = 'OWNER'`,
          [user.id, restaurant.rows[0].id]
        );
        if (user.role === UserRole.CUSTOMER) {
          await client.query(`UPDATE app_users SET role = 'MERCHANT_STAFF', updated_at = NOW() WHERE id = $1`, [user.id]);
        }
        await client.query(
          `UPDATE partner_applications SET merchant_id = $2, restaurant_id = $3 WHERE id = $1`,
          [applicationId, merchant.rows[0].id, restaurant.rows[0].id]
        );
      } else {
        const d = app.details_json as RiderApplication;
        if (user.role !== UserRole.CUSTOMER) throw new DomainError("CONFLICT", "Applicant already holds another role");
        const rider = await client.query(
          `INSERT INTO riders (user_id, name, phone, vehicle_type, vehicle_number, driving_license_number, is_approved, is_online)
           VALUES ($1, $2, $3, $4, $5, $6, true, false)
           ON CONFLICT (user_id) DO UPDATE SET is_approved = true RETURNING id`,
          [user.id, d.fullName, d.phone.startsWith("+") ? d.phone : `+91${d.phone.slice(-10)}`, d.vehicleType, d.vehicleNumber ?? null, d.drivingLicenseNumber ?? null]
        );
        await client.query(`UPDATE app_users SET role = 'RIDER', updated_at = NOW() WHERE id = $1`, [user.id]);
        await client.query(`UPDATE partner_applications SET rider_id = $2 WHERE id = $1`, [applicationId, rider.rows[0].id]);
      }

      await client.query(
        `UPDATE partner_applications SET status = 'APPROVED', reviewed_by = $2, review_note = $3, reviewed_at = NOW(), updated_at = NOW()
          WHERE id = $1`,
        [applicationId, adminId, note ?? null]
      );
      await AuditRepository.logWithClient(client, {
        adminUserId: adminId,
        action: "PARTNER_APPROVED",
        targetType: "partner_application",
        targetId: applicationId,
        details: { type: app.type, note },
      });
    });
    return (await PartnerRepository.findById(applicationId))!;
  }

  static async reject(applicationId: string, adminId: string, note?: string): Promise<PartnerApplicationRow> {
    await withTransaction(async (client) => {
      const res = await client.query(
        `UPDATE partner_applications SET status = 'REJECTED', reviewed_by = $2, review_note = $3, reviewed_at = NOW(), updated_at = NOW()
          WHERE id = $1 AND status = 'SUBMITTED' RETURNING id`,
        [applicationId, adminId, note ?? null]
      );
      if (!res.rows[0]) throw new DomainError("STATE_CONFLICT", "Application is not awaiting review");
      await AuditRepository.logWithClient(client, {
        adminUserId: adminId,
        action: "PARTNER_REJECTED",
        targetType: "partner_application",
        targetId: applicationId,
        details: { note },
      });
    });
    return (await PartnerRepository.findById(applicationId))!;
  }
}

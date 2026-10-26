import { getDbPool, withTransaction } from "../client.js";
import { WalletRepository } from "./wallet.repository.js";
import { LedgerAccountType } from "@startup/core";

export const EQUIPMENT_REPLACEMENT_FEES: Record<string, number> = {
  HELMET: 50_000, // ₹500
  DELIVERY_BAG: 80_000, // ₹800
  T_SHIRT: 25_000, // ₹250
  INSURANCE_CARD: 10_000, // ₹100
};

export interface RiderEquipmentRow {
  id: string;
  riderId: string;
  itemType: string;
  size?: string;
  status: string;
  notes?: string;
  issuedAt: string;
  updatedAt: string;
  renewalDueAt?: string;
  replacementFeePaise: number;
  replacementFeeDeducted: boolean;
  renewalStatus: "VALID" | "DUE_SOON" | "EXPIRED";
}

function computeRenewalStatus(dueAt: Date | null, status: string): "VALID" | "DUE_SOON" | "EXPIRED" {
  if (status !== "ISSUED" || !dueAt) return "VALID";
  const now = Date.now();
  const diff = dueAt.getTime() - now;
  if (diff < 0) return "EXPIRED";
  if (diff < 14 * 86_400_000) return "DUE_SOON";
  return "VALID";
}

function mapRow(r: any): RiderEquipmentRow {
  const dueAt = r.renewal_due_at ? new Date(r.renewal_due_at) : null;
  return {
    id: r.id,
    riderId: r.rider_id,
    itemType: r.item_type,
    size: r.size ?? undefined,
    status: r.status,
    notes: r.notes ?? undefined,
    issuedAt: (r.issued_at as Date).toISOString(),
    updatedAt: (r.updated_at as Date).toISOString(),
    renewalDueAt: dueAt?.toISOString(),
    replacementFeePaise: Number(r.replacement_fee_paise ?? 0),
    replacementFeeDeducted: Boolean(r.replacement_fee_deducted),
    renewalStatus: computeRenewalStatus(dueAt, r.status),
  };
}

export class RiderEquipmentRepository {
  static async listForRider(riderId: string): Promise<RiderEquipmentRow[]> {
    const res = await getDbPool().query(
      `SELECT * FROM rider_equipment WHERE rider_id = $1 ORDER BY issued_at DESC`,
      [riderId]
    );
    return res.rows.map(mapRow);
  }

  static async issue(input: {
    riderId: string;
    itemType: "HELMET" | "DELIVERY_BAG" | "T_SHIRT" | "INSURANCE_CARD";
    size?: string;
    notes?: string;
    adminId: string;
  }): Promise<RiderEquipmentRow> {
    const res = await getDbPool().query(
      `INSERT INTO rider_equipment (rider_id, item_type, size, notes, issued_by, status, renewal_due_at)
       VALUES ($1, $2, $3, $4, $5, 'ISSUED', NOW() + INTERVAL '180 days')
       ON CONFLICT (rider_id, item_type) DO UPDATE SET
         size = EXCLUDED.size, notes = EXCLUDED.notes, issued_by = EXCLUDED.issued_by,
         status = 'ISSUED', issued_at = NOW(), updated_at = NOW(),
         renewal_due_at = NOW() + INTERVAL '180 days',
         replacement_fee_paise = 0, replacement_fee_deducted = false
       RETURNING *`,
      [input.riderId, input.itemType, input.size?.trim() || null, input.notes?.trim() || null, input.adminId]
    );
    return mapRow(res.rows[0]);
  }

  static async renew(input: {
    riderId: string;
    itemType: string;
    adminId?: string;
  }): Promise<RiderEquipmentRow | null> {
    const res = await getDbPool().query(
      `UPDATE rider_equipment
          SET status = 'ISSUED', issued_at = NOW(), renewal_due_at = NOW() + INTERVAL '180 days',
              issued_by = COALESCE($3, issued_by), updated_at = NOW()
        WHERE rider_id = $1 AND item_type = $2
        RETURNING *`,
      [input.riderId, input.itemType, input.adminId ?? null]
    );
    return res.rows[0] ? mapRow(res.rows[0]) : null;
  }

  static async markStatus(input: {
    riderId: string;
    itemType: string;
    status: "RETURNED" | "LOST";
    chargeRider?: boolean;
    adminId?: string;
  }): Promise<RiderEquipmentRow | null> {
    const feePaise = input.status === "LOST" && input.chargeRider ? (EQUIPMENT_REPLACEMENT_FEES[input.itemType] ?? 0) : 0;
    
    if (feePaise > 0) {
      return withTransaction(async (client) => {
        const res = await client.query(
          `UPDATE rider_equipment
              SET status = $3, replacement_fee_paise = $4, replacement_fee_deducted = true, updated_at = NOW()
            WHERE rider_id = $1 AND item_type = $2
            RETURNING *`,
          [input.riderId, input.itemType, input.status, feePaise]
        );
        if (!res.rows[0]) return null;

        // Fetch rider user id to debit
        const riderRes = await client.query(`SELECT user_id FROM riders WHERE id = $1`, [input.riderId]);
        const userId = riderRes.rows[0]?.user_id;
        if (userId) {
          await WalletRepository.debitForPurchaseWithClient(client, {
            userId,
            amountPaise: feePaise,
            kind: "RIDER_EQUIPMENT_FEE" as any,
            referenceType: "RIDER_EQUIPMENT",
            referenceId: res.rows[0].id,
            description: `Lost kit replacement fee: ${input.itemType}`,
            counterAccount: LedgerAccountType.PLATFORM_REVENUE,
          });
        }
        return mapRow(res.rows[0]);
      });
    }

    const res = await getDbPool().query(
      `UPDATE rider_equipment SET status = $3, updated_at = NOW()
        WHERE rider_id = $1 AND item_type = $2 RETURNING *`,
      [input.riderId, input.itemType, input.status]
    );
    return res.rows[0] ? mapRow(res.rows[0]) : null;
  }
}

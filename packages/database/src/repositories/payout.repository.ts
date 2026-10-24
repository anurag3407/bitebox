import { DomainError, SettlementCalculator, buildPayoutEntries, decryptSecret, encryptSecret } from "@startup/core";
import type { QuoteBreakdown } from "@startup/contracts";
import { getDbPool, withTransaction } from "../client.js";
import { AuditRepository } from "./audit.repository.js";
import { JobKind, JobRepository } from "./job.repository.js";
import { LedgerRepository } from "./ledger.repository.js";
import { OutboxRepository } from "./outbox.repository.js";

export type PayoutOwnerType = "MERCHANT" | "RIDER";
export type PayoutStatus = "PENDING" | "MANUAL" | "PROCESSING" | "PAID" | "FAILED";

// Balances below this roll over to the next cycle (bank transfer costs)
export const MIN_PAYOUT_PAISE = 10_000;

export interface PayoutRow {
  id: string;
  ownerType: PayoutOwnerType;
  ownerId: string;
  ownerName: string;
  periodStart: string;
  periodEnd: string;
  orderCount: number;
  amountPaise: number;
  status: PayoutStatus;
  utr?: string;
  failureReason?: string;
  paidAt?: string;
  createdAt: string;
}

function mapPayout(r: any): PayoutRow {
  return {
    id: r.id,
    ownerType: r.owner_type,
    ownerId: r.owner_id,
    ownerName: r.owner_name ?? "",
    periodStart: (r.period_start as Date).toISOString(),
    periodEnd: (r.period_end as Date).toISOString(),
    orderCount: r.order_count,
    amountPaise: r.amount_paise,
    status: r.status,
    utr: r.utr ?? undefined,
    failureReason: r.failure_reason ?? undefined,
    paidAt: (r.paid_at as Date | null)?.toISOString(),
    createdAt: (r.created_at as Date).toISOString(),
  };
}

const PAYOUT_SELECT = `
  SELECT p.*, COALESCE(m.legal_business_name, rd.name) AS owner_name
    FROM payouts p
    LEFT JOIN merchants m ON p.owner_type = 'MERCHANT' AND m.id = p.owner_id
    LEFT JOIN riders rd ON p.owner_type = 'RIDER' AND rd.id = p.owner_id`;

interface Earning {
  orderId: string;
  ownerId: string;
  amountPaise: number;
  deliveredAt: Date;
}

export class PayoutRepository {
  // ---- Bank accounts ------------------------------------------------------
  static async saveAccount(
    ownerType: PayoutOwnerType,
    ownerId: string,
    input: { accountHolderName: string; ifsc: string; accountNumber: string },
    encryptionKey: string
  ): Promise<{ accountLast4: string }> {
    const last4 = input.accountNumber.slice(-4);
    await getDbPool().query(
      `INSERT INTO payout_accounts (owner_type, owner_id, account_holder_name, ifsc, account_number_encrypted, account_last4)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (owner_type, owner_id) DO UPDATE
         SET account_holder_name = EXCLUDED.account_holder_name, ifsc = EXCLUDED.ifsc,
             account_number_encrypted = EXCLUDED.account_number_encrypted, account_last4 = EXCLUDED.account_last4,
             -- New bank details need a new provider fund account
             provider_contact_id = NULL, provider_fund_account_id = NULL, updated_at = NOW()`,
      [ownerType, ownerId, input.accountHolderName, input.ifsc, encryptSecret(input.accountNumber, encryptionKey), last4]
    );
    return { accountLast4: last4 };
  }

  static async getAccount(ownerType: PayoutOwnerType, ownerId: string) {
    const res = await getDbPool().query(
      `SELECT account_holder_name, ifsc, account_last4, updated_at FROM payout_accounts WHERE owner_type = $1 AND owner_id = $2`,
      [ownerType, ownerId]
    );
    const r = res.rows[0];
    return r
      ? { accountHolderName: r.account_holder_name as string, ifsc: r.ifsc as string, accountLast4: r.account_last4 as string, updatedAt: (r.updated_at as Date).toISOString() }
      : null;
  }

  /** Decrypted details for the payout job only; never returned over HTTP. */
  static async getAccountForTransfer(ownerType: PayoutOwnerType, ownerId: string, encryptionKey: string) {
    const res = await getDbPool().query(`SELECT * FROM payout_accounts WHERE owner_type = $1 AND owner_id = $2`, [ownerType, ownerId]);
    const r = res.rows[0];
    if (!r) return null;
    return {
      id: r.id as string,
      accountHolderName: r.account_holder_name as string,
      ifsc: r.ifsc as string,
      accountNumber: decryptSecret(r.account_number_encrypted, encryptionKey),
      providerFundAccountId: r.provider_fund_account_id as string | null,
    };
  }

  static async saveProviderRefs(accountId: string, contactId: string, fundAccountId: string): Promise<void> {
    await getDbPool().query(
      `UPDATE payout_accounts SET provider_contact_id = $2, provider_fund_account_id = $3, updated_at = NOW() WHERE id = $1`,
      [accountId, contactId, fundAccountId]
    );
  }

  // ---- Earnings & settlement ---------------------------------------------
  private static async unsettledEarnings(ownerType: PayoutOwnerType, cutoff: Date, ownerId?: string): Promise<Earning[]> {
    const pool = getDbPool();
    if (ownerType === "MERCHANT") {
      const res = await pool.query(
        `SELECT o.id, o.breakdown_json, o.delivered_at, o.merchant_net_payout_paise, r.merchant_id, r.commission_bp,
                COALESCE((
                  SELECT SUM(rf.merchant_deduction_paise) FROM refunds rf
                   WHERE rf.order_id = o.id AND rf.status <> 'FAILED'
                ), 0)::int AS refund_deduction
           FROM orders o JOIN restaurants r ON r.id = o.restaurant_id
          WHERE o.fulfillment_state = 'DELIVERED' AND o.delivered_at < $1
            AND ($2::uuid IS NULL OR r.merchant_id = $2::uuid)
            AND NOT EXISTS (SELECT 1 FROM payout_items pi WHERE pi.order_id = o.id AND pi.owner_type = 'MERCHANT')`,
        [cutoff.toISOString(), ownerId ?? null]
      );
      return res.rows.map((r) => {
        const gross = r.merchant_net_payout_paise ?? SettlementCalculator.merchantEarning(r.breakdown_json as QuoteBreakdown, r.commission_bp);
        return {
          orderId: r.id,
          ownerId: r.merchant_id,
          amountPaise: Math.max(0, gross - Number(r.refund_deduction ?? 0)),
          deliveredAt: r.delivered_at,
        };
      });
    }
    const res = await pool.query(
      `SELECT o.id, o.breakdown_json, o.delivered_at, da.rider_id
         FROM orders o JOIN delivery_assignments da ON da.order_id = o.id AND da.status = 'COMPLETED'
        WHERE o.fulfillment_state = 'DELIVERED' AND o.delivered_at < $1
          AND ($2::uuid IS NULL OR da.rider_id = $2::uuid)
          AND NOT EXISTS (SELECT 1 FROM payout_items pi WHERE pi.order_id = o.id AND pi.owner_type = 'RIDER')`,
      [cutoff.toISOString(), ownerId ?? null]
    );
    return res.rows.map((r) => ({
      orderId: r.id,
      ownerId: r.rider_id,
      amountPaise: SettlementCalculator.riderEarning(r.breakdown_json as QuoteBreakdown),
      deliveredAt: r.delivered_at,
    }));
  }

  /**
   * Groups unsettled delivered orders (before `cutoff`) into one payout per partner.
   * The unique (order, owner_type) index guarantees an order is never paid twice even
   * if two settlement runs overlap; such a run simply skips that partner.
   */
  static async runSettlement(cutoff: Date, options: { automaticTransfers: boolean }): Promise<string[]> {
    const created: string[] = [];
    for (const ownerType of ["MERCHANT", "RIDER"] as const) {
      const earnings = await PayoutRepository.unsettledEarnings(ownerType, cutoff);
      const byOwner = new Map<string, Earning[]>();
      for (const e of earnings) byOwner.set(e.ownerId, [...(byOwner.get(e.ownerId) ?? []), e]);

      for (const [ownerId, items] of byOwner) {
        const amount = items.reduce((s, i) => s + i.amountPaise, 0);
        if (amount < MIN_PAYOUT_PAISE) continue;
        try {
          const payoutId = await withTransaction(async (client) => {
            const account = await client.query(`SELECT 1 FROM payout_accounts WHERE owner_type = $1 AND owner_id = $2`, [ownerType, ownerId]);
            const status: PayoutStatus = options.automaticTransfers && account.rows.length ? "PENDING" : "MANUAL";
            const res = await client.query(
              `INSERT INTO payouts (owner_type, owner_id, period_start, period_end, order_count, amount_paise, status)
               VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
              [
                ownerType,
                ownerId,
                new Date(Math.min(...items.map((i) => i.deliveredAt.getTime()))).toISOString(),
                cutoff.toISOString(),
                items.length,
                amount,
                status,
              ]
            );
            const id: string = res.rows[0].id;
            for (const item of items) {
              await client.query(
                `INSERT INTO payout_items (payout_id, order_id, owner_type, amount_paise) VALUES ($1, $2, $3, $4)`,
                [id, item.orderId, ownerType, item.amountPaise]
              );
            }
            if (status === "PENDING") {
              await JobRepository.enqueueWithClient(client, JobKind.PAYOUT_SUBMIT, { payoutId: id }, { dedupeKey: `payout-submit:${id}`, maxAttempts: 8 });
            }
            return id;
          });
          created.push(payoutId);
        } catch (err) {
          if ((err as { code?: string }).code !== "23505") throw err; // overlapping run settled it first
        }
      }
    }
    return created;
  }

  static async earningsSummary(ownerType: PayoutOwnerType, ownerId: string) {
    const unsettled = await PayoutRepository.unsettledEarnings(ownerType, new Date(), ownerId);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const payouts = await getDbPool().query(`${PAYOUT_SELECT} WHERE p.owner_type = $1 AND p.owner_id = $2 ORDER BY p.created_at DESC LIMIT 20`, [
      ownerType,
      ownerId,
    ]);
    return {
      unsettledPaise: unsettled.reduce((s, e) => s + e.amountPaise, 0),
      unsettledOrders: unsettled.length,
      todayPaise: unsettled.filter((e) => e.deliveredAt >= today).reduce((s, e) => s + e.amountPaise, 0),
      todayOrders: unsettled.filter((e) => e.deliveredAt >= today).length,
      payouts: payouts.rows.map(mapPayout),
    };
  }

  static async findById(payoutId: string): Promise<PayoutRow | null> {
    const res = await getDbPool().query(`${PAYOUT_SELECT} WHERE p.id = $1`, [payoutId]);
    return res.rows[0] ? mapPayout(res.rows[0]) : null;
  }

  static async listForAdmin(status?: PayoutStatus): Promise<PayoutRow[]> {
    const res = await getDbPool().query(`${PAYOUT_SELECT} WHERE ($1::text IS NULL OR p.status = $1) ORDER BY p.created_at DESC LIMIT 200`, [
      status ?? null,
    ]);
    return res.rows.map(mapPayout);
  }

  static async markProcessing(payoutId: string, providerPayoutId: string): Promise<void> {
    await getDbPool().query(
      `UPDATE payouts SET status = 'PROCESSING', provider_payout_id = $2, updated_at = NOW() WHERE id = $1 AND status IN ('PENDING', 'PROCESSING')`,
      [payoutId, providerPayoutId]
    );
  }

  /** Marks a payout paid exactly once and records the cash movement in the ledger. */
  static async markPaid(payoutId: string, input: { utr: string; providerPayoutId?: string; adminId?: string }): Promise<boolean> {
    return withTransaction(async (client) => {
      const res = await client.query(`SELECT * FROM payouts WHERE id = $1 FOR UPDATE`, [payoutId]);
      const payout = res.rows[0];
      if (!payout) throw new DomainError("NOT_FOUND", "Payout not found");
      if (payout.status === "PAID") return false;
      if (payout.status === "FAILED" && !input.adminId) return false;
      await client.query(
        `UPDATE payouts SET status = 'PAID', utr = $2, provider_payout_id = COALESCE($3, provider_payout_id), paid_at = NOW(), failure_reason = NULL, updated_at = NOW()
          WHERE id = $1`,
        [payoutId, input.utr, input.providerPayoutId ?? null]
      );
      await LedgerRepository.postTransactionWithClient(client, {
        effectType: "PAYOUT",
        entries: buildPayoutEntries(payout.owner_type, payout.amount_paise, input.utr),
      });
      if (input.adminId) {
        await AuditRepository.logWithClient(client, {
          adminUserId: input.adminId,
          action: "PAYOUT_MARKED_PAID",
          targetType: "payout",
          targetId: payoutId,
          details: { utr: input.utr, amountPaise: payout.amount_paise },
        });
      }
      await OutboxRepository.appendWithClient(client, "payout.paid", payoutId, 0, {
        payoutId,
        ownerType: payout.owner_type,
        ownerId: payout.owner_id,
        amountPaise: payout.amount_paise,
      });
      return true;
    });
  }

  static async markFailed(payoutId: string, reason: string): Promise<void> {
    await withTransaction(async (client) => {
      const res = await client.query(
        `UPDATE payouts SET status = 'FAILED', failure_reason = LEFT($2, 500), updated_at = NOW()
          WHERE id = $1 AND status IN ('PENDING', 'PROCESSING') RETURNING owner_type, owner_id, amount_paise`,
        [payoutId, reason]
      );
      if (res.rows[0]) {
        await OutboxRepository.appendWithClient(client, "payout.failed", payoutId, 0, { payoutId, reason, ...res.rows[0] });
      }
    });
  }

  /** After a failed transfer: ops switch to a manual bank transfer and record the UTR. */
  static async switchToManual(payoutId: string, adminId: string): Promise<void> {
    await withTransaction(async (client) => {
      const res = await client.query(
        `UPDATE payouts SET status = 'MANUAL', updated_at = NOW() WHERE id = $1 AND status = 'FAILED' RETURNING id`,
        [payoutId]
      );
      if (!res.rows[0]) throw new DomainError("STATE_CONFLICT", "Only failed payouts can be moved to manual transfer");
      await AuditRepository.logWithClient(client, { adminUserId: adminId, action: "PAYOUT_MANUAL", targetType: "payout", targetId: payoutId });
    });
  }

  static async findByProviderId(providerPayoutId: string): Promise<PayoutRow | null> {
    const res = await getDbPool().query(`${PAYOUT_SELECT} WHERE p.provider_payout_id = $1`, [providerPayoutId]);
    return res.rows[0] ? mapPayout(res.rows[0]) : null;
  }
}

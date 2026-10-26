import { randomBytes } from "node:crypto";
import type { PoolClient } from "pg";
import { ReferralStatus, WalletTransactionKind } from "@startup/contracts";
import { DomainError } from "@startup/core";
import { getDbPool, withTransaction } from "../client.js";
import { OutboxRepository } from "./outbox.repository.js";
import { WalletRepository } from "./wallet.repository.js";

export const REFERRAL = {
  referrerRewardPaise: 10_000,
  refereeRewardPaise: 5_000,
  maxInvitesPerDay: 20,
} as const;

export interface ReferralRow {
  id: string;
  code: string;
  referrerName: string;
  refereeName: string;
  status: ReferralStatus;
  referrerRewardPaise: number;
  refereeRewardPaise: number;
  qualifyingOrderId?: string;
  rewardedAt?: string;
  createdAt: string;
}

export interface ReferralSummary {
  code: string;
  shareUrl: string;
  referrerRewardPaise: number;
  refereeRewardPaise: number;
  stats: { invited: number; rewarded: number; pending: number; earnedPaise: number };
  referrals: ReferralRow[];
}

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function newCode(): string {
  const bytes = randomBytes(8);
  let body = "";
  for (const b of bytes) body += CODE_ALPHABET[b % CODE_ALPHABET.length];
  return `BX${body}`;
}

function mapReferral(r: any): ReferralRow {
  return {
    id: r.id,
    code: r.code,
    referrerName: r.referrer_name,
    refereeName: r.referee_name,
    status: r.status,
    referrerRewardPaise: r.referrer_reward_paise,
    refereeRewardPaise: r.referee_reward_paise,
    qualifyingOrderId: r.qualifying_order_id ?? undefined,
    rewardedAt: (r.rewarded_at as Date | null)?.toISOString(),
    createdAt: (r.created_at as Date).toISOString(),
  };
}

const SELECT = `
  SELECT rf.*, inviter.name AS referrer_name, invitee.name AS referee_name
    FROM referrals rf
    JOIN app_users inviter ON inviter.id = rf.referrer_user_id
    JOIN app_users invitee ON invitee.id = rf.referee_user_id`;

export class ReferralRepository {
  static async getOrCreateCode(userId: string): Promise<string> {
    const existing = await getDbPool().query(`SELECT code FROM referral_codes WHERE user_id = $1`, [userId]);
    if (existing.rows[0]) return existing.rows[0].code as string;

    for (let attempt = 0; attempt < 5; attempt++) {
      const code = newCode();
      try {
        const res = await getDbPool().query(
          `INSERT INTO referral_codes (user_id, code) VALUES ($1, $2)
           ON CONFLICT (user_id) DO NOTHING
           RETURNING code`,
          [userId, code]
        );
        if (res.rows[0]) return res.rows[0].code as string;
        const again = await getDbPool().query(`SELECT code FROM referral_codes WHERE user_id = $1`, [userId]);
        if (again.rows[0]) return again.rows[0].code as string;
      } catch (err) {
        // A code collision (unique violation) retries with a fresh code
        if ((err as { code?: string }).code !== "23505") throw err;
      }
    }
    throw new DomainError("CONFLICT", "Could not create a referral code. Please retry.");
  }

  static async getSummary(userId: string, baseUrl = ""): Promise<ReferralSummary> {
    const code = await ReferralRepository.getOrCreateCode(userId);
    const rows = await getDbPool().query(
      `${SELECT} WHERE rf.referrer_user_id = $1 ORDER BY rf.created_at DESC LIMIT 100`,
      [userId]
    );
    const referrals = rows.rows.map(mapReferral);
    return {
      code,
      shareUrl: `${baseUrl.replace(/\/$/, "")}/?ref=${code}`,
      referrerRewardPaise: REFERRAL.referrerRewardPaise,
      refereeRewardPaise: REFERRAL.refereeRewardPaise,
      stats: {
        invited: referrals.length,
        rewarded: referrals.filter((r) => r.status === ReferralStatus.REWARDED).length,
        pending: referrals.filter((r) => r.status === ReferralStatus.PENDING).length,
        earnedPaise: referrals
          .filter((r) => r.status === ReferralStatus.REWARDED)
          .reduce((sum, r) => sum + r.referrerRewardPaise, 0),
      },
      referrals,
    };
  }

  /**
   * A customer can redeem one friend's code before their first paid order. Rewards
   * land only after that first order is delivered, so refunded/failed orders never pay out.
   */
  static async applyCode(refereeUserId: string, rawCode: string): Promise<ReferralRow> {
    const code = rawCode.trim().toUpperCase();
    return withTransaction(async (client) => {
      const own = await client.query(`SELECT user_id FROM referral_codes WHERE code = $1`, [code]);
      if (!own.rows[0]) throw new DomainError("VALIDATION_ERROR", "That referral code doesn't exist.");
      if (own.rows[0].user_id === refereeUserId) {
        throw new DomainError("VALIDATION_ERROR", "You can't use your own referral code.");
      }

      const already = await client.query(`SELECT 1 FROM referrals WHERE referee_user_id = $1`, [refereeUserId]);
      if (already.rows.length > 0) throw new DomainError("CONFLICT", "You have already applied a referral code.");

      const orders = await client.query(`SELECT 1 FROM orders WHERE customer_id = $1 LIMIT 1`, [refereeUserId]);
      if (orders.rows.length > 0) {
        throw new DomainError("CONFLICT", "Referral codes can only be applied before your first order.");
      }

      const res = await client.query(
        `INSERT INTO referrals (code, referrer_user_id, referee_user_id, referrer_reward_paise, referee_reward_paise)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [code, own.rows[0].user_id, refereeUserId, REFERRAL.referrerRewardPaise, REFERRAL.refereeRewardPaise]
      );
      await OutboxRepository.appendWithClient(client, "referral.applied", res.rows[0].id, 1, {
        referralId: res.rows[0].id,
        referrerUserId: own.rows[0].user_id,
        refereeUserId,
      });
      const row = await client.query(`${SELECT} WHERE rf.id = $1`, [res.rows[0].id]);
      return mapReferral(row.rows[0]);
    });
  }

  /**
   * Called inside the delivery transaction after the order enters DELIVERED. Both
   * wallets are credited atomically; the unique wallet reference makes replays safe.
   */
  static async qualifyWithClient(
    client: PoolClient,
    input: { refereeUserId: string; orderId: string }
  ): Promise<{ rewarded: boolean; referrerUserId?: string }> {
    const pendingRes = await client.query(
      `SELECT * FROM referrals WHERE referee_user_id = $1 AND status = 'PENDING' FOR UPDATE`,
      [input.refereeUserId]
    );
    const referral = pendingRes.rows[0];
    if (!referral) return { rewarded: false };

    const orderRes = await client.query(
      `SELECT customer_id, payment_status, fulfillment_state FROM orders WHERE id = $1`,
      [input.orderId]
    );
    const order = orderRes.rows[0];
    if (!order || order.customer_id !== input.refereeUserId || order.fulfillment_state !== "DELIVERED") {
      return { rewarded: false };
    }
    if (order.payment_status === "PENDING") return { rewarded: false };

    const delivered = await client.query(
      `SELECT COUNT(*)::int AS count FROM orders WHERE customer_id = $1 AND fulfillment_state = 'DELIVERED'`,
      [input.refereeUserId]
    );
    // Only the very first delivered order unlocks the reward
    if (delivered.rows[0].count !== 1) {
      await client.query(`UPDATE referrals SET status = 'CANCELLED', updated_at = NOW() WHERE id = $1`, [referral.id]);
      return { rewarded: false };
    }

    await client.query(
      `UPDATE referrals SET status = 'QUALIFIED', qualifying_order_id = $2, updated_at = NOW() WHERE id = $1`,
      [referral.id, input.orderId]
    );
    await WalletRepository.creditWithClient(client, {
      userId: referral.referrer_user_id,
      kind: WalletTransactionKind.REFERRAL_BONUS,
      amountPaise: referral.referrer_reward_paise,
      referenceType: "REFERRAL",
      referenceId: referral.id,
      description: "Referral bonus: your friend's first order was delivered",
    });
    await WalletRepository.creditWithClient(client, {
      userId: referral.referee_user_id,
      kind: WalletTransactionKind.REFERRAL_WELCOME,
      amountPaise: referral.referee_reward_paise,
      referenceType: "REFERRAL",
      referenceId: referral.id,
      description: "Welcome reward for joining with a friend's code",
    });
    await client.query(`UPDATE referrals SET status = 'REWARDED', rewarded_at = NOW(), updated_at = NOW() WHERE id = $1`, [
      referral.id,
    ]);
    await OutboxRepository.appendWithClient(client, "referral.rewarded", referral.id, 2, {
      referralId: referral.id,
      referrerUserId: referral.referrer_user_id,
      refereeUserId: referral.referee_user_id,
      orderId: input.orderId,
      referrerRewardPaise: referral.referrer_reward_paise,
      refereeRewardPaise: referral.referee_reward_paise,
    });
    return { rewarded: true, referrerUserId: referral.referrer_user_id };
  }

  static async listForAdmin(limit = 200): Promise<ReferralRow[]> {
    const res = await getDbPool().query(`${SELECT} ORDER BY rf.created_at DESC LIMIT $1`, [limit]);
    return res.rows.map(mapReferral);
  }
}

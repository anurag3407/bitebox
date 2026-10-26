import type { PoolClient } from "pg";
import { WalletTransactionKind } from "@startup/contracts";
import { LedgerAccountType, DomainError } from "@startup/core";
import { getDbPool, withTransaction } from "../client.js";
import { LedgerRepository } from "./ledger.repository.js";
import { OutboxRepository } from "./outbox.repository.js";
import { WalletRepository } from "./wallet.repository.js";

export const LOYALTY = {
  cashbackBps: 200, // 2% of food subtotal
  cashbackCapPaise: 5_000,
  goldAfterDeliveries: 5,
} as const;

export interface MembershipOverview {
  active: {
    id: string;
    planCode: string;
    planName: string;
    description: string;
    benefits: { freeDeliveryAbovePaise?: number };
    startsAt: string;
    endsAt: string;
    source: string;
  } | null;
  plans: Array<{
    id: string;
    code: string;
    name: string;
    description: string;
    pricePaise: number;
    durationDays: number;
    benefits: { freeDeliveryAbovePaise?: number };
  }>;
  deliveredOrders: number;
  ordersToGold: number;
  cashbackEarnedPaise: number;
}

export class LoyaltyRepository {
  static async findPlan(planId: string) {
    const res = await getDbPool().query(`SELECT * FROM membership_plans WHERE id = $1 AND is_active`, [planId]);
    const row = res.rows[0];
    if (!row) return null;
    return {
      id: row.id as string,
      code: row.code as string,
      name: row.name as string,
      description: row.description as string,
      pricePaise: row.price_paise as number,
      durationDays: row.duration_days as number,
      benefits: (row.benefits_json as { freeDeliveryAbovePaise?: number }) ?? {},
    };
  }

  static async getActive(userId: string) {
    const res = await getDbPool().query(
      `SELECT m.*, p.code AS plan_code, p.name AS plan_name, p.description, p.benefits_json
         FROM user_memberships m JOIN membership_plans p ON p.id = m.plan_id
        WHERE m.user_id = $1 AND m.status = 'ACTIVE' AND m.ends_at > NOW()
        ORDER BY m.ends_at DESC LIMIT 1`,
      [userId]
    );
    const row = res.rows[0];
    if (!row) return null;
    return {
      id: row.id as string,
      planCode: row.plan_code as string,
      planName: row.plan_name as string,
      description: row.description as string,
      benefits: (row.benefits_json as { freeDeliveryAbovePaise?: number }) ?? {},
      startsAt: (row.starts_at as Date).toISOString(),
      endsAt: (row.ends_at as Date).toISOString(),
      source: row.source as string,
    };
  }

  static async getOverview(userId: string): Promise<MembershipOverview> {
    const [active, plans, delivered, cashback] = await Promise.all([
      LoyaltyRepository.getActive(userId),
      getDbPool().query(`SELECT * FROM membership_plans WHERE is_active ORDER BY price_paise, duration_days`),
      getDbPool().query(`SELECT COUNT(*)::int AS count FROM orders WHERE customer_id = $1 AND fulfillment_state = 'DELIVERED'`, [userId]),
      getDbPool().query(
        `SELECT COALESCE(SUM(amount_paise), 0)::int AS total FROM wallet_transactions WHERE user_id = $1 AND kind = 'CASHBACK'`,
        [userId]
      ),
    ]);
    const deliveredOrders = delivered.rows[0].count as number;
    return {
      active,
      plans: plans.rows.map((r) => ({
        id: r.id,
        code: r.code,
        name: r.name,
        description: r.description,
        pricePaise: r.price_paise,
        durationDays: r.duration_days,
        benefits: (r.benefits_json as { freeDeliveryAbovePaise?: number }) ?? {},
      })),
      deliveredOrders,
      ordersToGold: Math.max(0, LOYALTY.goldAfterDeliveries - deliveredOrders),
      cashbackEarnedPaise: cashback.rows[0].total as number,
    };
  }

  /**
   * Called inside the delivery transaction. Credits 2% of the food subtotal
   * idempotently, then grants Gold once the customer crosses the delivery threshold.
   */
  static async rewardDeliveryWithClient(
    client: PoolClient,
    input: { userId: string; orderId: string; subtotalPaise: number }
  ): Promise<{ cashbackPaise: number; goldGranted: boolean }> {
    const cashbackPaise = Math.min(
      LOYALTY.cashbackCapPaise,
      Math.round((input.subtotalPaise * LOYALTY.cashbackBps) / 10_000)
    );
    let credited = 0;
    if (cashbackPaise > 0) {
      const before = await client.query(
        `SELECT 1 FROM wallet_transactions WHERE user_id = $1 AND kind = 'CASHBACK' AND reference_id = $2`,
        [input.userId, input.orderId]
      );
      if (before.rows.length === 0) {
        await WalletRepository.creditWithClient(client, {
          userId: input.userId,
          kind: WalletTransactionKind.CASHBACK,
          amountPaise: cashbackPaise,
          referenceType: "ORDER",
          referenceId: input.orderId,
          description: "2% back in BiteBox Credits",
        });
        credited = cashbackPaise;
        await OutboxRepository.appendWithClient(client, "loyalty.cashback", input.orderId, 1, {
          userId: input.userId,
          orderId: input.orderId,
          cashbackPaise,
        });
      }
    }

    // Expire lapsed memberships so the partial unique index does not block a new grant
    await client.query(
      `UPDATE user_memberships SET status = 'EXPIRED' WHERE user_id = $1 AND status = 'ACTIVE' AND ends_at <= NOW()`,
      [input.userId]
    );
    const delivered = await client.query(
      `SELECT COUNT(*)::int AS count FROM orders WHERE customer_id = $1 AND fulfillment_state = 'DELIVERED'`,
      [input.userId]
    );
    const active = await client.query(
      `SELECT 1 FROM user_memberships WHERE user_id = $1 AND status = 'ACTIVE' AND ends_at > NOW()`,
      [input.userId]
    );
    let goldGranted = false;
    if (delivered.rows[0].count >= LOYALTY.goldAfterDeliveries && active.rows.length === 0) {
      const plan = await client.query(`SELECT id, duration_days FROM membership_plans WHERE code = 'GOLD' AND is_active`);
      if (plan.rows[0]) {
        const inserted = await client.query(
          `INSERT INTO user_memberships (user_id, plan_id, status, source, ends_at)
           VALUES ($1, $2, 'ACTIVE', 'EARNED', NOW() + make_interval(days => $3))
           ON CONFLICT (user_id) WHERE status = 'ACTIVE' DO NOTHING
           RETURNING id, ends_at`,
          [input.userId, plan.rows[0].id, plan.rows[0].duration_days]
        );
        if (inserted.rows[0]) {
          goldGranted = true;
          await OutboxRepository.appendWithClient(client, "membership.granted", inserted.rows[0].id, 1, {
            userId: input.userId,
            membershipId: inserted.rows[0].id,
            plan: "GOLD",
            endsAt: (inserted.rows[0].ends_at as Date).toISOString(),
          });
        }
      }
    }
    return { cashbackPaise: credited, goldGranted };
  }

  /** Activates or extends Gold inside a transaction. */
  static async activateMembershipWithClient(
    client: PoolClient,
    input: { userId: string; planCode: string; source: "EARNED" | "PURCHASED" | "PROMO" }
  ) {
    await client.query(
      `UPDATE user_memberships SET status = 'EXPIRED' WHERE user_id = $1 AND status = 'ACTIVE' AND ends_at <= NOW()`,
      [input.userId]
    );
    const plan = await client.query(`SELECT id, duration_days FROM membership_plans WHERE code = $1 AND is_active`, [
      input.planCode,
    ]);
    if (!plan.rows[0]) throw new DomainError("NOT_FOUND", "Membership plan not found");
    const extended = await client.query(
      `UPDATE user_memberships
          SET ends_at = GREATEST(ends_at, NOW()) + make_interval(days => $2), status = 'ACTIVE'
        WHERE user_id = $1 AND status = 'ACTIVE' AND ends_at > NOW()
        RETURNING id, ends_at`,
      [input.userId, plan.rows[0].duration_days]
    );
    const row = extended.rows[0] ??
      (
        await client.query(
          `INSERT INTO user_memberships (user_id, plan_id, status, source, ends_at)
           VALUES ($1, $2, 'ACTIVE', $3, NOW() + make_interval(days => $4))
           ON CONFLICT (user_id) WHERE status = 'ACTIVE' DO NOTHING
           RETURNING id, ends_at`,
          [input.userId, plan.rows[0].id, input.source, plan.rows[0].duration_days]
        )
      ).rows[0];
    if (!row) throw new DomainError("CONFLICT", "Could not activate this membership. Please retry.");
    await OutboxRepository.appendWithClient(client, "membership.granted", row.id, 1, {
      userId: input.userId,
      membershipId: row.id,
      plan: input.planCode,
      source: input.source,
      endsAt: (row.ends_at as Date).toISOString(),
    });
    return { id: row.id as string, endsAt: (row.ends_at as Date).toISOString() };
  }

  static async createPurchase(input: {
    userId: string;
    planId: string;
    razorpayOrderId: string;
    amountPaise: number;
  }) {
    const res = await getDbPool().query(
      `INSERT INTO membership_purchases (user_id, plan_id, razorpay_order_id, amount_paise)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [input.userId, input.planId, input.razorpayOrderId, input.amountPaise]
    );
    return res.rows[0];
  }

  static async findPurchase(purchaseId: string) {
    const res = await getDbPool().query(`SELECT * FROM membership_purchases WHERE id = $1`, [purchaseId]);
    return res.rows[0] ?? null;
  }

  /**
   * Marks the Razorpay purchase paid and activates Gold at most once. The ledger
   * records gateway clearing against platform revenue for the membership term.
   */
  static async completePurchase(input: { purchaseId: string; userId: string; providerPaymentId: string }) {
    return withTransaction(async (client) => {
      const res = await client.query(`SELECT * FROM membership_purchases WHERE id = $1 FOR UPDATE`, [input.purchaseId]);
      const purchase = res.rows[0];
      if (!purchase || purchase.user_id !== input.userId) throw new DomainError("NOT_FOUND", "Membership purchase not found");
      if (purchase.status === "PAID") {
        return { alreadyProcessed: true, membership: await LoyaltyRepository.getActive(input.userId) };
      }
      if (purchase.status !== "PENDING") throw new DomainError("STATE_CONFLICT", "This membership purchase is no longer payable.");
      await client.query(
        `UPDATE membership_purchases
            SET status = 'PAID', razorpay_payment_id = $2, paid_at = NOW()
          WHERE id = $1`,
        [input.purchaseId, input.providerPaymentId]
      );
      await LedgerRepository.postTransactionWithClient(client, {
        effectType: "ADJUSTMENT",
        entries: [
          {
            account: LedgerAccountType.GATEWAY_CLEARING,
            debitPaise: purchase.amount_paise,
            creditPaise: 0,
            description: "BiteBox Gold membership purchase",
          },
          {
            account: LedgerAccountType.PLATFORM_REVENUE,
            debitPaise: 0,
            creditPaise: purchase.amount_paise,
            description: "Membership revenue",
          },
        ],
      });
      const membership = await LoyaltyRepository.activateMembershipWithClient(client, {
        userId: input.userId,
        planCode: "GOLD",
        source: "PURCHASED",
      });
      await OutboxRepository.appendWithClient(client, "membership.purchased", purchase.id, 1, {
        purchaseId: purchase.id,
        userId: input.userId,
        amountPaise: purchase.amount_paise,
      });
      return { alreadyProcessed: false, membership };
    });
  }
}

import type { PoolClient } from "pg";
import type { CouponDiscountRule } from "@startup/core";
import { getDbPool } from "../client.js";

type Queryable = Pick<PoolClient, "query">;

export interface CouponRecord {
  id: string;
  code: string;
  type: CouponDiscountRule["type"];
  discountValue: number;
  maxDiscountPaise: number | null;
  minOrderPaise: number;
  isActive: boolean;
  description: string | null;
  validFrom: Date | null;
  validUntil: Date | null;
  usageLimitTotal: number | null;
  usageLimitPerUser: number | null;
  firstOrderOnly: boolean;
  restaurantId: string | null;
}

export type CouponEligibility = { ok: true; rule: CouponDiscountRule } | { ok: false; reason: string };

function mapCoupon(r: any): CouponRecord {
  return {
    id: r.id,
    code: r.code,
    type: r.type,
    discountValue: r.discount_value,
    maxDiscountPaise: r.max_discount_paise,
    minOrderPaise: r.min_order_paise,
    isActive: r.is_active,
    description: r.description,
    validFrom: r.valid_from,
    validUntil: r.valid_until,
    usageLimitTotal: r.usage_limit_total,
    usageLimitPerUser: r.usage_limit_per_user,
    firstOrderOnly: r.first_order_only,
    restaurantId: r.restaurant_id,
  };
}

export function normalizeCouponCode(code: string): string {
  return code.trim().toUpperCase();
}

export class CouponRepository {
  static async findByCode(code: string, client: Queryable = getDbPool(), forUpdate = false): Promise<CouponRecord | null> {
    const res = await client.query(
      `SELECT * FROM coupons WHERE code = $1 ${forUpdate ? "FOR UPDATE" : ""}`,
      [normalizeCouponCode(code)]
    );
    return res.rows[0] ? mapCoupon(res.rows[0]) : null;
  }

  /**
   * Validates everything about a coupon except cart value (handled by PricingCalculator).
   * When called inside a checkout transaction with the coupon row locked, the usage
   * counts are race-free.
   */
  static async checkEligibility(
    client: Queryable,
    coupon: CouponRecord | null,
    ctx: { userId: string; restaurantId: string; now?: Date; excludeOrderId?: string }
  ): Promise<CouponEligibility> {
    if (!coupon || !coupon.isActive) return { ok: false, reason: "This coupon code is not valid." };
    const now = ctx.now ?? new Date();
    if (coupon.validFrom && coupon.validFrom > now) return { ok: false, reason: "This coupon is not active yet." };
    if (coupon.validUntil && coupon.validUntil < now) return { ok: false, reason: "This coupon has expired." };
    if (coupon.restaurantId && coupon.restaurantId !== ctx.restaurantId) {
      return { ok: false, reason: "This coupon is not valid at this restaurant." };
    }

    const usage = await client.query(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE user_id = $2)::int AS by_user
         FROM coupon_redemptions
        WHERE coupon_id = $1 AND status <> 'RELEASED' AND ($3::uuid IS NULL OR order_id <> $3::uuid)`,
      [coupon.id, ctx.userId, ctx.excludeOrderId ?? null]
    );
    const { total, by_user: byUser } = usage.rows[0];
    if (coupon.usageLimitTotal !== null && total >= coupon.usageLimitTotal) {
      return { ok: false, reason: "This coupon has been fully redeemed." };
    }
    if (coupon.usageLimitPerUser !== null && byUser >= coupon.usageLimitPerUser) {
      return { ok: false, reason: "You have already used this coupon." };
    }

    if (coupon.firstOrderOnly) {
      const prior = await client.query(
        `SELECT 1 FROM orders
          WHERE customer_id = $1 AND payment_status <> 'PENDING' AND fulfillment_state <> 'CANCELLED'
          LIMIT 1`,
        [ctx.userId]
      );
      if (prior.rows.length > 0) return { ok: false, reason: "This coupon is only valid on your first order." };
    }

    return {
      ok: true,
      rule: {
        type: coupon.type,
        discountValue: coupon.discountValue,
        maxDiscountPaise: coupon.maxDiscountPaise ?? undefined,
        minOrderPaise: coupon.minOrderPaise,
      },
    };
  }

  static async reserveWithClient(
    client: Queryable,
    input: { couponId: string; userId: string; orderId: string; discountPaise: number }
  ): Promise<void> {
    await client.query(
      `INSERT INTO coupon_redemptions (id, coupon_id, user_id, order_id, discount_paise, status)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, 'RESERVED')`,
      [input.couponId, input.userId, input.orderId, input.discountPaise]
    );
  }

  static async markRedeemedWithClient(client: Queryable, orderId: string): Promise<void> {
    await client.query(
      `UPDATE coupon_redemptions SET status = 'REDEEMED', updated_at = NOW()
        WHERE order_id = $1 AND status = 'RESERVED'`,
      [orderId]
    );
  }

  static async releaseWithClient(client: Queryable, orderId: string): Promise<void> {
    await client.query(
      `UPDATE coupon_redemptions SET status = 'RELEASED', updated_at = NOW()
        WHERE order_id = $1 AND status <> 'RELEASED'`,
      [orderId]
    );
  }

  /** Publicly visible offers for the checkout "available coupons" list. */
  static async listActive(restaurantId?: string): Promise<CouponRecord[]> {
    const res = await getDbPool().query(
      `SELECT * FROM coupons
        WHERE is_active
          AND (valid_from IS NULL OR valid_from <= NOW())
          AND (valid_until IS NULL OR valid_until >= NOW())
          AND (restaurant_id IS NULL OR restaurant_id = $1::uuid)
        ORDER BY min_order_paise ASC
        LIMIT 20`,
      [restaurantId ?? null]
    );
    return res.rows.map(mapCoupon);
  }
}

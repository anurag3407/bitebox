import { DomainError, LedgerAccountType } from "@startup/core";
import { getDbPool, withTransaction } from "../client.js";
import { WalletRepository } from "./wallet.repository.js";

export const SPONSORSHIP_DAILY_RATE_PAISE = 9_900;
const ALLOWED_DAYS = new Set([3, 7, 14]);

export interface SponsorshipState {
  active: boolean;
  endsAt?: string;
  daysRemaining?: number;
  dailyRatePaise: number;
  totalSpentPaise: number;
  maxDailyBudgetPaise: number;
  bidPerClickPaise: number;
}

export interface SponsorshipAnalytics {
  totalImpressions: number;
  totalClicks: number;
  ctrPercent: number;
  conversions: number;
  conversionRatePercent: number;
  totalSalesPaise: number;
  spendPaise: number;
  roas: number;
  maxDailyBudgetPaise: number;
  bidPerClickPaise: number;
  dailyBreakdown: Array<{
    date: string;
    impressions: number;
    clicks: number;
    conversions: number;
  }>;
}

export class SponsorshipRepository {
  static async state(restaurantId: string): Promise<SponsorshipState> {
    const res = await getDbPool().query(
      `SELECT MAX(ends_at) AS ends_at,
              COALESCE(SUM(amount_paise) FILTER (WHERE ends_at > NOW()), 0)::int AS active_spend,
              COALESCE(MAX(max_daily_budget_paise), 9900)::int AS max_daily_budget_paise,
              COALESCE(MAX(bid_per_click_paise), 500)::int AS bid_per_click_paise
         FROM restaurant_sponsorships
        WHERE restaurant_id = $1 AND status = 'ACTIVE'`,
      [restaurantId]
    );
    const endsAt = res.rows[0]?.ends_at as Date | null;
    return {
      active: !!endsAt && endsAt.getTime() > Date.now(),
      endsAt: endsAt?.toISOString(),
      daysRemaining: endsAt ? Math.max(0, Math.ceil((endsAt.getTime() - Date.now()) / 86_400_000)) : 0,
      dailyRatePaise: SPONSORSHIP_DAILY_RATE_PAISE,
      totalSpentPaise: Number(res.rows[0]?.active_spend ?? 0),
      maxDailyBudgetPaise: Number(res.rows[0]?.max_daily_budget_paise ?? 9900),
      bidPerClickPaise: Number(res.rows[0]?.bid_per_click_paise ?? 500),
    };
  }

  static async recordEvent(input: {
    restaurantId: string;
    eventType: "IMPRESSION" | "CLICK" | "CONVERSION";
    source?: "SEARCH" | "HOME_FEED" | "COLLECTION" | "CUISINE_RAIL";
    orderId?: string;
    orderAmountPaise?: number;
  }): Promise<void> {
    await getDbPool().query(
      `INSERT INTO restaurant_sponsorship_events
         (restaurant_id, event_type, source, order_id, order_amount_paise)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        input.restaurantId,
        input.eventType,
        input.source ?? "SEARCH",
        input.orderId ?? null,
        input.orderAmountPaise ?? 0,
      ]
    );
  }

  static async updateCampaign(
    restaurantId: string,
    input: { maxDailyBudgetPaise?: number; bidPerClickPaise?: number }
  ): Promise<void> {
    await getDbPool().query(
      `UPDATE restaurant_sponsorships
          SET max_daily_budget_paise = COALESCE($2, max_daily_budget_paise),
              bid_per_click_paise = COALESCE($3, bid_per_click_paise)
        WHERE restaurant_id = $1 AND status = 'ACTIVE'`,
      [restaurantId, input.maxDailyBudgetPaise ?? null, input.bidPerClickPaise ?? null]
    );
  }

  static async analytics(restaurantId: string): Promise<SponsorshipAnalytics> {
    const pool = getDbPool();
    const statsRes = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE event_type = 'IMPRESSION')::int AS impressions,
         COUNT(*) FILTER (WHERE event_type = 'CLICK')::int AS clicks,
         COUNT(*) FILTER (WHERE event_type = 'CONVERSION')::int AS conversions,
         COALESCE(SUM(order_amount_paise) FILTER (WHERE event_type = 'CONVERSION'), 0)::bigint AS sales_paise
       FROM restaurant_sponsorship_events
      WHERE restaurant_id = $1 AND created_at >= NOW() - INTERVAL '30 days'`,
      [restaurantId]
    );

    const spendRes = await pool.query(
      `SELECT COALESCE(SUM(amount_paise), 0)::bigint AS spend_paise,
              COALESCE(MAX(max_daily_budget_paise), 9900)::int AS max_daily_budget_paise,
              COALESCE(MAX(bid_per_click_paise), 500)::int AS bid_per_click_paise
         FROM restaurant_sponsorships
        WHERE restaurant_id = $1 AND status = 'ACTIVE'`,
      [restaurantId]
    );

    const dailyRes = await pool.query(
      `SELECT DATE(created_at)::text AS date,
              COUNT(*) FILTER (WHERE event_type = 'IMPRESSION')::int AS impressions,
              COUNT(*) FILTER (WHERE event_type = 'CLICK')::int AS clicks,
              COUNT(*) FILTER (WHERE event_type = 'CONVERSION')::int AS conversions
         FROM restaurant_sponsorship_events
        WHERE restaurant_id = $1 AND created_at >= NOW() - INTERVAL '7 days'
        GROUP BY DATE(created_at)
        ORDER BY date ASC`,
      [restaurantId]
    );

    const impressions = Number(statsRes.rows[0]?.impressions ?? 0);
    const clicks = Number(statsRes.rows[0]?.clicks ?? 0);
    const conversions = Number(statsRes.rows[0]?.conversions ?? 0);
    const totalSalesPaise = Number(statsRes.rows[0]?.sales_paise ?? 0);
    const spendPaise = Number(spendRes.rows[0]?.spend_paise ?? 0);
    const maxDailyBudgetPaise = Number(spendRes.rows[0]?.max_daily_budget_paise ?? 9900);
    const bidPerClickPaise = Number(spendRes.rows[0]?.bid_per_click_paise ?? 500);

    const ctrPercent = impressions > 0 ? Number(((clicks / impressions) * 100).toFixed(2)) : 0;
    const conversionRatePercent = clicks > 0 ? Number(((conversions / clicks) * 100).toFixed(2)) : 0;
    const roas = spendPaise > 0 ? Number((totalSalesPaise / spendPaise).toFixed(2)) : 0;

    return {
      totalImpressions: impressions,
      totalClicks: clicks,
      ctrPercent,
      conversions,
      conversionRatePercent,
      totalSalesPaise,
      spendPaise,
      roas,
      maxDailyBudgetPaise,
      bidPerClickPaise,
      dailyBreakdown: dailyRes.rows.map((r) => ({
        date: r.date,
        impressions: Number(r.impressions),
        clicks: Number(r.clicks),
        conversions: Number(r.conversions),
      })),
    };
  }

  static async purchase(input: { restaurantId: string; userId: string; days: number }) {
    if (!ALLOWED_DAYS.has(input.days)) throw new DomainError("VALIDATION_ERROR", "Boosts are available for 3, 7 or 14 days");
    const amountPaise = input.days * SPONSORSHIP_DAILY_RATE_PAISE;
    return withTransaction(async (client) => {
      const current = await client.query(
        `SELECT MAX(ends_at) AS ends_at FROM restaurant_sponsorships
          WHERE restaurant_id = $1 AND status = 'ACTIVE' AND ends_at > NOW()`,
        [input.restaurantId]
      );
      const now = Date.now();
      const currentEnd = current.rows[0]?.ends_at ? new Date(current.rows[0].ends_at).getTime() : 0;
      const startsAt = new Date(Math.max(now, currentEnd));
      const endsAt = new Date(startsAt.getTime() + input.days * 86_400_000);
      const created = await client.query(
        `INSERT INTO restaurant_sponsorships
           (restaurant_id, purchased_by, days, amount_paise, starts_at, ends_at)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [input.restaurantId, input.userId, input.days, amountPaise, startsAt.toISOString(), endsAt.toISOString()]
      );
      const sponsorship = created.rows[0];
      await WalletRepository.debitForPurchaseWithClient(client, {
        userId: input.userId,
        amountPaise,
        kind: "SPONSORSHIP_PAYMENT",
        referenceType: "SPONSORSHIP",
        referenceId: sponsorship.id,
        description: `${input.days}-day restaurant boost (${sponsorship.id})`,
        counterAccount: LedgerAccountType.PLATFORM_REVENUE,
      });
      return {
        id: sponsorship.id as string,
        days: input.days,
        amountPaise,
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
      };
    });
  }

  static async activeRestaurantIds(): Promise<Set<string>> {
    const res = await getDbPool().query(
      `SELECT DISTINCT restaurant_id FROM restaurant_sponsorships
        WHERE status = 'ACTIVE' AND ends_at > NOW()`
    );
    return new Set(res.rows.map((r) => r.restaurant_id as string));
  }
}

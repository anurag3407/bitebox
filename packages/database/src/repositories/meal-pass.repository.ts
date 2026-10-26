import { DomainError, LedgerEngine, decideScheduledMealSkip, priceSurplusBag } from "@startup/core";
import type { PoolClient } from "pg";
import { getDbPool, withTransaction } from "../client.js";
import { LedgerRepository } from "./ledger.repository.js";
import { OutboxRepository } from "./outbox.repository.js";
import { WalletRepository } from "./wallet.repository.js";

const IST_OFFSET_MINUTES = 330;

function istDateAtUtc(date: Date, hours: number, minutes: number): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), hours, minutes) -
      IST_OFFSET_MINUTES * 60 * 1000
  );
}

function slotCutoffFor(deliveryDate: string | Date, slotWindow: string): Date {
  const start = slotWindow.split("-")[0]?.trim() ?? "12:30";
  const [hourRaw, minuteRaw] = start.split(":");
  const hour = Number(hourRaw);
  const minute = Number(minuteRaw);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) throw new Error("Invalid slot window");
  const date =
    typeof deliveryDate === "string"
      ? new Date(`${deliveryDate.slice(0, 10)}T00:00:00.000Z`)
      : deliveryDate;
  // Lock 90 minutes before service so the kitchen can still be stopped before prep.
  return new Date(istDateAtUtc(date, hour, minute).getTime() - 90 * 60 * 1000);
}

function isoWeekday(date: Date): number {
  const day = date.getUTCDay();
  return day === 0 ? 7 : day;
}

export class MealPassRepository {
  static async createPlan(input: {
    clusterId?: string | null;
    kitchenRestaurantId: string;
    name: string;
    skuType: "STANDARD_LUNCH" | "STANDARD_DINNER";
    totalMeals: number;
    pricePaise: number;
    validityDays: number;
    kitchenContractPayoutPaise: number;
    lateSkipFeePaise?: number;
    autoScheduleDays?: number[];
    slotWindow?: string;
  }) {
    const res = await getDbPool().query(
      `INSERT INTO meal_plans
         (cluster_id, kitchen_restaurant_id, name, sku_type, total_meals, price_paise,
          validity_days, kitchen_contract_payout_paise, late_skip_fee_paise,
          auto_schedule_days, slot_window)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [
        input.clusterId ?? null,
        input.kitchenRestaurantId,
        input.name,
        input.skuType,
        input.totalMeals,
        input.pricePaise,
        input.validityDays,
        input.kitchenContractPayoutPaise,
        input.lateSkipFeePaise ?? 2500,
        input.autoScheduleDays ?? [1, 2, 3, 4, 5],
        input.slotWindow ?? "12:30-13:30",
      ]
    );
    return res.rows[0];
  }

  static async listPlans(clusterId?: string) {
    const res = await getDbPool().query(
      `SELECT pl.*, r.name AS kitchen_name, r.slug AS kitchen_slug
         FROM meal_plans pl JOIN restaurants r ON r.id = pl.kitchen_restaurant_id
        WHERE pl.is_active
          AND (($1::uuid IS NULL AND pl.cluster_id IS NULL) OR pl.cluster_id = $1::uuid)
        ORDER BY pl.created_at DESC`,
      [clusterId ?? null]
    );
    return res.rows;
  }

  static async findPlan(planId: string) {
    const res = await getDbPool().query(
      `SELECT pl.*, r.name AS kitchen_name FROM meal_plans pl
         JOIN restaurants r ON r.id = pl.kitchen_restaurant_id
        WHERE pl.id = $1 AND pl.is_active`,
      [planId]
    );
    return res.rows[0] ?? null;
  }

  static async purchasePass(input: { userId: string; planId: string; dropPointId?: string | null }) {
    return withTransaction(async (client) => {
      const planRes = await client.query(`SELECT * FROM meal_plans WHERE id = $1 AND is_active FOR UPDATE`, [input.planId]);
      const plan = planRes.rows[0];
      if (!plan) throw new DomainError("NOT_FOUND", "Meal plan not found");
      const expiresAt = new Date(Date.now() + plan.validity_days * 24 * 60 * 60 * 1000);
      const passRes = await client.query(
        `INSERT INTO user_meal_passes
           (user_id, plan_id, meals_remaining, status, auto_schedule_days, default_drop_point_id, expires_at)
         VALUES ($1, $2, $3, 'ACTIVE', $4, $5, $6)
         RETURNING *`,
        [input.userId, plan.id, plan.total_meals, plan.auto_schedule_days, input.dropPointId ?? null, expiresAt.toISOString()]
      );
      const pass = passRes.rows[0];
      await WalletRepository.debitForPurchaseWithClient(client, {
        userId: input.userId,
        amountPaise: plan.price_paise,
        kind: "MEAL_PASS_PAYMENT",
        referenceType: "MEAL_PASS",
        referenceId: pass.id,
        description: `${plan.name} meal pass`,
      });
      await LedgerRepository.postTransactionWithClient(client, {
        effectType: "MEAL_PASS",
        entries: LedgerEngine.buildMealPassPurchaseEntries(plan.price_paise, pass.id),
      });
      const scheduledDeliveries = await MealPassRepository.scheduleUpcomingDeliveriesWithClient(client, {
        pass,
        plan,
      });
      return { pass, plan, scheduledDeliveries };
    });
  }

  /** Creates the first run of auto-scheduled meals so a new pass is usable immediately. */
  private static async scheduleUpcomingDeliveriesWithClient(
    client: PoolClient,
    input: { pass: any; plan: any }
  ): Promise<number> {
    const days: string[] = [];
    const midnight = new Date();
    midnight.setUTCHours(0, 0, 0, 0);
    const expiry = new Date(input.pass.expires_at).getTime();
    const weekdays: number[] = input.plan.auto_schedule_days;
    for (let offset = 1; offset <= 21 && days.length < 5; offset += 1) {
      const day = new Date(midnight.getTime() + offset * 24 * 60 * 60 * 1000);
      if (day.getTime() >= expiry) break;
      if (!weekdays.includes(isoWeekday(day))) continue;
      days.push(day.toISOString().slice(0, 10));
    }
    let created = 0;
    for (const date of days) {
      const res = await client.query(
        `INSERT INTO scheduled_meal_deliveries
           (pass_id, user_id, kitchen_id, delivery_date, slot_window, status, source)
         VALUES ($1, $2, $3, $4::date, $5, 'SCHEDULED', 'AUTO')
         ON CONFLICT (pass_id, delivery_date, slot_window) DO NOTHING
         RETURNING id`,
        [input.pass.id, input.pass.user_id, input.plan.kitchen_restaurant_id, date, input.plan.slot_window]
      );
      if (res.rows[0]) created += 1;
    }
    return created;
  }

  static async listPasses(userId: string) {
    const res = await getDbPool().query(
      `SELECT p.*, pl.name AS plan_name, pl.sku_type, pl.slot_window, pl.total_meals,
              pl.kitchen_restaurant_id, r.name AS kitchen_name
         FROM user_meal_passes p
         JOIN meal_plans pl ON pl.id = p.plan_id
         JOIN restaurants r ON r.id = pl.kitchen_restaurant_id
        WHERE p.user_id = $1
        ORDER BY p.created_at DESC`,
      [userId]
    );
    return res.rows;
  }

  /**
   * Generates the next day's deliveries (T-12h job) and broadcasts aggregate
   * kitchen forecasts. Unique(pass, date, slot) makes the job safe to retry.
   */
  static async generateDailyDeliveries(date: Date) {
    return withTransaction(async (client) => {
      const weekday = isoWeekday(date);
      const passes = await client.query(
        `SELECT p.id, p.user_id, p.meals_remaining, p.auto_schedule_days,
                pl.kitchen_restaurant_id, pl.slot_window
           FROM user_meal_passes p JOIN meal_plans pl ON pl.id = p.plan_id
          WHERE p.status = 'ACTIVE' AND p.meals_remaining > 0
            AND p.expires_at > $1 AND pl.is_active
            AND $2 = ANY(p.auto_schedule_days)`,
        [date.toISOString(), weekday]
      );
      const byKitchen = new Map<string, { count: number; slotWindow: string }>();
      let created = 0;
      for (const pass of passes.rows) {
        const inserted = await client.query(
          `INSERT INTO scheduled_meal_deliveries
             (pass_id, user_id, kitchen_id, delivery_date, slot_window, status, source)
           VALUES ($1, $2, $3, $4::date, $5, 'SCHEDULED', 'AUTO')
           ON CONFLICT (pass_id, delivery_date, slot_window) DO NOTHING
           RETURNING id`,
          [pass.id, pass.user_id, pass.kitchen_restaurant_id, date.toISOString(), pass.slot_window]
        );
        if (inserted.rows.length === 0) continue;
        created += 1;
        const current = byKitchen.get(pass.kitchen_restaurant_id) ?? { count: 0, slotWindow: pass.slot_window };
        current.count += 1;
        byKitchen.set(pass.kitchen_restaurant_id, current);
      }
      for (const [kitchenId, forecast] of byKitchen) {
        await OutboxRepository.appendWithClient(client, "meal_pass.forecast", kitchenId, 1, {
          kitchenId,
          deliveryDate: date.toISOString().slice(0, 10),
          slotWindow: forecast.slotWindow,
          forecastMeals: forecast.count,
        });
      }
      return { created, kitchens: [...byKitchen.entries()].map(([kitchenId, v]) => ({ kitchenId, ...v })) };
    });
  }

  static async skipDelivery(input: { deliveryId: string; userId: string; now?: Date }) {
    const now = input.now ?? new Date();
    return withTransaction(async (client) => {
      const res = await client.query(
        `SELECT d.*, to_char(d.delivery_date, 'YYYY-MM-DD') AS delivery_date_text,
                p.user_id AS pass_user_id, p.meals_remaining, p.status AS pass_status,
                pl.name AS plan_name, pl.kitchen_contract_payout_paise, pl.late_skip_fee_paise,
                pl.price_paise, pl.total_meals, pl.cluster_id
           FROM scheduled_meal_deliveries d
           JOIN user_meal_passes p ON p.id = d.pass_id
           JOIN meal_plans pl ON pl.id = p.plan_id
          WHERE d.id = $1 FOR UPDATE OF d, p`,
        [input.deliveryId]
      );
      const delivery = res.rows[0];
      if (!delivery) throw new DomainError("NOT_FOUND", "Scheduled meal not found");
      if (delivery.pass_user_id !== input.userId) throw new DomainError("FORBIDDEN", "This meal belongs to another pass");
      if (delivery.status !== "SCHEDULED") throw new DomainError("STATE_CONFLICT", "This meal is no longer skippable");
      if (delivery.pass_status !== "ACTIVE") throw new DomainError("STATE_CONFLICT", "This pass is not active");

      const deliveryDate = new Date(`${String(delivery.delivery_date_text ?? delivery.delivery_date).slice(0, 10)}T00:00:00.000Z`);
      const cutoff = slotCutoffFor(delivery.delivery_date_text ?? delivery.delivery_date, delivery.slot_window);
      const decision = decideScheduledMealSkip({
        now,
        slotCutoffAt: cutoff,
        lateSkipFeePaise: delivery.late_skip_fee_paise,
        kitchenPayoutPaise: delivery.kitchen_contract_payout_paise,
      });
      if (decision.action === "REJECT") {
        throw new DomainError("STATE_CONFLICT", "This meal is locked for dispatch and can no longer be skipped.");
      }

      await client.query(
        `UPDATE scheduled_meal_deliveries SET status = $2, skip_at = $3, updated_at = NOW() WHERE id = $1`,
        [delivery.id, decision.action === "EARLY_SKIP" ? "SKIPPED_EARLY" : "CONVERTED_TO_SURPLUS", now.toISOString()]
      );

      if (decision.action === "EARLY_SKIP") {
        return { status: "SKIPPED_EARLY", surplusListingId: null, mealsRemaining: delivery.meals_remaining };
      }

      const perMealValue = Math.max(1, Math.round(delivery.price_paise / delivery.total_meals));
      const priced = priceSurplusBag({
        originalValuePaise: perMealValue,
        platformFlatFeePaise: Math.min(2000, Math.max(1, perMealValue - 1)),
        discountBp: decision.surplusDiscountBp,
      });
      const pickupStart = istDateAtUtc(deliveryDate, 15, 0);
      const pickupEnd = istDateAtUtc(deliveryDate, 16, 30);
      const surplus = await client.query(
        `INSERT INTO surplus_listings
           (restaurant_id, cluster_id, title, original_value_paise, sale_price_paise,
            platform_flat_fee_paise, quantity_available, pickup_window_start, pickup_window_end,
            source_scheduled_delivery_id, status)
         VALUES ($1, $2, $3, $4, $5, $6, 1, $7, $8, $9, 'ACTIVE')
         RETURNING id`,
        [
          delivery.kitchen_id,
          delivery.cluster_id ?? null,
          `${delivery.plan_name} Rescue Bag`,
          priced.originalValuePaise,
          priced.salePricePaise,
          priced.platformFeePaise,
          pickupStart.toISOString(),
          pickupEnd.toISOString(),
          delivery.id,
        ]
      );
      const surplusListingId = surplus.rows[0].id;
      await client.query(
        `UPDATE scheduled_meal_deliveries
            SET surplus_listing_id = $2, late_skip_fee_paise = 0,
                kitchen_payout_guaranteed_paise = $3, updated_at = NOW()
          WHERE id = $1`,
        [delivery.id, surplusListingId, delivery.kitchen_contract_payout_paise]
      );
      const passRes = await client.query(
        `UPDATE user_meal_passes
            SET meals_remaining = GREATEST(0, meals_remaining - 1),
                status = CASE WHEN meals_remaining - 1 <= 0 THEN 'EXHAUSTED' ELSE status END,
                updated_at = NOW()
          WHERE id = $1 RETURNING meals_remaining`,
        [delivery.pass_id]
      );
      await LedgerRepository.postTransactionWithClient(client, {
        effectType: "MEAL_PASS",
        entries: LedgerEngine.buildMealPassKitchenAccrualEntries(
          delivery.kitchen_contract_payout_paise,
          `late-skip:${delivery.id}`
        ),
      });
      return {
        status: "CONVERTED_TO_SURPLUS",
        surplusListingId,
        mealsRemaining: passRes.rows[0]?.meals_remaining ?? 0,
      };
    });
  }

  static async listDeliveries(userId: string, from?: Date, to?: Date) {
    const res = await getDbPool().query(
      `SELECT d.*, to_char(d.delivery_date, 'YYYY-MM-DD') AS delivery_date_text,
              pl.name AS plan_name, pl.sku_type, r.name AS kitchen_name
         FROM scheduled_meal_deliveries d
         JOIN user_meal_passes p ON p.id = d.pass_id
         JOIN meal_plans pl ON pl.id = p.plan_id
         JOIN restaurants r ON r.id = d.kitchen_id
        WHERE d.user_id = $1
          AND ($2::date IS NULL OR d.delivery_date >= $2::date)
          AND ($3::date IS NULL OR d.delivery_date <= $3::date)
        ORDER BY d.delivery_date ASC, d.slot_window ASC LIMIT 100`,
      [userId, from?.toISOString() ?? null, to?.toISOString() ?? null]
    );
    return res.rows;
  }

  static async markDelivered(input: { deliveryId: string; orderId?: string }) {
    return withTransaction(async (client) => {
      const res = await client.query(
        `SELECT d.*, p.meals_remaining, p.status AS pass_status, pl.kitchen_contract_payout_paise
           FROM scheduled_meal_deliveries d
           JOIN user_meal_passes p ON p.id = d.pass_id
           JOIN meal_plans pl ON pl.id = p.plan_id
          WHERE d.id = $1 FOR UPDATE OF d, p`,
        [input.deliveryId]
      );
      const delivery = res.rows[0];
      if (!delivery) throw new DomainError("NOT_FOUND", "Scheduled meal not found");
      if (delivery.status === "DELIVERED") return { mealsRemaining: delivery.meals_remaining };
      if (!["SCHEDULED", "LOCKED_FOR_PREP"].includes(delivery.status)) {
        throw new DomainError("STATE_CONFLICT", "This meal cannot be marked delivered");
      }
      const pass = await client.query(
        `UPDATE user_meal_passes
            SET meals_remaining = GREATEST(0, meals_remaining - 1),
                status = CASE WHEN meals_remaining - 1 <= 0 THEN 'EXHAUSTED' ELSE status END,
                updated_at = NOW()
          WHERE id = $1 RETURNING meals_remaining`,
        [delivery.pass_id]
      );
      await client.query(
        `UPDATE scheduled_meal_deliveries
            SET status = 'DELIVERED', order_id = COALESCE($2, order_id), updated_at = NOW()
          WHERE id = $1`,
        [delivery.id, input.orderId ?? null]
      );
      await LedgerRepository.postTransactionWithClient(client, {
        effectType: "MEAL_PASS",
        entries: LedgerEngine.buildMealPassKitchenAccrualEntries(
          delivery.kitchen_contract_payout_paise,
          `meal-delivered:${delivery.id}`
        ),
      });
      return { mealsRemaining: pass.rows[0]?.meals_remaining ?? 0 };
    });
  }
}

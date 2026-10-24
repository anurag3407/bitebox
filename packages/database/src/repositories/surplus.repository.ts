import {
  DomainError,
  LedgerEngine,
  calculatePackagingIssuance,
  calculateSamplingBounty,
  generateOrderNumber,
  generateVerificationOtp,
  priceSurplusBag,
  shouldAttachSampling,
} from "@startup/core";
import { getDbPool, withTransaction } from "../client.js";
import { LedgerRepository } from "./ledger.repository.js";

export class SurplusRepository {
  static async createListing(input: {
    restaurantId: string;
    clusterId?: string | null;
    title: string;
    originalValuePaise: number;
    discountBp?: number;
    platformFlatFeePaise: number;
    quantity: number;
    pickupWindowStart: Date;
    pickupWindowEnd: Date;
    allowGateBatchDrop?: boolean;
    sourceScheduledDeliveryId?: string | null;
  }) {
    const priced = priceSurplusBag({
      originalValuePaise: input.originalValuePaise,
      platformFlatFeePaise: input.platformFlatFeePaise,
      discountBp: input.discountBp,
    });
    const res = await getDbPool().query(
      `INSERT INTO surplus_listings
         (restaurant_id, cluster_id, title, original_value_paise, sale_price_paise,
          platform_flat_fee_paise, quantity_available, pickup_window_start, pickup_window_end,
          allow_gate_batch_drop, source_scheduled_delivery_id, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'ACTIVE')
       RETURNING *`,
      [
        input.restaurantId,
        input.clusterId ?? null,
        input.title,
        priced.originalValuePaise,
        priced.salePricePaise,
        priced.platformFeePaise,
        input.quantity,
        input.pickupWindowStart.toISOString(),
        input.pickupWindowEnd.toISOString(),
        input.allowGateBatchDrop ?? false,
        input.sourceScheduledDeliveryId ?? null,
      ]
    );
    return { listing: res.rows[0], priced };
  }

  static async listActive(clusterId?: string) {
    const res = await getDbPool().query(
      `SELECT sl.*, r.name AS restaurant_name, r.slug AS restaurant_slug
         FROM surplus_listings sl JOIN restaurants r ON r.id = sl.restaurant_id
        WHERE sl.status = 'ACTIVE' AND sl.quantity_available > 0
          AND sl.pickup_window_end > NOW()
          AND ($1::uuid IS NULL OR sl.cluster_id = $1::uuid)
        ORDER BY sl.pickup_window_start ASC`,
      [clusterId ?? null]
    );
    return res.rows;
  }

  /**
   * Atomic reserve prevents overselling during flash drops. If the bag came from
   * a late-skipped pass meal, resale restores one credit to that pass.
   */
  static async reserveListing(input: { listingId: string; userId: string; quantity?: number; now?: Date }) {
    const now = input.now ?? new Date();
    const quantity = input.quantity ?? 1;
    if (!Number.isInteger(quantity) || quantity <= 0) throw new DomainError("VALIDATION_ERROR", "Quantity must be positive");
    return withTransaction(async (client) => {
      const res = await client.query(`SELECT * FROM surplus_listings WHERE id = $1 FOR UPDATE`, [input.listingId]);
      const listing = res.rows[0];
      if (!listing) throw new DomainError("NOT_FOUND", "Surplus bag not found");
      if (listing.status !== "ACTIVE") throw new DomainError("STATE_CONFLICT", "This rescue bag is no longer available");
      if (now < new Date(listing.pickup_window_start) || now > new Date(listing.pickup_window_end)) {
        throw new DomainError("STATE_CONFLICT", "This rescue bag is outside its pickup window");
      }
      const updated = await client.query(
        `UPDATE surplus_listings
            SET quantity_available = quantity_available - $2,
                status = CASE WHEN quantity_available - $2 <= 0 THEN 'SOLD_OUT' ELSE status END,
                updated_at = NOW()
          WHERE id = $1 AND quantity_available >= $2
          RETURNING *`,
        [listing.id, quantity]
      );
      if (updated.rows.length === 0) throw new DomainError("OUT_OF_STOCK", "This rescue bag just sold out");

      if (listing.source_scheduled_delivery_id) {
        const delivery = await client.query(
          `SELECT d.pass_id, pl.total_meals
             FROM scheduled_meal_deliveries d
             JOIN user_meal_passes p ON p.id = d.pass_id
             JOIN meal_plans pl ON pl.id = p.plan_id
            WHERE d.id = $1`,
          [listing.source_scheduled_delivery_id]
        );
        if (delivery.rows[0]) {
          await client.query(
            `UPDATE user_meal_passes
                SET meals_remaining = LEAST($2, meals_remaining + 1),
                    status = CASE WHEN status = 'EXHAUSTED' THEN 'ACTIVE' ELSE status END,
                    updated_at = NOW()
              WHERE id = $1`,
            [delivery.rows[0].pass_id, delivery.rows[0].total_meals]
          );
        }
      }
      return { listing: updated.rows[0], quantity, restoredPassCredit: Boolean(listing.source_scheduled_delivery_id) };
    });
  }

  /** Creates a paid rescue-bag order and atomically consumes one unit. */
  static async purchaseListing(input: {
    listingId: string;
    userId: string;
    addressId?: string;
    now?: Date;
  }) {
    const now = input.now ?? new Date();
    return withTransaction(async (client) => {
      const res = await client.query(`SELECT * FROM surplus_listings WHERE id = $1 FOR UPDATE`, [input.listingId]);
      const listing = res.rows[0];
      if (!listing) throw new DomainError("NOT_FOUND", "Surplus bag not found");
      if (listing.status !== "ACTIVE" || listing.quantity_available <= 0) {
        throw new DomainError("OUT_OF_STOCK", "This rescue bag just sold out");
      }
      if (now < new Date(listing.pickup_window_start) || now > new Date(listing.pickup_window_end)) {
        throw new DomainError("STATE_CONFLICT", "This rescue bag is outside its pickup window");
      }

      const address = await client.query(
        input.addressId
          ? `SELECT id FROM customer_addresses WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL`
          : `SELECT id FROM customer_addresses WHERE user_id = $1 AND deleted_at IS NULL ORDER BY is_default DESC, created_at ASC LIMIT 1`,
        input.addressId ? [input.addressId, input.userId] : [input.userId]
      );
      if (!address.rows[0]) throw new DomainError("VALIDATION_ERROR", "Add a delivery address before reserving a bag");

      await client.query(
        `UPDATE surplus_listings
            SET quantity_available = quantity_available - 1,
                status = CASE WHEN quantity_available - 1 <= 0 THEN 'SOLD_OUT' ELSE status END,
                updated_at = NOW()
          WHERE id = $1`,
        [listing.id]
      );

      const orderNumber = generateOrderNumber(now);
      const merchantProceeds = listing.sale_price_paise - listing.platform_flat_fee_paise;
      const breakdown = {
        subtotalPaise: merchantProceeds,
        packagingPaise: 0,
        deliveryFeePaise: 0,
        platformFeePaise: listing.platform_flat_fee_paise,
        surgePaise: 0,
        taxPaise: 0,
        discountPaise: 0,
        tipPaise: 0,
        foodTaxPaise: 0,
        foodDiscountPaise: 0,
        payablePaise: listing.sale_price_paise,
      };
      const items = [
        {
          menuItemId: listing.id,
          name: listing.title,
          selectedOptionNames: ["Rescue bag"],
          quantity: 1,
          basePricePaise: merchantProceeds,
          optionsPricePaise: listing.platform_flat_fee_paise,
          lineTotalPaise: listing.sale_price_paise,
        },
      ];
      const orderRes = await client.query(
        `INSERT INTO orders
           (order_number, customer_id, restaurant_id, delivery_address_id, items_json, breakdown_json,
            fulfillment_state, payment_status, payable_paise, delivery_otp, pickup_otp,
            promised_delivery_at, acquisition_channel, commission_bp_applied, commission_paise,
            merchant_order_fee_paise, merchant_net_payout_paise, order_type,
            surplus_listing_id, surplus_quantity, slot_cutoff_at)
         VALUES ($1, $2, $3, $4, $5, $6, 'ACCEPTED', 'CAPTURED', $7, $8, $9, $10,
                 'SURPLUS_BAG', 0, 0, 0, $11, 'SURPLUS', $12, 1, $10)
         RETURNING *`,
        [
          orderNumber,
          input.userId,
          listing.restaurant_id,
          address.rows[0].id,
          JSON.stringify(items),
          JSON.stringify(breakdown),
          listing.sale_price_paise,
          generateVerificationOtp(4),
          generateVerificationOtp(4),
          listing.pickup_window_start,
          merchantProceeds,
          listing.id,
        ]
      );
      const order = orderRes.rows[0];
      const paymentRes = await client.query(
        `INSERT INTO payments (id, order_id, provider_payment_id, status, amount_paise, currency)
         VALUES (gen_random_uuid(), $1, $2, 'CAPTURED', $3, 'INR') RETURNING id`,
        [order.id, `SURPLUS:${order.id}`, listing.sale_price_paise]
      );
      await LedgerRepository.postTransactionWithClient(client, {
        orderId: order.id,
        paymentId: paymentRes.rows[0].id,
        effectType: "CAPTURE",
        entries: LedgerEngine.buildOrderCaptureEntries({
          payablePaise: listing.sale_price_paise,
          subtotalPaise: merchantProceeds,
          deliveryFeePaise: 0,
          platformFeePaise: listing.platform_flat_fee_paise,
          packagingPaise: 0,
          taxPaise: 0,
          discountPaise: 0,
          commissionRateBasisPoints: 0,
          merchantOrderFeePaise: 0,
        }),
      });
      if (listing.source_scheduled_delivery_id) {
        const delivery = await client.query(
          `SELECT d.pass_id, pl.total_meals
             FROM scheduled_meal_deliveries d
             JOIN user_meal_passes p ON p.id = d.pass_id
             JOIN meal_plans pl ON pl.id = p.plan_id
            WHERE d.id = $1`,
          [listing.source_scheduled_delivery_id]
        );
        if (delivery.rows[0]) {
          await client.query(
            `UPDATE user_meal_passes
                SET meals_remaining = LEAST($2, meals_remaining + 1),
                    status = CASE WHEN status = 'EXHAUSTED' THEN 'ACTIVE' ELSE status END,
                    updated_at = NOW()
              WHERE id = $1`,
            [delivery.rows[0].pass_id, delivery.rows[0].total_meals]
          );
        }
      }
      return { order, listingId: listing.id, restoredPassCredit: Boolean(listing.source_scheduled_delivery_id) };
    });
  }

  static async createCampaign(input: {    brandName: string;
    clusterId: string;
    targetAudience: "CAMPUS" | "TECH_PARK";
    bountyPerBoxPaise: number;
    remainingUnits: number;
    startsAt?: Date;
    endsAt?: Date | null;
  }) {
    const res = await getDbPool().query(
      `INSERT INTO d2c_sampling_campaigns
         (brand_name, cluster_id, target_audience, bounty_per_box_paise, remaining_units, starts_at, ends_at)
       VALUES ($1, $2, $3, $4, $5, COALESCE($6, NOW()), $7) RETURNING *`,
      [
        input.brandName,
        input.clusterId,
        input.targetAudience,
        input.bountyPerBoxPaise,
        input.remainingUnits,
        input.startsAt?.toISOString() ?? null,
        input.endsAt?.toISOString() ?? null,
      ]
    );
    return res.rows[0];
  }

  static async attachSampling(input: { orderId: string; clusterId: string; units?: number; now?: Date }) {
    const now = input.now ?? new Date();
    return withTransaction(async (client) => {
      const campaignRes = await client.query(
        `SELECT * FROM d2c_sampling_campaigns
          WHERE cluster_id = $1 AND active AND remaining_units > 0
          ORDER BY bounty_per_box_paise DESC LIMIT 1 FOR UPDATE`,
        [input.clusterId]
      );
      const campaign = campaignRes.rows[0];
      if (!campaign) return null;
      if (
        !shouldAttachSampling({
          campaignClusterId: campaign.cluster_id,
          orderClusterId: input.clusterId,
          active: campaign.active,
          remainingUnits: campaign.remaining_units,
          startsAt: new Date(campaign.starts_at),
          endsAt: campaign.ends_at ? new Date(campaign.ends_at) : null,
          now,
        })
      ) {
        return null;
      }
      const bounty = calculateSamplingBounty({
        bountyPerBoxPaise: campaign.bounty_per_box_paise,
        units: input.units ?? 1,
        remainingUnits: campaign.remaining_units,
      });
      if (bounty.unitsToAttach === 0) return null;
      await client.query(
        `UPDATE d2c_sampling_campaigns SET remaining_units = remaining_units - $2 WHERE id = $1`,
        [campaign.id, bounty.unitsToAttach]
      );
      await client.query(
        `INSERT INTO sampling_attributions (campaign_id, order_id, units, bounty_paise)
         VALUES ($1, $2, $3, $4) ON CONFLICT (campaign_id, order_id) DO NOTHING`,
        [campaign.id, input.orderId, bounty.unitsToAttach, bounty.bountyPaise]
      );
      await LedgerRepository.postTransactionWithClient(client, {
        orderId: input.orderId,
        effectType: "ADJUSTMENT",
        entries: [
          { account: "GATEWAY_CLEARING", debitPaise: bounty.bountyPaise, creditPaise: 0, description: "D2C sampling bounty received" },
          { account: "PLATFORM_REVENUE", debitPaise: 0, creditPaise: bounty.bountyPaise, description: "Packaging and sampling revenue" },
        ],
      });
      return { campaignId: campaign.id, brandName: campaign.brand_name, ...bounty };
    });
  }

  static async recordPackagingIssuance(input: {
    restaurantId: string;
    clusterId?: string | null;
    quantity: number;
    unitCostPaise: number;
  }) {
    const cost = calculatePackagingIssuance(input);
    const res = await getDbPool().query(
      `INSERT INTO packaging_issuances (restaurant_id, cluster_id, quantity, unit_cost_paise, total_cost_paise)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [input.restaurantId, input.clusterId ?? null, cost.quantity, cost.unitCostPaise, cost.totalCostPaise]
    );
    return res.rows[0];
  }
}

import { DomainError, LedgerEngine, buildAddonBagLabel, generateOrderNumber, priceOneTapAddon, selectUpsellSkus } from "@startup/core";
import { getDbPool, withTransaction } from "../client.js";
import { LedgerRepository } from "./ledger.repository.js";

export class AddonRepository {
  static async createSku(input: {
    restaurantId: string;
    clusterId?: string | null;
    name: string;
    pricePaise: number;
    cogsPaise: number;
    stockCount: number;
  }) {
    const res = await getDbPool().query(
      `INSERT INTO addon_skus (kitchen_id, cluster_id, name, price_paise, cogs_paise, stock_count)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [input.restaurantId, input.clusterId ?? null, input.name, input.pricePaise, input.cogsPaise, input.stockCount]
    );
    return res.rows[0];
  }

  static async setStock(addonSkuId: string, stockCount: number) {
    if (!Number.isInteger(stockCount) || stockCount < 0) throw new DomainError("VALIDATION_ERROR", "Stock must be non-negative");
    const res = await getDbPool().query(`UPDATE addon_skus SET stock_count = $2, updated_at = NOW() WHERE id = $1 RETURNING *`, [
      addonSkuId,
      stockCount,
    ]);
    return res.rows[0] ?? null;
  }

  static async listUpsell(parentOrderId: string, limit = 3) {
    const parent = await getDbPool().query(
      `SELECT restaurant_id, parent_order_id, fulfillment_state, slot_cutoff_at
         FROM orders WHERE id = $1`,
      [parentOrderId]
    );
    const order = parent.rows[0];
    if (!order || order.parent_order_id) return [];
    const skus = await getDbPool().query(
      `SELECT id, name, price_paise, stock_count, is_active
         FROM addon_skus WHERE kitchen_id = $1 AND is_active AND stock_count > 0
        ORDER BY price_paise ASC LIMIT 10`,
      [order.restaurant_id]
    );
    return selectUpsellSkus(
      skus.rows.map((row) => ({
        id: row.id,
        name: row.name,
        pricePaise: row.price_paise,
        stockCount: row.stock_count,
        isActive: row.is_active,
      })),
      limit
    );
  }

  static async appendOneTapAddon(input: {
    parentOrderId: string;
    addonSkuId: string;
    customerId: string;
    quantity?: number;
    now?: Date;
  }) {
    const now = input.now ?? new Date();
    return withTransaction(async (client) => {
      const parentRes = await client.query(
        `SELECT id, order_number, customer_id, restaurant_id, delivery_address_id,
                delivery_otp, pickup_otp, promised_delivery_at, slot_cutoff_at,
                bag_label, acquisition_channel, parent_order_id, fulfillment_state
           FROM orders WHERE id = $1 FOR UPDATE`,
        [input.parentOrderId]
      );
      const parent = parentRes.rows[0];
      if (!parent) throw new DomainError("NOT_FOUND", "Parent order not found");
      if (parent.customer_id !== input.customerId) throw new DomainError("FORBIDDEN", "This order belongs to another customer");
      if (parent.parent_order_id) throw new DomainError("VALIDATION_ERROR", "An add-on cannot have its own add-on");
      if (["CANCELLED", "DELIVERY_FAILED", "DELIVERED"].includes(parent.fulfillment_state)) {
        throw new DomainError("STATE_CONFLICT", "This order can no longer accept add-ons");
      }
      if (parent.slot_cutoff_at && new Date(parent.slot_cutoff_at).getTime() <= now.getTime()) {
        throw new DomainError("STATE_CONFLICT", "The add-on window for this slot is closed");
      }

      const skuRes = await client.query(
        `SELECT * FROM addon_skus WHERE id = $1 AND kitchen_id = $2 AND is_active FOR UPDATE`,
        [input.addonSkuId, parent.restaurant_id]
      );
      const sku = skuRes.rows[0];
      if (!sku) throw new DomainError("NOT_FOUND", "Add-on is not available at this kitchen");
      const quantity = input.quantity ?? 1;
      if (!Number.isInteger(quantity) || quantity <= 0) throw new DomainError("VALIDATION_ERROR", "Quantity must be positive");
      const decremented = await client.query(
        `UPDATE addon_skus SET stock_count = stock_count - $2, updated_at = NOW()
          WHERE id = $1 AND stock_count >= $2 RETURNING stock_count`,
        [sku.id, quantity]
      );
      if (decremented.rows.length === 0) throw new DomainError("OUT_OF_STOCK", "This add-on just sold out");

      const price = priceOneTapAddon({ pricePaise: sku.price_paise, cogsPaise: sku.cogs_paise, quantity });
      const parentLabel = parent.bag_label ?? `BAG #${String(parent.order_number).slice(-3)}`;
      const bagLabel = buildAddonBagLabel(parentLabel, sku.name, quantity);
      const orderNumber = generateOrderNumber(now);
      const breakdown = {
        subtotalPaise: price.subtotalPaise,
        packagingPaise: 0,
        deliveryFeePaise: 0,
        platformFeePaise: 0,
        surgePaise: 0,
        taxPaise: price.foodTaxPaise,
        discountPaise: 0,
        tipPaise: 0,
        foodTaxPaise: price.foodTaxPaise,
        foodDiscountPaise: 0,
        payablePaise: price.payablePaise,
      };
      const items = [
        {
          menuItemId: sku.id,
          name: sku.name,
          selectedOptionNames: ["Add-on"],
          quantity,
          basePricePaise: sku.price_paise,
          optionsPricePaise: 0,
          lineTotalPaise: price.subtotalPaise,
        },
      ];
      const childRes = await client.query(
        `INSERT INTO orders
           (id, order_number, customer_id, restaurant_id, delivery_address_id, items_json, breakdown_json,
            fulfillment_state, payment_status, payable_paise, delivery_otp, pickup_otp,
            promised_delivery_at, parent_order_id, order_type, acquisition_channel,
            commission_paise, merchant_order_fee_paise, merchant_net_payout_paise,
            addon_gross_margin_paise, bag_label, accepted_at, slot_cutoff_at)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, 'ACCEPTED', 'CAPTURED', $7, $8, $9, $10, $11,
                 'ADDON', $12, 0, 0, $13, $14, $15, NOW(), $16)
         RETURNING *`,
        [
          orderNumber,
          parent.customer_id,
          parent.restaurant_id,
          parent.delivery_address_id,
          JSON.stringify(items),
          JSON.stringify(breakdown),
          price.payablePaise,
          parent.delivery_otp,
          parent.pickup_otp,
          parent.promised_delivery_at,
          parent.id,
          parent.acquisition_channel,
          price.subtotalPaise,
          price.grossMarginPaise,
          bagLabel,
          parent.slot_cutoff_at,
        ]
      );
      const child = childRes.rows[0];
      const paymentRes = await client.query(
        `INSERT INTO payments (id, order_id, provider_payment_id, status, amount_paise, currency)
         VALUES (gen_random_uuid(), $1, $2, 'CAPTURED', $3, 'INR') RETURNING id`,
        [child.id, `ADDON:${child.id}`, price.payablePaise]
      );
      await LedgerRepository.postTransactionWithClient(client, {
        orderId: child.id,
        paymentId: paymentRes.rows[0].id,
        effectType: "CAPTURE",
        entries: LedgerEngine.buildOrderCaptureEntries({
          payablePaise: price.payablePaise,
          subtotalPaise: price.subtotalPaise,
          deliveryFeePaise: 0,
          platformFeePaise: 0,
          packagingPaise: 0,
          taxPaise: price.foodTaxPaise,
          discountPaise: 0,
          commissionRateBasisPoints: 0,
          merchantOrderFeePaise: 0,
        }),
      });
      await client.query(`UPDATE orders SET bag_label = $2, updated_at = NOW() WHERE id = $1`, [parent.id, bagLabel]);
      return { order: child, bagLabel, price };
    });
  }
}
